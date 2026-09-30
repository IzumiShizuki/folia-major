import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShizukiEmbedSurface, projectEmbeddedPlaybackClock, sendEmbeddedPlaybackCommand, sendEmbeddedTrackIntent } from '../../src/services/shizukiEmbeddedPlayback';

describe('Shizuki embedded playback relay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('projects the site clock into both Folia playback and lyric motion values', () => {
    const playbackSet = vi.fn();
    const lyricSet = vi.fn();
    expect(projectEmbeddedPlaybackClock(28.5, { set: playbackSet }, { set: lyricSet })).toBe(28.5);
    expect(playbackSet).toHaveBeenCalledWith(28.5);
    expect(lyricSet).toHaveBeenCalledWith(28.5);
    expect(projectEmbeddedPlaybackClock(Number.NaN, { set: playbackSet }, { set: lyricSet })).toBe(0);
  });

  it('relays pause and seek immediately without depending on a Folia audio source', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });

    expect(sendEmbeddedPlaybackCommand('pause')).toBe(true);
    expect(sendEmbeddedPlaybackCommand('seek', 42.25)).toBe(true);
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'shizuki:playback-command', action: 'pause' },
      { type: 'shizuki:playback-command', action: 'seek', positionMs: 42250 },
    ]);
  });

  it('sends a selected track intent without resolving it locally', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });
    const track = { id: 17, name: 'Selected' };

    expect(sendEmbeddedTrackIntent(track)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'shizuki:playback-intent', track, positionMs: 0, playing: true,
    }, '*');
  });

  it('keeps embedded mode active whenever the host root is mounted, independent of visibility', () => {
    vi.stubGlobal('document', { getElementById: () => ({ hidden: true }) });
    expect(isShizukiEmbedSurface()).toBe(true);
    vi.stubGlobal('document', { getElementById: () => null });
    expect(isShizukiEmbedSurface()).toBe(false);
  });

  it('leaves standalone Folia playback on its existing path', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal('window', { parent: { postMessage } });

    expect(sendEmbeddedPlaybackCommand('play')).toBe(false);
    expect(sendEmbeddedTrackIntent({ id: 18 })).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
