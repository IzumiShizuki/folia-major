import type { AppView } from '../stores/useAppViewStore';
import { useAppViewStore } from '../stores/useAppViewStore';
import { useCollectionNavigationStore, type CollectionNavigationSnapshot } from '../stores/useCollectionNavigationStore';
import { isShizukiEmbedSurface } from './shizukiEmbeddedPlayback';
import { isEmbeddedWorkspaceRuntimeActive, setEmbeddedWorkspaceRuntimeActive } from './embeddedWorkspaceRuntime';

export type EmbeddedWorkspaceView = Extract<AppView, 'home' | 'player' | 'lattice'>;
export type EmbeddedCollectionRef = {
  source: 'online' | 'local' | 'navidrome';
  providerId?: string;
  type: string;
  id: string;
  name?: string;
  sitePlaylistCode?: string;
};
export type EmbeddedSourceContext = {
  kind: 'collection' | 'queue' | 'single';
  collection?: EmbeddedCollectionRef;
  sitePlaylistCode?: string;
};

type EmbeddedEntry = {
  view: EmbeddedWorkspaceView;
  collection: CollectionNavigationSnapshot | null;
  sourceContext: EmbeddedSourceContext | null;
};
type HostNavigationRequest = {
  protocolVersion: 1;
  requestId: number;
  view: EmbeddedWorkspaceView;
  active: boolean;
  returnTarget?: unknown;
  sourceContext?: unknown;
};

let latestHostRequestId = -1;
let generatedRequestId = 0;
let sourceContext: EmbeddedSourceContext | null = null;
let playbackReturn: EmbeddedEntry | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const normalizeCollectionRef = (value: unknown): EmbeddedCollectionRef | undefined => {
  if (!isRecord(value)) return undefined;
  const source = value.source;
  const id = String(value.id ?? '').trim();
  const type = String(value.type ?? '').trim();
  if (!id || !type || !['online', 'local', 'navidrome'].includes(String(source))) return undefined;
  const providerId = String(value.providerId ?? '').trim();
  const name = String(value.name ?? '').trim();
  const sitePlaylistCode = String(value.sitePlaylistCode ?? '').trim();
  return {
    source: source as EmbeddedCollectionRef['source'],
    ...(providerId ? { providerId } : {}),
    type,
    id,
    ...(name ? { name } : {}),
    ...(sitePlaylistCode ? { sitePlaylistCode } : {}),
  };
};

export const normalizeEmbeddedSourceContext = (value: unknown): EmbeddedSourceContext | null => {
  if (!isRecord(value) || !['collection', 'queue', 'single'].includes(String(value.kind))) return null;
  const kind = value.kind as EmbeddedSourceContext['kind'];
  const collection = normalizeCollectionRef(value.collection);
  const sitePlaylistCode = String(value.sitePlaylistCode ?? collection?.sitePlaylistCode ?? '').trim();
  return {
    kind,
    ...(collection ? { collection } : {}),
    ...(sitePlaylistCode ? { sitePlaylistCode } : {}),
  };
};

const captureEntry = (): EmbeddedEntry => ({
  view: useAppViewStore.getState().view as EmbeddedWorkspaceView,
  collection: useCollectionNavigationStore.getState().snapshot,
  sourceContext,
});

const matchesNativeCollection = (context: EmbeddedSourceContext | null): boolean => {
  const ref = context?.kind === 'collection' ? context.collection : undefined;
  if (!ref) return false;
  const current = useCollectionNavigationStore.getState().snapshot;
  const activeCollection = current?.stack[current.stack.length - 1];
  return Boolean(activeCollection && activeCollection.source === ref.source
    && String(activeCollection.id) === ref.id && activeCollection.type === ref.type
    && ('providerId' in activeCollection ? activeCollection.providerId : undefined) === ref.providerId);
};

export const isEmbeddedWorkspaceSurface = isShizukiEmbedSurface;
export const isEmbeddedWorkspaceActive = (): boolean => isShizukiEmbedSurface() && isEmbeddedWorkspaceRuntimeActive();
export const getEmbeddedSourceContext = (): EmbeddedSourceContext | null => sourceContext;

export const retainEmbeddedSourceContext = (value: unknown): void => {
  const normalized = normalizeEmbeddedSourceContext(value);
  if (!normalized) return;
  if (JSON.stringify(normalized) === JSON.stringify(sourceContext)) return;
  sourceContext = normalized;
  // A source change invalidates a stale P1 return target. Preserve only a real Folia collection
  // snapshot that still matches the host's provider-aware reference; never fabricate one from IDs.
  const matchingCollection = matchesNativeCollection(normalized);
  playbackReturn = matchingCollection
    ? { view: 'home', collection: useCollectionNavigationStore.getState().snapshot, sourceContext: normalized }
    : null;
  if (!matchingCollection && useCollectionNavigationStore.getState().snapshot?.stack.length) {
    useCollectionNavigationStore.getState().clear();
  }
};

