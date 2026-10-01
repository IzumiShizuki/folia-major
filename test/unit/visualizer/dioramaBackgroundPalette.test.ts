import { describe, expect, it } from 'vitest';
import type { Theme } from '../../../src/types';
import { applyEmbeddedLyricColor } from '../../../src/components/visualizer/embeddedLyricTheme';
import { resolveDioramaBackgroundPalette } from '../../../src/components/visualizer/diorama/dioramaBackgroundPalette';

// test/unit/visualizer/dioramaBackgroundPalette.test.ts
// Keeps Diorama's particle palette on the source theme while the foreground lyric palette follows the embed preference.

const sourceTheme = {
    name: 'source',
    primaryColor: '#ffffff',
    accentColor: '#3366ff',
    secondaryColor: '#99aaff',
    backgroundColor: '#101010',
    fontStyle: 'sans',
    animationIntensity: 'normal',
    wordColors: [{ word: 'gift', color: '#ffcc00' }],
} as Theme;

describe('Diorama background palette with embedded lyric color', () => {
    it('keeps particle colors on the source theme while lyric glyph derivation uses the selected color', () => {
        const lyricTheme = applyEmbeddedLyricColor(sourceTheme, '#e43b57');
        const backgroundPalette = resolveDioramaBackgroundPalette(sourceTheme);

        expect(lyricTheme.primaryColor).toBe('#e43b57');
        expect(lyricTheme.accentColor).toBe('#e43b57');
        expect(lyricTheme.wordColors?.[0]?.color).toBe('#e43b57');
        expect(backgroundPalette).toEqual({
            primary: '#ffffff',
            accent: '#3366ff',
            secondary: '#99aaff',
            background: '#101010',
        });
        expect(sourceTheme.wordColors?.[0]?.color).toBe('#ffcc00');
    });
});
