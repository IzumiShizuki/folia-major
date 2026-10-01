import { useEffect, useState } from 'react';

// src/hooks/useEmbeddedLyricColor.ts
// Subscribes the shared visualizer model to the bridge's discrete embedded lyric-color preference.

const LYRIC_COLOR_EVENT = 'shizuki:lyric-color-change';
const HEX_COLOR_PATTERN = /^#[\da-f]{6}$/i;

const readEmbeddedLyricColor = (): string => {
    if (typeof document === 'undefined') {
        return '';
    }

    const root = document.getElementById('folia-embed-root');
    if (!root || root.dataset.shizukiLyricColor !== 'custom') {
        return '';
    }

    const color = root.style.getPropertyValue('--shizuki-folia-lyric-color').trim();
    return HEX_COLOR_PATTERN.test(color) ? color : '';
};

/** Reads the bridge's discrete embedded preference without subscribing to playback or animation state. */
export const useEmbeddedLyricColor = (): string => {
    const [color, setColor] = useState(readEmbeddedLyricColor);

    useEffect(() => {
        const syncColorFromEmbedRoot = () => setColor(readEmbeddedLyricColor());
        window.addEventListener(LYRIC_COLOR_EVENT, syncColorFromEmbedRoot);
        // Close the render/effect gap: a bridge update between the initial read and subscription
        // is recovered from the root's validated state after the listener is installed.
        syncColorFromEmbedRoot();

        return () => window.removeEventListener(LYRIC_COLOR_EVENT, syncColorFromEmbedRoot);
    }, []);

    return color;
};
