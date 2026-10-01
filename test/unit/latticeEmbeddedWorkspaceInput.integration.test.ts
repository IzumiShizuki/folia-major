// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import Lattice from '../../src/components/app/lattice/Lattice';
import { currentTime } from '../../src/stores/motionSignals';
import { PlayerState, type SongResult } from '../../src/types';
import { applyEmbeddedHostNavigation, resetEmbeddedWorkspaceForTests } from '../../src/services/embeddedWorkspaceNavigation';

let reactRoot: Root | null = null;
const song = (id: string): SongResult => ({
  id,
  name: `Track ${id}`,
  artists: [{ id: 1, name: 'Artist' }],
  album: { id: 1, name: 'Album' },
  durationMs: 90000,
  sourceRef: { kind: 'online', providerId: 'qq', mediaId: id },
});

const renderLattice = (currentSong: SongResult, onBack: () => void) => createElement(Lattice, {
  controls: {
    playback: {
      prev: vi.fn(), next: vi.fn(), toggleLoop: vi.fn(), shuffleQueue: vi.fn(),
      toggleSongLike: vi.fn(), isSongLiked: vi.fn(() => false), isFmMode: false,
    },
    loopMode: 'off', invokeCommandById: vi.fn(), canInvokeCommandById: vi.fn(() => false),
  },
  lyrics: null,
  lyricSource: { lyrics: null, translationLyrics: null, romajiLyrics: null },
  lyricKeywordColoringEnabled: false,
  currentSong,
  playerState: PlayerState.PLAYING,
  currentTime,
  playbackDuration: 90,
  canTogglePlayback: true,
  queue: [song('B'), song('C')],
  isDaylight: false,
  onBack,
  onOpenPlayer: vi.fn(),
  onPlaySong: vi.fn(),
  onTogglePlayback: vi.fn(),
  onSeek: vi.fn(),
} as never);

describe('mounted Lattice input after an embedded playback update', () => {
  afterEach(async () => {
    if (reactRoot) await act(async () => { reactRoot?.unmount(); });
    reactRoot = null;
    document.body.replaceChildren();
    resetEmbeddedWorkspaceForTests();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
  });

  it('keeps the mounted wall click and keyboard routes live while active and dormant while parked', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.stubGlobal('ResizeObserver', class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{ target, contentRect: { width: 1280, height: 720 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    });
    const embed = document.createElement('div');
    embed.id = 'folia-embed-root';
    document.body.append(embed);
    const host = document.createElement('div');
    document.body.append(host);
    reactRoot = createRoot(host);
    const onBack = vi.fn();

    expect(applyEmbeddedHostNavigation({ protocolVersion: 1, requestId: 900, active: true, view: 'lattice' }).ok).toBe(true);
    await act(async () => { reactRoot?.render(renderLattice(song('B'), onBack)); });
    await act(async () => { host.querySelector<HTMLButtonElement>('.lattice-back')?.click(); });
    expect(onBack).toHaveBeenCalledOnce();

    const activeShortcut = new KeyboardEvent('keydown', {
      code: 'KeyB', key: 'b', ctrlKey: true, bubbles: true, cancelable: true,
    });
    await act(async () => { window.dispatchEvent(activeShortcut); });
    expect(activeShortcut.defaultPrevented).toBe(true);
    expect(onBack).toHaveBeenCalledTimes(2);

    expect(applyEmbeddedHostNavigation({ protocolVersion: 1, requestId: 901, active: false, view: 'lattice' }).ok).toBe(true);
    const parkedShortcut = new KeyboardEvent('keydown', {
      code: 'KeyB', key: 'b', ctrlKey: true, bubbles: true, cancelable: true,
    });
    await act(async () => { window.dispatchEvent(parkedShortcut); });
    expect(parkedShortcut.defaultPrevented).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
