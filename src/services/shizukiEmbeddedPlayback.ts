import { getPlaybackSourceRef } from '../utils/appPlaybackGuards';
import type { SongResult } from '../types';
import { isEmbeddedWorkspaceRuntimeActive } from './embeddedWorkspaceRuntime';

type PlaybackCommand = {
  type: 'shizuki:playback-command';
  action: 'play' | 'pause' | 'seek' | 'next' | 'previous';
  positionMs?: number;
};

type PlaybackIntent = {
  type: 'shizuki:playback-intent';
  track: unknown;
  positionMs: number;
  playing: true;
  selection?: EmbeddedPlaybackSelection;
};

export type EmbeddedPlaybackSelection = {
  kind: 'track' | 'collection' | 'shortcut';
  queuePolicy: 'replace' | 'preserve-or-insert';
  sourceContext?: unknown;
  selectedIndex?: number;
  queueEntryId?: string;
  tracks?: unknown[];
  view?: 'lattice' | 'player';
};

type PlaybackClock = { set: (seconds: number) => void };

export const projectEmbeddedPlaybackClock = (
  positionSec: number,
  playbackClock: PlaybackClock,
  lyricClock: PlaybackClock,
): number => {
  const safePosition = Number.isFinite(positionSec) ? Math.max(0, positionSec) : 0;
  playbackClock.set(safePosition);
  lyricClock.set(safePosition);
  return safePosition;
};

export const isShizukiEmbedSurface = (): boolean => (
  typeof document !== 'undefined' && document.getElementById('folia-embed-root') !== null
);

const postToSite = (message: PlaybackCommand | PlaybackIntent): boolean => {
  if (!isShizukiEmbedSurface() || !isEmbeddedWorkspaceRuntimeActive() || typeof window === 'undefined') return false;
  try {
    window.parent.postMessage(message, '*');
    return true;
  } catch {
    return false;
  }
};

export const sendEmbeddedPlaybackCommand = (
  action: PlaybackCommand['action'],
  positionSec?: number,
): boolean => postToSite({
  type: 'shizuki:playback-command',
  action,
  ...(action === 'seek' ? { positionMs: Math.max(0, Math.round(Number(positionSec || 0) * 1000)) } : {}),
});

export const normalizeEmbeddedTrackRef = (track: unknown): unknown => {
  if (!track || typeof track !== 'object' || Array.isArray(track)) return track;
  const value = track as Record<string, unknown>;
  const rawSourceRef = value.sourceRef;
  const explicitProvider = String(value.providerId ?? value.provider ?? '').trim();
  const rawId = value.trackId ?? value.track_id ?? value.id;
  const sourceRef = rawSourceRef && typeof rawSourceRef === 'object'
    ? rawSourceRef
    : explicitProvider && rawId !== undefined
      ? { kind: 'online', providerId: explicitProvider, mediaId: String(rawId) }
      : getPlaybackSourceRef(value as unknown as SongResult);
  const resolvedSource = sourceRef as ReturnType<typeof getPlaybackSourceRef>;
  const id = resolvedSource.mediaId || value.trackId || value.track_id || value.id;
  const provider = resolvedSource.kind === 'online' ? resolvedSource.providerId : resolvedSource.kind;
  return {
    ...value,
    ...(id !== undefined ? { trackId: String(id), id: String(id) } : {}),
    provider: String(provider),
    providerId: String(provider),
    sourceRef: resolvedSource,
  };
};

const embeddedQueueEntryId = (track: unknown, index: number): string => {
  if (track && typeof track === 'object' && !Array.isArray(track)) {
    const value = track as Record<string, unknown>;
    const existing = String(value.queueEntryId ?? value.entryId ?? '').trim();
    if (existing) return existing;
    const normalized = normalizeEmbeddedTrackRef(value) as Record<string, unknown>;
    return `${String(normalized.providerId ?? 'track')}:${String(normalized.trackId ?? index)}@${index}`;
  }
  return `track:${index}@${index}`;
};

export const sendEmbeddedTrackIntent = (track: unknown, selection?: EmbeddedPlaybackSelection): boolean => postToSite({
  type: 'shizuki:playback-intent',
  track: normalizeEmbeddedTrackRef(track),
  positionMs: 0,
  playing: true,
  ...(selection ? { selection: {
    ...selection,
    ...(Number.isInteger(selection.selectedIndex) && selection.selectedIndex! >= 0
      && Array.isArray(selection.tracks) && selection.selectedIndex! < selection.tracks.length
      ? { queueEntryId: embeddedQueueEntryId(selection.tracks[selection.selectedIndex!], selection.selectedIndex!) }
      : {}),
    ...(Array.isArray(selection.tracks)
      ? { tracks: selection.tracks.map((item, index) => ({
        ...(normalizeEmbeddedTrackRef(item) as Record<string, unknown>),
        queueEntryId: embeddedQueueEntryId(item, index),
      })) }
      : {}),
  } } : {}),
});
