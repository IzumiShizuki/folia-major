// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePlaybackQueueController } from '../../src/hooks/usePlaybackQueueController';
import { useCollectionNavigationStore } from '../../src/stores/useCollectionNavigationStore';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { applyEmbeddedHostNavigation, resetEmbeddedWorkspaceForTests } from '../../src/services/embeddedWorkspaceNavigation';
import { PlayerState, type SongResult } from '../../src/types';
import type { PlaybackNavigationOptions } from '../../src/types/appPlayback';

let reactRoot: Root | null = null;
let playSelected: ((song: SongResult, queue: SongResult[], isFm: boolean, options?: PlaybackNavigationOptions) => Promise<void>) | null = null;
let hostRequestId = 800;

const activateEmbed = () => {
  expect(applyEmbeddedHostNavigation({ protocolVersion: 1, requestId: hostRequestId++, active: true, view: 'lattice' }).ok).toBe(true);
};

const song = (id: string | number, providerId: string, name: string): SongResult => ({
  id, name, artists: [{ id: 1, name: 'Artist' }], album: { id: 1, name: 'Album' }, durationMs: 120000,
  sourceRef: { kind: 'online', providerId: providerId as 'netease' | 'qq', mediaId: String(id) },
});

const Probe = () => {
  const controller = usePlaybackQueueController({} as never);
  playSelected = controller.playSong;
  return createElement('div');
};

const mount = async () => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  reactRoot = createRoot(host);
  await act(async () => { reactRoot?.render(createElement(Probe)); });
};

