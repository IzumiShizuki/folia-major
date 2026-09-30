// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installShizukiExternalBridge } from '../../src/shizukiExternalBridge';
import { sendEmbeddedPlaybackCommand } from '../../src/services/shizukiEmbeddedPlayback';
import { currentTime, lyricCurrentTime } from '../../src/stores/motionSignals';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { PlayerState } from '../../src/types';

describe('same-document Folia playback bridge', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    usePlaybackStore.setState({
      currentSong: null,
      audioSrc: null,
      lyrics: null,
      duration: 0,
      playerState: PlayerState.IDLE,
      currentLineIndex: -1,
      playQueue: [],
    });
    currentTime.set(0);
    lyricCurrentTime.set(0);
  });

  it('projects parent sessions into the Folia clock and accepts immediate controls without echo or local audio', () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const audio = document.createElement('audio');
    audio.src = 'https://media.test/should-not-play.mp3';
    audio.pause = vi.fn();
    audio.load = vi.fn();
    root.append(audio);

    const postMessage = vi.spyOn(window, 'postMessage');
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    installShizukiExternalBridge();

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:set-lyric-color', color: '#abcdef' },
    }));
    expect(root.dataset.shizukiLyricColor).toBe('custom');
    expect(root.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('#abcdef');
    expect(document.getElementById('shizuki-folia-lyric-color-style')?.textContent)
      .toContain('[data-shizuki-folia-lyric-word-body]');

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:set-lyric-color', color: '' },
    }));
    expect(root.dataset.shizukiLyricColor).toBeUndefined();
    expect(root.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('');

    const session = {
      version: 1,
      track: { id: 7, name: 'Parent song', artists: [{ name: 'Artist' }] },
      queue: [],
      playlist: null,
      lyrics: [{ time: 0, endTime: 30, original: 'first line' }],
      lyricRenderMode: 'original',
      lyricIndex: 0,
      positionMs: 12500,
      durationMs: 60000,
      playing: true,
    };
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'shizuki:follow-playback', session } }));

    expect(currentTime.get()).toBe(12.5);
    expect(lyricCurrentTime.get()).toBe(12.5);
    expect(usePlaybackStore.getState().currentSong?.id).toBe(7);
    expect(audio.pause).toHaveBeenCalledOnce();
    expect(audio.getAttribute('src') ?? '').toBe('');
    expect(postMessage).not.toHaveBeenCalled();

    const projectedLyrics = usePlaybackStore.getState().lyrics;
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:follow-playback', session: { ...session, version: 2, positionMs: 18000 } },
    }));
    expect(currentTime.get()).toBe(18);
    expect(lyricCurrentTime.get()).toBe(18);
    expect(usePlaybackStore.getState().lyrics).toBe(projectedLyrics);
    expect(audio.pause).toHaveBeenCalledTimes(2);
    expect(postMessage).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:sync-clock', positionMs: 20500, playing: false },
    }));
    expect(currentTime.get()).toBe(20.5);
    expect(lyricCurrentTime.get()).toBe(20.5);
    expect(postMessage).not.toHaveBeenCalled();

    expect(sendEmbeddedPlaybackCommand('pause')).toBe(true);
    expect(sendEmbeddedPlaybackCommand('seek', 22.25)).toBe(true);
    expect(postMessage).toHaveBeenNthCalledWith(1, { type: 'shizuki:playback-command', action: 'pause' }, '*');
    expect(postMessage).toHaveBeenNthCalledWith(2, { type: 'shizuki:playback-command', action: 'seek', positionMs: 22250 }, '*');

    const progress = document.createElement('input');
    progress.type = 'range';
    progress.min = '0';
    progress.max = '60';
    progress.value = '24';
    root.append(progress);
    progress.dispatchEvent(new Event('input', { bubbles: true }));
    expect(postMessage).toHaveBeenNthCalledWith(3, { type: 'shizuki:playback-command', action: 'seek', positionMs: 24000 }, '*');
    expect(audio.pause).toHaveBeenCalledTimes(2);
  });
});
