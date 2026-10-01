// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { usePlaybackInteractionBridge } from '../../src/hooks/usePlaybackInteractionBridge';
import { applyEmbeddedHostNavigation, resetEmbeddedWorkspaceForTests } from '../../src/services/embeddedWorkspaceNavigation';
import { useAppViewStore } from '../../src/stores/useAppViewStore';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { PlayerState, type SongResult } from '../../src/types';

let reactRoot: Root | null = null;
const track: SongResult = {
  id: 73,
  name: 'Keyboard track',
  artists: [{ id: 1, name: 'Artist' }],
  album: { id: 1, name: 'Album' },
  durationMs: 90000,
};

const Probe = () => {
  usePlaybackInteractionBridge({
    stageActiveEntryKind: null,
    isNowPlayingStageActive: false,
    audioRef: { current: null },
    stageLyricsClockRef: { current: { startTimeSec: 0, endTimeSec: 0, baseTimeSec: 0, startedAtMs: null } },
    cyclePlayerChromeVisibilityMode: vi.fn(),
    handleNextTrack: vi.fn(),
    handlePrevTrack: vi.fn(),
    navigateBackFromPlayer: vi.fn(),
    pausePlayback: vi.fn(),
    resumePlayback: vi.fn(async () => undefined),
    syncStageLyricsClock: vi.fn(),
  });
  return createElement('div');
};

describe('embedded player keyboard boundary', () => {
  afterEach(async () => {
    if (reactRoot) await act(async () => { reactRoot?.unmount(); });
    reactRoot = null;
    document.body.replaceChildren();
    useAppViewStore.setState({ view: 'home', isPanelOpen: false });
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, lyrics: null, duration: 0,
      playerState: PlayerState.IDLE, currentLineIndex: -1, playQueue: [] });
    resetEmbeddedWorkspaceForTests();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('relays Space while active, then leaves the same key untouched when parked', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const postMessage = vi.fn();
    vi.stubGlobal('window', Object.assign(window, { parent: { postMessage } }));
    useAppViewStore.setState({ view: 'player', isPanelOpen: false });
    usePlaybackStore.setState({ currentSong: track, audioSrc: null, playerState: PlayerState.PLAYING, duration: 90 });
    expect(applyEmbeddedHostNavigation({ protocolVersion: 1, requestId: 700, active: true, view: 'player' }).ok).toBe(true);
    const host = document.createElement('div');
    document.body.append(host);
    reactRoot = createRoot(host);
    await act(async () => { reactRoot?.render(createElement(Probe)); });

    const activeSpace = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    await act(async () => { window.dispatchEvent(activeSpace); });
    expect(activeSpace.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenLastCalledWith({ type: 'shizuki:playback-command', action: 'pause' }, '*');

    expect(applyEmbeddedHostNavigation({ protocolVersion: 1, requestId: 701, active: false, view: 'player' }).ok).toBe(true);
    const parkedSpace = new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true });
    await act(async () => { window.dispatchEvent(parkedSpace); });
    expect(parkedSpace.defaultPrevented).toBe(false);
    expect(postMessage).toHaveBeenCalledTimes(1);
  });
});