describe('embedded queue controller selection handoff', () => {
  afterEach(async () => {
    if (reactRoot) await act(async () => { reactRoot?.unmount(); });
    reactRoot = null;
    playSelected = null;
    document.body.replaceChildren();
    useCollectionNavigationStore.getState().clear();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, lyrics: null, duration: 0,
      playerState: PlayerState.IDLE, currentLineIndex: -1, playQueue: [] });
    resetEmbeddedWorkspaceForTests();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps repeated wall selections on the existing queue with exact provider-aware slots', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    const queue = [song(42, 'netease', 'A'), song(42, 'qq', 'B'), song('opaque-3', 'qq', 'C')];
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    await mount();

    await act(async () => {
      await playSelected?.(queue[1], queue, false, {
        embeddedSelectionIndex: 1,
        embeddedSelectionView: 'lattice',
      });
      await playSelected?.(queue[2], queue, false, {
        embeddedSelectionIndex: 2,
        embeddedSelectionView: 'lattice',
      });
    });

    expect(postMessage).toHaveBeenCalledTimes(2);
    const [firstMessage] = postMessage.mock.calls[0];
    const [secondMessage] = postMessage.mock.calls[1];
    expect(firstMessage).toMatchObject({
      type: 'shizuki:playback-intent',
      track: { id: '42', provider: 'qq', providerId: 'qq', trackId: '42' },
      selection: {
        kind: 'track', queuePolicy: 'preserve-or-insert', selectedIndex: 1, view: 'lattice',
        queueEntryId: 'qq:42@1',
        sourceContext: { kind: 'collection', collection: { source: 'online', providerId: 'qq', type: 'playlist', id: 'P2' } },
      },
    });
    expect(secondMessage).toMatchObject({
      track: { id: 'opaque-3', provider: 'qq', trackId: 'opaque-3' },
      selection: { kind: 'track', queuePolicy: 'preserve-or-insert', selectedIndex: 2, view: 'lattice', queueEntryId: 'qq:opaque-3@2' },
    });
    expect((firstMessage as { selection: { tracks?: unknown[] } }).selection.tracks).toBeUndefined();
    expect((secondMessage as { selection: { tracks?: unknown[] } }).selection.tracks).toBeUndefined();
    expect(usePlaybackStore.getState().audioSrc).toBeNull();
  });

  it('replaces the queue for a native collection-detail selection and starts from its real selected slot', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    const queue = [song(42, 'netease', 'A'), song(42, 'qq', 'B'), song('opaque-3', 'qq', 'C')];
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    await mount();

    await act(async () => {
      await playSelected?.(queue[1], queue, false, {
        embeddedCollectionSelection: true,
        embeddedSelectionIndex: 1,
        embeddedSelectionView: 'lattice',
      });
    });

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'shizuki:playback-intent',
      selection: {
        kind: 'collection', queuePolicy: 'replace', selectedIndex: 1, queueEntryId: 'qq:42@1',
        view: 'lattice', tracks: [
          { id: '42', providerId: 'netease', queueEntryId: 'netease:42@0' },
          { id: '42', providerId: 'qq', queueEntryId: 'qq:42@1' },
          { id: 'opaque-3', providerId: 'qq', queueEntryId: 'qq:opaque-3@2' },
        ],
      },
    });
  });

  it('keeps a song-only shortcut on the host queue-preserve path', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    const selected = song('site-track', 'netease', 'Shortcut');
    await mount();

    await act(async () => { await playSelected?.(selected, [], false); });

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'shizuki:playback-intent', track: { id: 'site-track', providerId: 'netease' },
      selection: { kind: 'track', queuePolicy: 'preserve-or-insert', sourceContext: { kind: 'queue' }, view: 'player' },
    });
  });

  it('does not mistake a single shortcut for native collection playback when a collection snapshot is open', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    usePlaybackStore.setState({ playQueue: [song('existing', 'netease', 'Existing')] });
    await mount();

    await act(async () => { await playSelected?.(song('shortcut-id', 'netease', 'Shortcut'), [], false); });

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'shizuki:playback-intent',
      selection: {
        kind: 'track', queuePolicy: 'preserve-or-insert', view: 'player',
        sourceContext: { kind: 'collection', collection: { id: 'P2', providerId: 'qq' } },
      },
    });
    const shortcutSelection = (postMessage.mock.calls[0]?.[0] as { selection: { tracks?: unknown[]; selectedIndex?: number } }).selection;
    expect(shortcutSelection.tracks).toBeUndefined();
    expect(shortcutSelection.selectedIndex).toBeUndefined();
  });

  it('preserves the already-shared native queue when command-palette playback passes that same queue', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    const sharedQueue = [song(1, 'qq', 'A'), song(2, 'netease', 'B'), song(3, 'qq', 'C')]
      .map((item, index) => Object.assign(item, { queueEntryId: `shared-${index}` }));
    usePlaybackStore.setState({ playQueue: sharedQueue });
    await mount();

    await act(async () => {
      await playSelected?.(sharedQueue[1], sharedQueue, false, { shouldNavigateToPlayer: true });
    });

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'shizuki:playback-intent',
      selection: {
        kind: 'track', queuePolicy: 'preserve-or-insert', selectedIndex: 1,
        queueEntryId: 'shared-1',
        sourceContext: { kind: 'collection', collection: { id: 'P2', providerId: 'qq' } },
        view: 'player',
      },
    });
    expect((postMessage.mock.calls[0]?.[0] as { selection: { tracks?: unknown[] } }).selection.tracks).toBeUndefined();
  });

  it('replaces the source context for an explicitly selected native collection with identical queue contents', async () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    activateEmbed();
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    const sharedQueue = [song(1, 'qq', 'A'), song(2, 'netease', 'B'), song(3, 'qq', 'C')]
      .map((item, index) => Object.assign(item, { queueEntryId: `shared-${index}` }));
    usePlaybackStore.setState({ playQueue: sharedQueue });
    await mount();

    await act(async () => {
      await playSelected?.(sharedQueue[1], sharedQueue, false, {
        embeddedCollectionSelection: true,
        embeddedSelectionIndex: 1,
        embeddedSelectionView: 'lattice',
      });
    });

    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'shizuki:playback-intent',
      selection: {
        kind: 'collection', queuePolicy: 'replace', selectedIndex: 1,
        queueEntryId: 'shared-1', view: 'lattice',
        sourceContext: { kind: 'collection', collection: { id: 'P2', providerId: 'qq' } },
        tracks: [
          { id: '1', providerId: 'qq', queueEntryId: 'shared-0' },
          { id: '2', providerId: 'netease', queueEntryId: 'shared-1' },
          { id: '3', providerId: 'qq', queueEntryId: 'shared-2' },
        ],
      },
    });
  });
});
