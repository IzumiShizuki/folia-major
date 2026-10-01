import type { SongResult } from '../../../types';
import { getSongArtistLabel, getSongCoverUrl } from '../../../services/onlineMusic/songMetadata';
import { getPlaybackSongKey } from '../../../utils/appPlaybackGuards';

// Projects the play queue onto the wall; queue order is the only source of truth.

export type LatticeSection = 'played' | 'now' | 'upcoming';

export type LatticeTile = {
    id: string;
    /** Zero-based position in the play queue; the poster badge shows it as a 1-based number. */
    queueIndex: number;
    song: SongResult;
    title: string;
    artist: string;
    coverUrl?: string;
    section: LatticeSection;
};

/** Uses queue-slot identity when available, with playback identity for standalone/legacy queues. */
export const getLatticeTileId = (song: SongResult): string => {
    const entryId = (song as SongResult & { queueEntryId?: unknown }).queueEntryId;
    return typeof entryId === 'string' && entryId.trim()
        ? entryId.trim()
        : getPlaybackSongKey(song);
};

// Marks each entry relative to the playhead; the queue is already de-duplicated by the queue controller.
export const buildLatticeTiles = ({
    queue,
    currentSong,
}: {
    queue: SongResult[];
    currentSong: SongResult | null;
}): LatticeTile[] => {
    const currentTileId = currentSong ? getLatticeTileId(currentSong) : null;
    const currentIndex = currentTileId === null
        ? -1
        : queue.findIndex(song => getLatticeTileId(song) === currentTileId);

    return queue.map((song, index) => {
        let section: LatticeSection = 'upcoming';
        if (index === currentIndex) section = 'now';
        else if (currentIndex >= 0 && index < currentIndex) section = 'played';

        return {
            id: getLatticeTileId(song),
            queueIndex: index,
            song,
            title: song.name,
            artist: getSongArtistLabel(song) || song.album?.name || 'Unknown artist',
            coverUrl: getSongCoverUrl(song) || song.album?.coverUrl,
            section,
        };
    });
};
