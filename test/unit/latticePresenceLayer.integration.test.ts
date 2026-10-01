// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import LatticePresenceLayer from '../../src/components/app/lattice/LatticePresenceLayer';
import { useLatticeExitGate } from '../../src/hooks/useLatticeExitGate';
import { useAppViewStore } from '../../src/stores/useAppViewStore';

let root: Root | null = null;
let setCurrentView: ((view: 'lattice' | 'player') => void) | null = null;

const Probe = () => {
  const [view, setView] = useState<'lattice' | 'player'>('lattice');
  setCurrentView = nextView => {
    useAppViewStore.setState({ view: nextView });
    setView(nextView);
  };
  const { hasLatticeExited, onLatticeExitComplete } = useLatticeExitGate(view);
  return createElement('div', null,
    createElement(LatticePresenceLayer, {
      active: view === 'lattice',
      duration: 0.2,
      onExitComplete: onLatticeExitComplete,
      children: createElement('button', { 'data-testid': 'lattice-control' }, 'Lattice control'),
    }),
    view === 'player' && hasLatticeExited
      ? createElement('button', { 'data-testid': 'player-panel' }, 'Player controls')
      : null,
  );
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Lattice presence layer transitions', () => {
  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    setCurrentView = null;
    useAppViewStore.setState({ view: 'home' });
    document.body.replaceChildren();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('restores an interrupted exit and keeps the active Lattice layer interactive', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => { root?.render(createElement(Probe)); });

    await act(async () => { setCurrentView?.('player'); });
    await wait(50);
    const exitingLayer = document.querySelector<HTMLElement>('.absolute.inset-0.z-10');
    expect(exitingLayer?.style.pointerEvents).toBe('none');
    await act(async () => { setCurrentView?.('lattice'); });
    await act(async () => { await wait(300); });

    const layer = document.querySelector<HTMLElement>('.absolute.inset-0.z-10');
    expect(layer).not.toBeNull();
    expect(Number(layer?.style.opacity ?? '1')).toBeGreaterThan(0.95);
    expect(layer?.style.pointerEvents).toBe('auto');
    expect(document.querySelector('[data-testid="lattice-control"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="player-panel"]')).toBeNull();

    // Complete a real Lattice-to-player exit after the interrupted transition, then repeat the
    // cycle to ensure neither the visibility gate nor the mounted player gets stranded.
    await act(async () => { setCurrentView?.('player'); });
    await act(async () => { await wait(300); });
    expect(document.querySelector('[data-testid="player-panel"]')).not.toBeNull();
    expect(document.querySelector('.absolute.inset-0.z-10')).toBeNull();

    await act(async () => { setCurrentView?.('lattice'); });
    await act(async () => { await wait(300); });
    expect(document.querySelector('[data-testid="lattice-control"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="player-panel"]')).toBeNull();
    await act(async () => { setCurrentView?.('player'); });
    await act(async () => { await wait(300); });
    expect(document.querySelector('[data-testid="player-panel"]')).not.toBeNull();
  });
});
