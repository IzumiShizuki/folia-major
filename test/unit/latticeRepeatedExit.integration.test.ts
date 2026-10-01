// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import Lattice from '../../src/components/app/lattice/Lattice';
import LatticePresenceLayer from '../../src/components/app/lattice/LatticePresenceLayer';
import { useLatticeExitGate } from '../../src/hooks/useLatticeExitGate';
import { useAppViewStore } from '../../src/stores/useAppViewStore';
import { useLatticeControlsStore } from '../../src/stores/useLatticeControlsStore';
import { useLatticeSettingsStore } from '../../src/stores/useLatticeSettingsStore';
import { useMotionSettingsStore } from '../../src/stores/useMotionSettingsStore';
import { PlayerState, type SongResult } from '../../src/types';

let root: Root | null = null;
let changeView: ((view: 'lattice' | 'player') => void) | null = null;
let changeSong: ((song: SongResult) => void) | null = null;
let exitCompletions = 0;
let exitViews: string[] = [];

const queue: SongResult[] = Array.from({ length: 84 }, (_, index) => {
  const id = ['A', 'B', 'C'][index] ?? `track-${index}`;
  return { id, name: id, artists: [], album: { id: `album-${id}`, name: 'Album' }, durationMs: 180_000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: id }, queueEntryId: `entry-${id}` } as SongResult;
});

class TestResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 5000, height: 5000 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  disconnect() {}
  unobserve() {}
}

const LifecycleProbe = () => {
  const [view, setView] = useState<'lattice' | 'player'>('lattice');
  const [currentSong, setCurrentSong] = useState(queue[1]!);
  changeView = next => {
    useAppViewStore.setState({ view: next });
    setView(next);
  };
  changeSong = setCurrentSong;
  const { hasLatticeExited, onLatticeExitComplete } = useLatticeExitGate(view);
  return createElement('main', { 'data-view': view, 'data-exited': String(hasLatticeExited) },
    createElement(LatticePresenceLayer, {
      active: view === 'lattice',
      duration: 0.62,
      onExitComplete: () => { exitCompletions += 1; exitViews.push(useAppViewStore.getState().view); onLatticeExitComplete(); },
      children: view === 'lattice' ? createElement(Lattice, {
        controls: {
          playback: { prev: () => undefined, next: () => undefined, toggleLoop: () => undefined,
            shuffleQueue: () => undefined, toggleSongLike: () => undefined, isSongLiked: false, isFmMode: false },
          loopMode: 'off', invokeCommandById: () => false, canInvokeCommandById: () => false,
        } as never,
        lyrics: null,
        lyricSource: { currentTime: motionValue(0), currentLineIndex: -1, lines: [], theme: {},
          showSubtitleTranslation: false, hideTranslationSubtitle: false, paused: true, staticMode: true } as never,
        lyricKeywordColoringEnabled: false,
        currentSong,
        playerState: PlayerState.PAUSED,
        currentTime: motionValue(0),
        playbackDuration: 180,
        canTogglePlayback: true,
        queue,
        isDaylight: false,
        onBack: () => undefined,
        onOpenPlayer: () => undefined,
        onPlaySong: () => undefined,
        onTogglePlayback: () => undefined,
        onSeek: () => undefined,
      }) : null,
    }),
    view === 'player' && hasLatticeExited
      ? createElement('button', { 'data-testid': 'player-controls' }, 'Player controls')
      : null,
  );
};

const waitForPlayer = async (completionCount: number) => {
  await vi.waitFor(() => {
    const layer = document.querySelector<HTMLElement>('.absolute.inset-0.z-10');
    expect(exitCompletions,
      `completed=${exitCompletions}/${completionCount}; opacity=${layer?.style.opacity}; pointerEvents=${layer?.style.pointerEvents}; posters=${document.querySelectorAll('.lattice-poster').length}`,
    ).toBe(completionCount);
    expect(document.querySelector('[data-testid="player-controls"]'),
      `view=${document.querySelector('main')?.getAttribute('data-view')} exited=${document.querySelector('main')?.getAttribute('data-exited')} completions=${exitCompletions} exitViews=${exitViews.join(',')}`,
    ).not.toBeNull();
  }, { timeout: 1500 });
};

const waitForLattice = async () => {
  await act(async () => {
    await vi.waitFor(() => {
      const layer = document.querySelector<HTMLElement>('.absolute.inset-0.z-10');
      expect(layer).not.toBeNull();
      expect(Number(layer?.style.opacity ?? '1')).toBeGreaterThan(0.95);
      expect(layer?.style.pointerEvents).toBe('auto');
    }, { timeout: 1500 });
  });
};

describe('repeated Lattice exits after queue focus changes', () => {
  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    changeView = null;
    changeSong = null;
    exitCompletions = 0;
    exitViews = [];
    document.body.replaceChildren();
    useAppViewStore.setState({ view: 'home' });
    useLatticeControlsStore.setState({ focusCurrentSong: null, isCurrentSongPosterVisible: true });
    useLatticeSettingsStore.setState({ autoFocusOnSongChange: true });
    useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, lattice: false } }));
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    delete (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    delete (globalThis as unknown as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver;
    delete (window as unknown as { matchMedia?: typeof window.matchMedia }).matchMedia;
  });

  it('finishes two B exits and a C exit after queue-slot auto-focus reflows the wall', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver = TestResizeObserver as never;
    (globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    } as never;
    (window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addEventListener: () => undefined, removeEventListener: () => undefined,
      addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
    });
    useMotionSettingsStore.setState(state => ({ reducedMotionSurfaces: { ...state.reducedMotionSurfaces, lattice: false } }));

    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root?.render(createElement(LifecycleProbe)); });
    await act(async () => {
      await vi.waitFor(() => expect(useLatticeControlsStore.getState().focusCurrentSong).toBeTypeOf('function'));
    });
    expect(host.querySelectorAll('.lattice-poster').length).toBeGreaterThanOrEqual(queue.length);

    // B enters the player and returns to the same P2 wall for a second full cycle.
    await act(async () => { changeView?.('player'); });
    await waitForPlayer(1);
    await act(async () => { changeView?.('lattice'); });
    await waitForLattice();
    await act(async () => { changeView?.('player'); });
    await waitForPlayer(2);

    // Returning to the wall, then switching its current slot to C, starts the real auto-focus
    // camera reflow. The final player transition begins while that queue-driven motion is live.
    await act(async () => { changeView?.('lattice'); });
    await waitForLattice();
    const world = host.querySelector<HTMLElement>('.lattice-world');
    const previousTransform = world?.style.transform;
    await act(async () => { changeSong?.(queue[2]!); });
    await vi.waitFor(() => expect(host.querySelector('.lattice-poster.is-current.is-focused')).not.toBeNull());
    await vi.waitFor(() => expect(world?.style.transform).not.toBe(previousTransform));
    await act(async () => { changeView?.('player'); });
    await waitForPlayer(3);
    expect(host.querySelector('.absolute.inset-0.z-10')).toBeNull();
  }, 15_000);
});
