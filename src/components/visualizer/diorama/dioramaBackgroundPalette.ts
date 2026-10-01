import type { Theme } from '../../../types';

// src/components/visualizer/diorama/dioramaBackgroundPalette.ts
// Resolves the original theme colors used by Diorama's non-lyric particle field.

export const resolveDioramaBackgroundPalette = (theme: Theme) => ({
    primary: theme.primaryColor,
    accent: theme.accentColor || theme.primaryColor,
    secondary: theme.secondaryColor,
    background: theme.backgroundColor,
});
