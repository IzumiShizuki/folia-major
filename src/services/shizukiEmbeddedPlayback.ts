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
  if (!isShizukiEmbedSurface() || typeof window === 'undefined') return false;
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

export const sendEmbeddedTrackIntent = (track: unknown): boolean => postToSite({
  type: 'shizuki:playback-intent',
  track,
  positionMs: 0,
  playing: true,
});
