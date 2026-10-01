// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installShizukiExternalBridge } from '../../src/shizukiExternalBridge';
import { sendEmbeddedPlaybackCommand } from '../../src/services/shizukiEmbeddedPlayback';
import { currentTime, lyricCurrentTime } from '../../src/stores/motionSignals';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { PlayerState } from '../../src/types';
import { getEmbeddedSourceContext, resetEmbeddedWorkspaceForTests, retainEmbeddedSourceContext } from '../../src/services/embeddedWorkspaceNavigation';
import { useCollectionNavigationStore } from '../../src/stores/useCollectionNavigationStore';

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
    useCollectionNavigationStore.getState().clear();
    resetEmbeddedWorkspaceForTests();
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
      data: { type: 'shizuki:navigate', protocolVersion: 1, requestId: 2000, active: true, view: 'player' },
    }));
    postMessage.mockClear();

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
    const projectedSong = usePlaybackStore.getState().currentSong;
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
    expect(usePlaybackStore.getState().currentSong).toBe(projectedSong);
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

  it('keeps queue identity and native browsing context stable across follow-clock snapshots', () => {
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    installShizukiExternalBridge();
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:navigate', protocolVersion: 1, requestId: 2001, active: true, view: 'lattice' },
    }));
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P1', name: 'P1',
    }, 'home');
    const session = {
      version: 10,
      track: { id: 'opaque-b', name: 'B', providerId: 'qq', sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'opaque-b' }, queueEntryId: 'entry-b' },
      queue: [
        { id: 'opaque-a', name: 'A', providerId: 'qq', sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'opaque-a' }, queueEntryId: 'entry-a' },
        { id: 'opaque-b', name: 'B', providerId: 'qq', sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'opaque-b' }, queueEntryId: 'entry-b' },
      ],
      sourceContext: { kind: 'collection', collection: { source: 'online', providerId: 'qq', type: 'playlist', id: 'P1', name: 'P1' } },
      playlist: null,
      lyrics: [], lyricRenderMode: 'original', lyricIndex: -1,
      positionMs: 8000, durationMs: 90000, playing: true,
    };
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'shizuki:follow-playback', session } }));

    const originalQueue = usePlaybackStore.getState().playQueue;
    const originalSong = usePlaybackStore.getState().currentSong;
    expect(usePlaybackStore.getState().currentSong?.id).toBe('opaque-b');
    expect(usePlaybackStore.getState().playQueue.map((song) => (song as { queueEntryId?: string }).queueEntryId))
      .toEqual(['entry-a', 'entry-b']);
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2',
    }, 'home');
    retainEmbeddedSourceContext({
      kind: 'collection', collection: { source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2' },
    });

    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'shizuki:follow-playback', session: { ...session, version: 11, positionMs: 9000 } },
    }));

    expect(usePlaybackStore.getState().playQueue).toBe(originalQueue);
    expect(usePlaybackStore.getState().currentSong).toBe(originalSong);
    expect(getEmbeddedSourceContext()?.collection?.id).toBe('P2');
    expect(useCollectionNavigationStore.getState().snapshot?.stack.at(-1)?.id).toBe('P2');
  });
});
