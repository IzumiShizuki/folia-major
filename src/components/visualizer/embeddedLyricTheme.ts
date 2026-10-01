import type { Theme } from '../../types';

// src/components/visualizer/embeddedLyricTheme.ts
// Builds the lyric-facing palette overlay while leaving the caller's theme untouched.

const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i;

/** Adds the embedded preference to derived lyric colors without mutating the active theme. */
export const applyEmbeddedLyricColor = (theme: Theme, color: string): Theme => {
    if (!HEX_COLOR_PATTERN.test(color)) {
        return theme;
    }

    return {
        ...theme,
        primaryColor: color,
        accentColor: color,
        wordColors: theme.wordColors?.map(wordColor => ({ ...wordColor, color })),
    };
};
