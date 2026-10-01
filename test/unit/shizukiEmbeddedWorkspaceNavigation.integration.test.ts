// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installShizukiExternalBridge } from '../../src/shizukiExternalBridge';
import { useAppNavigation } from '../../src/hooks/useAppNavigation';
import { useAppViewStore } from '../../src/stores/useAppViewStore';
import { useCollectionNavigationStore } from '../../src/stores/useCollectionNavigationStore';
import { usePlaybackStore } from '../../src/stores/usePlaybackStore';
import { PlayerState } from '../../src/types';
import { resetEmbeddedWorkspaceForTests } from '../../src/services/embeddedWorkspaceNavigation';

let reactRoot: Root | null = null;
let navigation: ReturnType<typeof useAppNavigation> | null = null;

const Probe = () => {
  navigation = useAppNavigation();
  return createElement('div', null,
    createElement('button', {
      id: 'return-to-collection',
      onClick: () => navigation?.navigateBackFromLattice(),
    }, 'Return'),
    createElement('button', {
      id: 'open-player',
      onClick: () => navigation?.navigateToPlayer(),
    }, 'Open player'),
    createElement('button', {
      id: 'player-back',
      onClick: () => navigation?.navigateBackFromPlayer(),
    }, 'Player back'),
  );
};

const mountNavigation = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  reactRoot = createRoot(host);
  await act(async () => { reactRoot?.render(createElement(Probe)); });
};

describe('embedded workspace navigation boundary', () => {
  beforeEach(() => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(async () => {
    if (reactRoot) await act(async () => { reactRoot?.unmount(); });
    reactRoot = null;
    navigation = null;
    document.body.replaceChildren();
    useAppViewStore.setState({ view: 'home' });
    useCollectionNavigationStore.getState().clear();
    usePlaybackStore.setState({ currentSong: null, audioSrc: null, lyrics: null, duration: 0,
      playerState: PlayerState.IDLE, currentLineIndex: -1, playQueue: [] });
    resetEmbeddedWorkspaceForTests();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('routes the versioned host navigation request through the embedded workspace', async () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    installShizukiExternalBridge();
    await mountNavigation();
    const collection = { source: 'online', providerId: 'netease', type: 'playlist', id: 'p2', name: 'P2' } as const;
    useCollectionNavigationStore.getState().openRoot(collection, 'home');

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'shizuki:navigate', protocolVersion: 1, requestId: 4, active: true, view: 'lattice',
        returnTarget: { source: 'online', providerId: 'netease', type: 'playlist', id: 'p2', name: 'P2' },
        sourceContext: { kind: 'collection', collection: { source: 'online', providerId: 'netease',
          type: 'playlist', id: 'p2', name: 'P2' } },
      } }));
    });

    expect(useAppViewStore.getState().view).toBe('lattice');
    expect(useCollectionNavigationStore.getState().snapshot?.stack.at(-1)).toMatchObject({ id: 'p2', name: 'P2' });
  });

  it('returns to the active Folia collection without mutating host history', async () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    installShizukiExternalBridge();
    await mountNavigation();
    const collection = { source: 'online', providerId: 'netease', type: 'playlist', id: 'p2', name: 'P2' } as const;
    useCollectionNavigationStore.getState().openRoot(collection, 'home');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'shizuki:set-view', view: 'lattice' } }));
    });
    const before = { href: window.location.href, length: window.history.length, state: window.history.state };

    await act(async () => {
      document.getElementById('return-to-collection')?.click();
    });

    expect(useAppViewStore.getState().view).toBe('home');
    expect(useCollectionNavigationStore.getState().snapshot?.stack.at(-1)).toMatchObject({ id: 'p2' });
    expect({ href: window.location.href, length: window.history.length, state: window.history.state }).toEqual(before);
  });

  it('keeps one P2 return target through repeated player navigation requests', async () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    installShizukiExternalBridge();
    await mountNavigation();
    const collection = { source: 'online', providerId: 'qq', type: 'playlist', id: 'p2', name: 'P2' } as const;
    useCollectionNavigationStore.getState().openRoot(collection, 'home');
    const context = { kind: 'collection', collection };

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'shizuki:navigate', protocolVersion: 1, requestId: 100, active: true,
        view: 'lattice', sourceContext: context,
      } }));
    });
    await act(async () => { document.getElementById('open-player')?.click(); });
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'shizuki:navigate', protocolVersion: 1, requestId: 101, active: true,
        view: 'player', sourceContext: context,
      } }));
      window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'shizuki:navigate', protocolVersion: 1, requestId: 102, active: true,
        view: 'player', sourceContext: context,
      } }));
    });
    const beforeBack = { href: window.location.href, length: window.history.length, state: window.history.state };

    await act(async () => { document.getElementById('player-back')?.click(); });

    expect(useAppViewStore.getState().view).toBe('home');
    expect(useCollectionNavigationStore.getState().snapshot?.stack.at(-1)).toMatchObject({ id: 'p2' });
    expect({ href: window.location.href, length: window.history.length, state: window.history.state }).toEqual(beforeBack);
  });

  it('falls back to the Folia queue wall after the source changes away from a stale collection', async () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    installShizukiExternalBridge();
    await mountNavigation();
    useCollectionNavigationStore.getState().openRoot({
      source: 'online', providerId: 'netease', type: 'playlist', id: 'stale-p1', name: 'Stale P1',
    }, 'home');
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: {
        type: 'shizuki:navigate', protocolVersion: 1, requestId: 103, active: true,
        view: 'player', sourceContext: { kind: 'queue' },
      } }));
    });
    expect(useCollectionNavigationStore.getState().snapshot).toBeNull();

    await act(async () => { document.getElementById('player-back')?.click(); });

    expect(useAppViewStore.getState().view).toBe('lattice');
    expect(useCollectionNavigationStore.getState().snapshot).toBeNull();
  });

  it('rejects a stale request after parking and accepts the next host-lifetime request on reentry', async () => {
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    installShizukiExternalBridge();
    await mountNavigation();

    const dispatch = async (requestId: number, active: boolean, view: 'lattice' | 'player') => {
      await act(async () => {
        window.dispatchEvent(new MessageEvent('message', { data: {
          type: 'shizuki:navigate', protocolVersion: 1, requestId, active, view,
        } }));
      });
    };
    await dispatch(104, true, 'lattice');
    await dispatch(105, false, 'lattice');
    await dispatch(104, true, 'player');
    expect(useAppViewStore.getState().view).toBe('lattice');
    await dispatch(106, true, 'player');
    expect(useAppViewStore.getState().view).toBe('player');
  });

  it('keeps native hash history behavior when no embed root exists', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    window.localStorage.removeItem('open_player_on_launch');
    window.history.replaceState(null, '', '/');
    await mountNavigation();

    await act(async () => { navigation?.navigateToPlayer(); });

    expect(window.location.hash).toBe('#player');
    expect((window.history.state as { view?: string } | null)?.view).toBe('player');
    expect(window.history.length).toBeGreaterThan(1);
  });
});