export const navigateEmbeddedWorkspace = (
  view: EmbeddedWorkspaceView,
  options: { sourceContext?: unknown; returnTarget?: unknown; recordCurrent?: boolean } = {},
): boolean => {
  if (!isShizukiEmbedSurface() || !isEmbeddedWorkspaceRuntimeActive()) return false;
  const context = normalizeEmbeddedSourceContext(options.sourceContext);
  if (context) retainEmbeddedSourceContext(context);
  if (options.recordCurrent !== false && (view === 'player' || view === 'lattice')) {
    const current = captureEntry();
    if (!playbackReturn && matchesNativeCollection(sourceContext)) {
      playbackReturn = { ...current, view: 'home' };
    } else if (!playbackReturn && !matchesNativeCollection(sourceContext)
      && current.view === 'lattice' && view === 'player') {
      playbackReturn = current;
    }
  }
  useAppViewStore.getState().setView(view);
  return true;
};

export const applyEmbeddedHostNavigation = (value: unknown): { ok: boolean; view?: EmbeddedWorkspaceView } => {
  if (!isShizukiEmbedSurface() || !isRecord(value) || value.protocolVersion !== 1
    || !Number.isSafeInteger(value.requestId) || Number(value.requestId) <= latestHostRequestId
    || !['home', 'player', 'lattice'].includes(String(value.view)) || typeof value.active !== 'boolean') {
    return { ok: false };
  }
  latestHostRequestId = Number(value.requestId);
  if (value.active === false) {
    setEmbeddedWorkspaceRuntimeActive(false);
    return { ok: true, view: useAppViewStore.getState().view as EmbeddedWorkspaceView };
  }
  const context = normalizeEmbeddedSourceContext(value.sourceContext)
    ?? normalizeEmbeddedSourceContext(value.returnTarget);
  if (context) retainEmbeddedSourceContext(context);
  setEmbeddedWorkspaceRuntimeActive(true);
  return { ok: navigateEmbeddedWorkspace(value.view as EmbeddedWorkspaceView, {
    sourceContext: context ?? undefined,
    returnTarget: value.returnTarget,
  }), view: value.view as EmbeddedWorkspaceView };
};

export const applyLegacyEmbeddedView = (value: unknown): boolean => {
  if (!isShizukiEmbedSurface() || (value !== 'home' && value !== 'player' && value !== 'lattice')) return false;
  generatedRequestId = Math.max(generatedRequestId + 1, latestHostRequestId + 1);
  const snapshot = useCollectionNavigationStore.getState().snapshot;
  const collection = snapshot?.stack[snapshot.stack.length - 1];
  const legacyContext = collection ? {
    kind: 'collection',
    collection: {
      source: collection.source,
      ...(collection.source === 'online' ? { providerId: collection.providerId } : {}),
      type: collection.type,
      id: String(collection.id),
      name: collection.name,
    },
  } : undefined;
  return applyEmbeddedHostNavigation({
    protocolVersion: 1,
    requestId: generatedRequestId,
    view: value,
    active: true,
    ...(legacyContext ? { sourceContext: legacyContext } : {}),
  }).ok;
};

export const backEmbeddedWorkspace = (): boolean => {
  if (!isEmbeddedWorkspaceActive()) return false;
  if (playbackReturn?.collection?.stack.length) {
    useCollectionNavigationStore.getState().restore(playbackReturn.collection);
    sourceContext = playbackReturn.sourceContext ?? sourceContext;
    playbackReturn = null;
    useAppViewStore.getState().setView('home');
    return true;
  }

  const currentView = useAppViewStore.getState().view;
  const currentCollection = useCollectionNavigationStore.getState().snapshot;
  if (currentCollection?.stack.length && matchesNativeCollection(sourceContext)) {
    useAppViewStore.getState().setView('home');
    return true;
  }
  // The authoritative queue wall is the safe Folia-local return when no real native collection
  // snapshot exists. Site playlist codes and queue metadata are never treated as Folia collection IDs.
  useAppViewStore.getState().setView('lattice');
  playbackReturn = null;
  return true;
};

export const resetEmbeddedWorkspaceForTests = (): void => {
  setEmbeddedWorkspaceRuntimeActive(false);
  generatedRequestId = 0;
  sourceContext = null;
  playbackReturn = null;
};
