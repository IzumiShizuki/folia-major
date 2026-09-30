import { describe, expect, it } from 'vitest';
import { buildWordPlacements } from '../../src/components/visualizer/cadenza/VisualizerCadenza';

const word = (text: string, index: number) => ({
    text,
    startTime: index,
    endTime: index + 1,
});

const fragment = (text: string, index: number, startX: number, endX: number, lineIndex: number) => ({
    wordIndex: index,
    lineIndex,
    word: word(text, index),
    text,
    color: '#ffffff',
    startX,
    endX,
    fragmentStartInWord: 0,
    fragmentEndInWord: 1,
    wordGraphemeCount: 1,
    wordGraphemeTimings: [],
    fragmentIndexInWord: 0,
    fragmentCountInWord: 1,
    isPrimaryFragment: true,
    isSplitAcrossLines: false,
});

describe('Cadenza wrapped lyric layout', () => {
    it('keeps a substantial single-line Chinese lyric centered as one composition', () => {
        const text = Array.from('此歌曲为纯音乐请欣赏');
        const width = 48;
        const placements = buildWordPlacements([
            {
                line: { width: text.length * width },
                lineStart: 0,
                lineEnd: text.length,
                fragments: text.map((character, index) => fragment(
                    character,
                    index,
                    index * width,
                    (index + 1) * width,
                    0,
                )),
            },
        ] as never, 56, 68, 520, 'normal', 1, false);

        expect(placements).toHaveLength(text.length);
        expect(placements.every(placement => placement.preserveLineLayout)).toBe(true);
        const left = Math.min(...placements.map(placement => placement.x));
        const right = Math.max(...placements.map(placement => placement.x + placement.width));
        expect((left + right) / 2).toBeCloseTo(0, 6);
    });

    it('keeps a long Chinese lyric complete and centered on every wrapped line', () => {
        const placements = buildWordPlacements([
            {
                line: { width: 240 },
                lineStart: 0,
                lineEnd: 2,
                fragments: [fragment('我', 0, 0, 120, 0), fragment('们', 1, 120, 240, 0)],
            },
            {
                line: { width: 240 },
                lineStart: 2,
                lineEnd: 4,
                fragments: [fragment('都', 2, 0, 120, 1), fragment('在', 3, 120, 240, 1)],
            },
        ] as never, 56, 68, 520, 'normal', 1, false);

        expect(placements).toHaveLength(4);
        expect(placements.every(placement => placement.preserveLineLayout)).toBe(true);

        for (const lineIndex of [0, 1]) {
            const row = placements.filter(placement => placement.id.includes(`-${lineIndex}-`));
            const left = Math.min(...row.map(placement => placement.x));
            const right = Math.max(...row.map(placement => placement.x + placement.width));
            expect((left + right) / 2).toBeCloseTo(0, 6);
        }
    });
});
