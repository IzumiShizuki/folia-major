// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import Lattice from '../../src/components/app/lattice/Lattice';
import { PlayerState, type SongResult } from '../../src/types';
import { useLatticeControlsStore } from '../../src/stores/useLatticeControlsStore';
import { useMotionSettingsStore } from '../../src/stores/useMotionSettingsStore';

const lyricRuntime = vi.hoisted(() => ({ createdKeys: [] as string[], updatedKeys: [] as string[] }));

vi.mock('../../src/components/app/lattice/lyrics/createLatticeLyricRuntime', () => ({
  createLatticeLyricRuntime: async (_host: HTMLElement, initial: { songKey: string }) => {
    lyricRuntime.createdKeys.push(initial.songKey);
    let attachedHost: HTMLElement | null = null;
    return {
      attach(host: HTMLElement) {
        attachedHost = host;
        host.dataset.renderedSongKey = initial.songKey;
      },
      setErrorHandler: () => undefined,
      update(input: { songKey: string }) {
        lyricRuntime.updatedKeys.push(input.songKey);
        if (attachedHost) attachedHost.dataset.renderedSongKey = input.songKey;
      },
      resize: () => undefined,
      setVisible: () => undefined,
      destroy: () => undefined,
    };
  },
}));

let reactRoot: Root | null = null;

const song = (queueEntryId: string): SongResult => ({
  id: 'same-track', name: 'Repeated song', artists: [{ id: 1, name: 'Artist' }],
  album: { id: 1, name: 'Album' }, durationMs: 180_000,
  sourceRef: { kind: 'online', providerId: 'netease', mediaId: 'same-track' },
  queueEntryId,
} as SongResult);

class TestResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

describe('mounted Lattice queue-entry identity', () => {
  afterEach(async () => {
    if (reactRoot) await act(async () => { reactRoot?.unmount(); });
    reactRoot = null;
    document.body.replaceChildren();
    lyricRuntime.createdKeys.length = 0;
    lyricRuntime.updatedKeys.length = 0;
    useLatticeControlsStore.setState({ focusCurrentSong: null, isCurrentSongPosterVisible: true });
    useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, lattice: false } }));
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    delete (globalThis as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  it('focuses the current queue slot when duplicate songs have distinct entry identities', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = TestResizeObserver as never;
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as never;
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    });
    const host = document.createElement('div');
    document.body.append(host);
    reactRoot = createRoot(host);
    useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, lattice: true } }));
    const first = song('queue-slot-a');
    const current = song('queue-slot-b');
    const playbackClock = motionValue(0);
    const lyricClock = motionValue(0);
    const togglePlayback = vi.fn();
    const playSong = vi.fn();
    const lyrics = [{ fullText: 'Lyric for the current queue entry', isChorus: false, words: [] }] as never;
    const renderLattice = (currentSong: SongResult, queue: SongResult[] = [first, current]) => createElement(Lattice, {
      controls: {
        playback: {
          prev: () => undefined, next: () => undefined, toggleLoop: () => undefined,
          shuffleQueue: () => undefined, toggleSongLike: () => undefined, isSongLiked: false,
          isFmMode: false,
        },
        loopMode: 'off', invokeCommandById: () => false, canInvokeCommandById: () => false,
      } as never,
      lyrics: null,
      lyricSource: {
        currentTime: lyricClock, currentLineIndex: 0, lines: lyrics, theme: {},
        showSubtitleTranslation: false, hideTranslationSubtitle: false, paused: true, staticMode: true,
      } as never,
      lyricKeywordColoringEnabled: false,
      currentSong,
      playerState: PlayerState.PAUSED,
      currentTime: playbackClock,
      playbackDuration: 180,
      canTogglePlayback: true,
      queue,
      isDaylight: false,
      onBack: () => undefined,
      onOpenPlayer: () => undefined,
      onPlaySong: playSong,
      onTogglePlayback: togglePlayback,
      onSeek: () => undefined,
    });

    await act(async () => {
      reactRoot?.render(renderLattice(current));
    });

    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });

    expect(useLatticeControlsStore.getState().focusCurrentSong).toBeTypeOf('function');
    await act(async () => { useLatticeControlsStore.getState().focusCurrentSong?.(); });
    const expandedCurrent = host.querySelectorAll('.lattice-poster.is-current.is-expanded');
    expect(expandedCurrent.length).toBe(1);
    expect(expandedCurrent[0]?.querySelector('.lattice-poster-badge')?.textContent).toContain('02');

    // The mounted Lattice provider must send the current queue-entry key through the real
    // LatticeLyrics consumer, so the renderer attaches to exactly the current duplicate slot.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    const currentLyrics = host.querySelector<HTMLElement>(
      '.lattice-poster.is-current.is-expanded .lattice-lyrics-canvas',
    );
    expect(currentLyrics?.dataset.renderedSongKey).toBe('queue-slot-b');
    expect(lyricRuntime.createdKeys).toContain('queue-slot-b');
    expect(host.querySelector('.lattice-poster.is-current.is-expanded .sr-only')?.textContent)
      .toBe('Lyric for the current queue entry');

    await act(async () => { reactRoot?.render(renderLattice(first)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    const switchedLyrics = host.querySelector<HTMLElement>(
      '.lattice-poster.is-current.is-expanded .lattice-lyrics-canvas',
    );
    expect(switchedLyrics?.dataset.renderedSongKey).toBe('queue-slot-a');
    expect(host.querySelector('.lattice-poster.is-current.is-expanded .sr-only')?.textContent)
      .toBe('Lyric for the current queue entry');
    expect(lyricRuntime.updatedKeys).toContain('queue-slot-a');

    await act(async () => {
      host.querySelector<HTMLButtonElement>(
        '.lattice-poster.is-current.is-expanded .lattice-transport-button',
      )?.click();
    });
    expect(togglePlayback).toHaveBeenCalledTimes(1);
    expect(playSong).not.toHaveBeenCalled();

    await act(async () => { host.querySelector<HTMLElement>('.lattice-poster:not(.is-current)')?.click(); });
    await act(async () => {
      host.querySelector<HTMLButtonElement>(
        '.lattice-poster.is-expanded:not(.is-current) .lattice-transport-button',
      )?.click();
    });
    expect(playSong).toHaveBeenCalledTimes(1);
    expect(playSong).toHaveBeenCalledWith(current, [first, current], 1);
    expect(togglePlayback).toHaveBeenCalledTimes(1);

    // Standalone/legacy queues have no queue-slot metadata and continue to use playback identity.
    const standaloneSong = song('temporary-entry');
    delete (standaloneSong as SongResult & { queueEntryId?: string }).queueEntryId;
    await act(async () => { reactRoot?.render(renderLattice(standaloneSong, [standaloneSong])); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(useLatticeControlsStore.getState().focusCurrentSong).toBeTypeOf('function');
    const standaloneCurrent = host.querySelector('.lattice-poster.is-current.is-expanded');
    expect(standaloneCurrent?.querySelector('.lattice-poster-badge')?.textContent).toContain('01');
  });
});
