// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installShizukiExternalBridge } from '../../src/shizukiExternalBridge';
import LatticeLyricsProvider, { useLatticeLyrics } from '../../src/components/app/lattice/lyrics/LatticeLyricsProvider';

const captured = vi.hoisted(() => ({ sweeps: [] as Array<Record<string, any>> }));

vi.mock('../../src/components/app/lattice/lyrics/latticeLyricFilters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/components/app/lattice/lyrics/latticeLyricFilters')>();
  return {
    ...actual,
    createLatticeQuadGeometry: () => ({ destroy: vi.fn() }),
    createLatticeSweepShader: (_pixi: unknown, base: number[], word: number[]) => {
      const uniforms = {
        uBase: base,
        uWord: word,
        uGlyphRange: [0, 1],
        uProgress: 0,
        uPassed: 0,
        uFront: 0,
        uSoftness: 0.1,
        uVerticalFade: [2, 3],
      };
      captured.sweeps.push(uniforms);
      return { shader: { destroy: vi.fn() }, uniforms };
    },
  };
});

import { createLatticeLineView } from '../../src/components/app/lattice/lyrics/latticeLyricScene';

class FakeContainer {
  children: unknown[] = [];
  addChild(...children: unknown[]) { this.children.push(...children); }
  destroy() {}
}

class FakeSprite extends FakeContainer {
  alpha = 1;
  tint = 0xffffff;
  position: any = { copyFrom: vi.fn() };
  destroy() {}
}

class FakeMesh extends FakeSprite {
  scale = { set: vi.fn() };
  position: any = { set: vi.fn() };
  constructor(public options: { shader: unknown }) { super(); }
}

class FakeColor {
  constructor(private color: string) {}
  toArray() {
    if (this.color.startsWith('#')) {
      const hex = this.color.slice(1);
      return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(1);
    }
    const rgba = this.color.match(/[\d.]+/g)?.map(Number) ?? [];
    return [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] ?? 1];
  }
}

describe('embedded custom lyric color in the Lattice glyph renderer', () => {
  let reactRoot: Root | null = null;

  afterEach(() => {
    captured.sweeps.length = 0;
    act(() => reactRoot?.unmount());
    reactRoot = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses the bridge color for the rendered primary glyph shader and restores theme color after reset', async () => {
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(window, 'setInterval').mockReturnValue(1 as unknown as ReturnType<typeof setInterval>);
    const root = document.createElement('div');
    root.id = 'folia-embed-root';
    document.body.append(root);
    const pixi = {
      Container: FakeContainer,
      BlurFilter: class { destroy() {} },
      Color: FakeColor,
      Mesh: FakeMesh,
      Sprite: FakeSprite,
    } as unknown as typeof import('pixi.js');
    const raster = {
      rasterize: () => ({ texture: { destroy: vi.fn() }, pad: 0, width: 40, height: 30 }),
    } as never;
    const parent = new FakeContainer() as never;
    const entry = {
      line: { fullText: 'Hello world', isChorus: false },
      status: 'active',
      offset: 0,
    };
    const layout = {
      pieces: [
        { text: 'Hello', token: { key: 'hello', timed: true, startTime: 0, endTime: 1, graphemeTimings: [] },
          tokenOffset: 0, offsets: [0, 30], width: 30, x: 0, y: 0, row: 0, translation: false },
        { text: '你好', token: { key: 'translation', timed: false },
          tokenOffset: 0, offsets: [0, 24], width: 24, x: 0, y: 42, row: 1, translation: true },
      ],
      textHeight: 30,
      height: 30,
      rows: 1,
    } as never;
    const type = {
      fontPx: 30, translationPx: 16, font: 'sans-serif', translationFont: 'sans-serif',
      lineHeight: 40, translationLineHeight: 20,
    } as never;
    const theme = { primaryColor: '#ffffff', accentColor: '#0000ff', wordColors: [{ keyword: 'Hello', color: '#00ff00' }] };
    const subtitleTheme = { primaryColor: '#22aaff' };
    const input = {
      theme,
      subtitleTheme,
      keywordColoringEnabled: false,
    } as never;

    const view = createLatticeLineView(pixi, raster, parent, entry as never, layout, type, input, 1);
    view.update(0.2, 'active', 1, 500, 100, 1, true);
    const chorusView = createLatticeLineView(pixi, raster, parent, {
      ...entry, line: { ...entry.line, isChorus: true },
    } as never, layout, type, input, 1);
    chorusView.update(0.2, 'active', 1, 500, 100, 1, true);

    const [primarySweep, subtitleSweep, chorusSweep] = captured.sweeps;
    function ActiveSceneConsumer() {
      const lyrics = useLatticeLyrics();
      useEffect(() => {
        const color = lyrics?.embeddedLyricColor || '';
        (view as unknown as { setEmbeddedLyricColor?: (next: string) => void }).setEmbeddedLyricColor?.(color);
        (chorusView as unknown as { setEmbeddedLyricColor?: (next: string) => void }).setEmbeddedLyricColor?.(color);
      }, [lyrics?.embeddedLyricColor]);
      return null;
    }
    const providerSource = {
      currentTime: { get: () => 0, on: () => () => undefined },
      currentLineIndex: 0,
      lines: [],
      theme,
      subtitleTheme,
      showSubtitleTranslation: true,
      hideTranslationSubtitle: false,
      subtitleContentMode: 'translation',
      paused: false,
      staticMode: false,
    };
    installShizukiExternalBridge();
    const providerHost = document.createElement('div');
    document.body.append(providerHost);
    reactRoot = createRoot(providerHost);
    await act(async () => {
      reactRoot!.render(createElement(LatticeLyricsProvider, {
        source: providerSource as never, songKey: 'song-1', keywordColoringEnabled: false,
        children: createElement(ActiveSceneConsumer),
      }));
    });
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'shizuki:set-lyric-color', color: '#e43b57' },
      }));
    });
    expect(root.dataset.shizukiLyricColor).toBe('custom');
    expect(root.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('#e43b57');
    expect(primarySweep?.uWord).toEqual([228 / 255, 59 / 255, 87 / 255, 0.98]);
    expect(primarySweep?.uBase.slice(0, 3)).toEqual([228 / 255, 59 / 255, 87 / 255]);
    expect(subtitleSweep?.uWord.slice(0, 3)).toEqual([34 / 255, 170 / 255, 255 / 255]);
    expect(chorusSweep?.uWord).toEqual([228 / 255, 59 / 255, 87 / 255, 0.98]);
    expect(chorusSweep?.uBase.slice(0, 3)).toEqual([228 / 255, 59 / 255, 87 / 255]);

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'shizuki:set-lyric-color', color: '' },
      }));
    });
    expect(root.dataset.shizukiLyricColor).toBeUndefined();
    expect(root.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('');
    expect(primarySweep?.uWord).toEqual([1, 1, 1, 0.98]);
    expect(primarySweep?.uBase.slice(0, 3)).toEqual([1, 1, 1]);
    expect(subtitleSweep?.uWord.slice(0, 3)).toEqual([34 / 255, 170 / 255, 255 / 255]);
    expect(chorusSweep?.uWord).toEqual([133 / 255, 133 / 255, 1, 1]);
    expect(chorusSweep?.uBase.slice(0, 3)).toEqual([1, 1, 1]);
    view.destroy();
    chorusView.destroy();
  });
});
