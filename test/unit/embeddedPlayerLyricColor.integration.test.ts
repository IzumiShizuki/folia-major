// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { installShizukiExternalBridge } from '../../src/shizukiExternalBridge';
import { useVisualizerRendererModel } from '../../src/components/visualizer/useVisualizerRendererModel';
import VisualizerShell from '../../src/components/visualizer/VisualizerShell';
import { useVisualizerSettingsStore } from '../../src/stores/useVisualizerSettingsStore';
import { resolveWordColor } from '../../src/components/visualizer/wordColoring';
import { mixColors } from '../../src/components/visualizer/colorMix';
import { setEmbeddedWorkspaceRuntimeActive } from '../../src/services/embeddedWorkspaceRuntime';
import { resolveDioramaBackgroundPalette } from '../../src/components/visualizer/diorama/dioramaBackgroundPalette';
import type { Theme } from '../../src/types';

// test/unit/embeddedPlayerLyricColor.integration.test.ts
// Mounts the real bridge and shared renderer boundary to verify live lyric colors and isolated background consumers.

let reactRoot: Root | null = null;
let originalVisualizerMode: ReturnType<typeof useVisualizerSettingsStore.getState>['visualizerMode'] | null = null;

const baseTheme = {
  primaryColor: '#ffffff', accentColor: '#3366ff', secondaryColor: '#99aaff', backgroundColor: '#101010',
  wordColors: [{ word: 'gift', color: '#ffcc00' }],
} as Theme;

const subtitleTheme = {
  ...baseTheme, primaryColor: '#22aaff', accentColor: '#4488cc', secondaryColor: '#77bbdd',
} as Theme;

function SharedRendererThemeProbe({ theme = baseTheme }: { theme?: Theme }) {
  const model = useVisualizerRendererModel({
    theme,
    subtitleTheme,
    seed: 'song-450',
    isObsBrowserSourceRendering: false,
    shouldPauseVisualizerBackground: false,
    hideTranslationSubtitle: false,
    isPlayerPageTransparent: false,
    onLyricLineSeek: vi.fn(),
    onBack: vi.fn(),
  });
  const canvasWordColor = resolveWordColor('gift', model.theme.wordColors, model.theme.accentColor);
  const canvasSweepColor = mixColors(model.theme.primaryColor, canvasWordColor, 0.68);
  const dioramaBackgroundPalette = resolveDioramaBackgroundPalette(model.backgroundTheme ?? theme);

  const themeProbe = createElement('output', {
    'data-testid': 'shared-renderer-theme',
    'data-mode': model.mode,
    'data-primary-color': model.theme.primaryColor,
    'data-accent-color': model.theme.accentColor,
    'data-word-color': model.theme.wordColors?.[0]?.color,
    'data-canvas-word-color': canvasWordColor,
    'data-canvas-sweep-color': canvasSweepColor,
    'data-subtitle-color': model.subtitleTheme.primaryColor,
    'data-background-color': model.theme.backgroundColor,
    'data-background-primary-color': model.backgroundTheme?.primaryColor,
    'data-background-accent-color': model.backgroundTheme?.accentColor,
    'data-background-secondary-color': model.backgroundTheme?.secondaryColor,
    'data-diorama-background-primary': dioramaBackgroundPalette.primary,
    'data-diorama-background-accent': dioramaBackgroundPalette.accent,
    'data-diorama-background-secondary': dioramaBackgroundPalette.secondary,
  });

  return createElement('section', null,
    themeProbe,
    createElement(VisualizerShell, {
      theme: model.theme,
      audioPower: model.audioPower,
      audioBands: model.audioBands,
      className: 'visualizer-shell',
      sharedProps: {
        backgroundTheme: model.backgroundTheme,
        background: { mode: 'common', common: { disableVignette: true } },
        seed: 'lyric-color-background',
        paused: true,
        isPreviewMode: true,
      },
      children: createElement('div', { 'data-testid': 'renderer-child' }),
    }),
  );
}

