import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LatticeLyricSource } from './types';

// src/components/app/lattice/lyrics/LatticeLyricsProvider.tsx
export type LatticeLyricContext = LatticeLyricSource & {
    songKey: string; keywordColoringEnabled: boolean; embeddedLyricColor: string;
};
const Context = createContext<LatticeLyricContext | null>(null);
export const useLatticeLyrics = () => useContext(Context);

const readEmbeddedLyricColor = () => {
    if (typeof document === 'undefined') return '';
    const root = document.getElementById('folia-embed-root');
    return root?.dataset.shizukiLyricColor === 'custom'
        ? root.style.getPropertyValue('--shizuki-folia-lyric-color').trim()
        : '';
};

export default function LatticeLyricsProvider({ source, songKey, keywordColoringEnabled, children }: {
    source: LatticeLyricSource; songKey: string; keywordColoringEnabled: boolean; children: ReactNode;
}) {
    const [embeddedLyricColor, setEmbeddedLyricColor] = useState(readEmbeddedLyricColor);
    useEffect(() => {
        const onLyricColorChange = () => setEmbeddedLyricColor(readEmbeddedLyricColor());
        window.addEventListener('shizuki:lyric-color-change', onLyricColorChange);
        // Re-read after subscribing so a bridge update between render and effect cannot be lost.
        setEmbeddedLyricColor(readEmbeddedLyricColor());
        return () => window.removeEventListener('shizuki:lyric-color-change', onLyricColorChange);
    }, []);

    // Select explicitly: the source may structurally contain global font scales and player-only showText.
    const { currentTime, currentLineIndex, lines, theme, subtitleTheme, showSubtitleTranslation,
        hideTranslationSubtitle, subtitleContentMode, paused, staticMode } = source;
    const value = useMemo(() => ({ currentTime, currentLineIndex, lines, theme, subtitleTheme,
        showSubtitleTranslation, hideTranslationSubtitle, subtitleContentMode, paused, staticMode,
        songKey, keywordColoringEnabled, embeddedLyricColor }),
    [currentTime, currentLineIndex, lines, theme, subtitleTheme, showSubtitleTranslation,
        hideTranslationSubtitle, subtitleContentMode, paused, staticMode, songKey, keywordColoringEnabled, embeddedLyricColor]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}