describe('embedded full-player lyric color at the shared renderer theme boundary', () => {
  afterEach(() => {
    act(() => reactRoot?.unmount());
    reactRoot = null;
    if (originalVisualizerMode) {
      useVisualizerSettingsStore.getState().handleSetVisualizerMode(originalVisualizerMode, { notify: false });
      originalVisualizerMode = null;
    }
    setEmbeddedWorkspaceRuntimeActive(false);
    document.body.replaceChildren();
    delete (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it('updates the mounted primary renderer palette from the real bridge event while preserving subtitle and background themes', async () => {
    originalVisualizerMode = useVisualizerSettingsStore.getState().visualizerMode;
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    const markedDomWord = document.createElement('span');
    markedDomWord.dataset.shizukiFoliaLyricWordBody = 'true';
    markedDomWord.textContent = 'Gift';
    embedRoot.append(markedDomWord);
    document.body.append(embedRoot);

    const host = document.createElement('div');
    document.body.append(host);
    reactRoot = createRoot(host);
    installShizukiExternalBridge();
    await act(async () => { reactRoot!.render(createElement(SharedRendererThemeProbe)); });

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'shizuki:set-lyric-color', color: '#e43b57' },
      }));
    });

    expect(embedRoot.dataset.shizukiLyricColor).toBe('custom');
    expect(embedRoot.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('#e43b57');
    expect(document.getElementById('shizuki-folia-lyric-color-style')?.textContent)
      .toContain('[data-shizuki-folia-lyric-word-body]');
    expect(embedRoot.style.getPropertyValue('--shizuki-folia-lyric-color')).toBe('#e43b57');

    const renderer = host.querySelector('[data-testid="shared-renderer-theme"]');
    expect(renderer?.getAttribute('data-primary-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-accent-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-word-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-canvas-word-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-canvas-sweep-color')).toBe('rgba(228, 59, 87, 1)');
    expect(renderer?.getAttribute('data-subtitle-color')).toBe('#22aaff');
    expect(renderer?.getAttribute('data-background-color')).toBe('#101010');
    expect(renderer?.getAttribute('data-background-primary-color')).toBe('#ffffff');
    expect(renderer?.getAttribute('data-background-accent-color')).toBe('#3366ff');
    expect(renderer?.getAttribute('data-background-secondary-color')).toBe('#99aaff');
    expect(renderer?.getAttribute('data-diorama-background-primary')).toBe('#ffffff');
    expect(renderer?.getAttribute('data-diorama-background-accent')).toBe('#3366ff');
    expect(renderer?.getAttribute('data-diorama-background-secondary')).toBe('#99aaff');
    expect(baseTheme.wordColors?.[0]?.color).toBe('#ffcc00');
    const background = host.querySelector('.visualizer-shell');
    const backgroundUsesOriginalAccent = Array.from(background?.querySelectorAll<HTMLElement>('*') ?? [])
      .some(element => element.style.backgroundColor === 'rgb(51, 102, 255)');
    expect(backgroundUsesOriginalAccent).toBe(true);

    await act(async () => { useVisualizerSettingsStore.getState().handleSetVisualizerMode('still', { notify: false }); });
    expect(renderer?.getAttribute('data-mode')).toBe('still');
    expect(renderer?.getAttribute('data-primary-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-accent-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-word-color')).toBe('#e43b57');
    await act(async () => { useVisualizerSettingsStore.getState().handleSetVisualizerMode('classic', { notify: false }); });
    expect(renderer?.getAttribute('data-mode')).toBe('classic');
    expect(renderer?.getAttribute('data-primary-color')).toBe('#e43b57');

    const updatedTheme = { ...baseTheme, primaryColor: '#abcd12', accentColor: '#654321' };
    await act(async () => { reactRoot!.render(createElement(SharedRendererThemeProbe, { theme: updatedTheme as Theme })); });
    expect(renderer?.getAttribute('data-primary-color')).toBe('#e43b57');
    expect(renderer?.getAttribute('data-background-primary-color')).toBe('#abcd12');
    expect(renderer?.getAttribute('data-background-accent-color')).toBe('#654321');

    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'shizuki:set-lyric-color', color: '' } }));
    });
    expect(renderer?.getAttribute('data-primary-color')).toBe('#abcd12');
    expect(renderer?.getAttribute('data-accent-color')).toBe('#654321');
    expect(renderer?.getAttribute('data-word-color')).toBe('#ffcc00');
    expect(renderer?.getAttribute('data-background-primary-color')).toBe('#abcd12');
  });

  it('does not consume host colors without an embed root and re-reads the root on parked re-entry', async () => {
    (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement('div');
    document.body.append(host);
    reactRoot = createRoot(host);
    installShizukiExternalBridge();

    await act(async () => { reactRoot!.render(createElement(SharedRendererThemeProbe)); });
    window.dispatchEvent(new CustomEvent('shizuki:lyric-color-change', { detail: { color: '#e43b57' } }));
    expect(host.querySelector('[data-testid="shared-renderer-theme"]')?.getAttribute('data-primary-color')).toBe('#ffffff');

    const embedRoot = document.createElement('div');
    embedRoot.id = 'folia-embed-root';
    document.body.append(embedRoot);
    setEmbeddedWorkspaceRuntimeActive(false);
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'shizuki:set-lyric-color', color: '#e43b57' },
      }));
    });
    expect(embedRoot.dataset.shizukiLyricColor).toBe('custom');
    expect(host.querySelector('[data-testid="shared-renderer-theme"]')?.getAttribute('data-primary-color')).toBe('#e43b57');

    const removeListener = vi.spyOn(window, 'removeEventListener');
    await act(async () => { reactRoot!.unmount(); });
    expect(removeListener).toHaveBeenCalledWith('shizuki:lyric-color-change', expect.any(Function));
    removeListener.mockRestore();
    reactRoot = createRoot(host);
    await act(async () => { reactRoot!.render(createElement(SharedRendererThemeProbe)); });
    expect(host.querySelector('[data-testid="shared-renderer-theme"]')?.getAttribute('data-primary-color')).toBe('#e43b57');
  });
});
