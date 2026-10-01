import { afterEach, describe, expect, it, vi } from 'vitest';
import { isShizukiEmbedSurface, projectEmbeddedPlaybackClock, sendEmbeddedPlaybackCommand, sendEmbeddedTrackIntent } from '../../src/services/shizukiEmbeddedPlayback';
import { applyEmbeddedHostNavigation, resetEmbeddedWorkspaceForTests } from '../../src/services/embeddedWorkspaceNavigation';

let requestId = 500;

const activateEmbed = (active = true) => {
  expect(applyEmbeddedHostNavigation({
    protocolVersion: 1, requestId: requestId++, view: 'player', active,
  }).ok).toBe(true);
};

describe('Shizuki embedded playback relay', () => {
  afterEach(() => {
    resetEmbeddedWorkspaceForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('projects the site clock into both Folia playback and lyric motion values', () => {
    const playbackSet = vi.fn();
    const lyricSet = vi.fn();
    expect(projectEmbeddedPlaybackClock(28.5, { set: playbackSet }, { set: lyricSet })).toBe(28.5);
    expect(playbackSet).toHaveBeenCalledWith(28.5);
    expect(lyricSet).toHaveBeenCalledWith(28.5);
    expect(projectEmbeddedPlaybackClock(Number.NaN, { set: playbackSet }, { set: lyricSet })).toBe(0);
  });

  it('relays pause and seek immediately without depending on a Folia audio source', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });
    activateEmbed();

    expect(sendEmbeddedPlaybackCommand('pause')).toBe(true);
    expect(sendEmbeddedPlaybackCommand('seek', 42.25)).toBe(true);
    expect(postMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: 'shizuki:playback-command', action: 'pause' },
      { type: 'shizuki:playback-command', action: 'seek', positionMs: 42250 },
    ]);
  });

  it('sends a selected track intent without resolving it locally', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });
    activateEmbed();
    const track = { id: 17, name: 'Selected' };

    expect(sendEmbeddedTrackIntent(track)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'shizuki:playback-intent',
      track: {
        id: '17', trackId: '17', name: 'Selected', provider: 'netease', providerId: 'netease',
        sourceRef: { kind: 'online', providerId: 'netease', mediaId: '17' },
      },
      positionMs: 0,
      playing: true,
    }, '*');
  });

  it('keeps embedded mode active whenever the host root is mounted, independent of visibility', () => {
    vi.stubGlobal('document', { getElementById: () => ({ hidden: true }) });
    expect(isShizukiEmbedSurface()).toBe(true);
    vi.stubGlobal('document', { getElementById: () => null });
    expect(isShizukiEmbedSurface()).toBe(false);
  });

  it('does not send playback commands or intents from a parked embedded workspace', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });
    activateEmbed(false);

    expect(sendEmbeddedPlaybackCommand('pause')).toBe(false);
    expect(sendEmbeddedTrackIntent({ id: 18 })).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('leaves standalone Folia playback on its existing path', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => null });
    vi.stubGlobal('window', { parent: { postMessage } });

    expect(sendEmbeddedPlaybackCommand('play')).toBe(false);
    expect(sendEmbeddedTrackIntent({ id: 18 })).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
  it('hands off a complete native collection selection with source identity and its real queue index', () => {
    const postMessage = vi.fn();
    vi.stubGlobal('document', { getElementById: () => ({}) });
    vi.stubGlobal('window', { parent: { postMessage } });
    activateEmbed();
    const tracks = [
      { id: 17, provider: 'netease', name: 'A' },
      { id: 'opaque-b', provider: 'qq', name: 'B' },
      { id: 19, provider: 'netease', name: 'C' },
    ];
    const selection = {
      kind: 'collection',
      queuePolicy: 'replace',
      selectedIndex: 1,
      tracks,
      sourceContext: {
        kind: 'collection',
        collection: { source: 'online', providerId: 'qq', type: 'playlist', id: 'P2', name: 'P2' },
      },
    };

    expect((sendEmbeddedTrackIntent as (track: unknown, selection: unknown) => boolean)(tracks[1], selection)).toBe(true);
    const queueEntryIds = tracks.map((track, index) => `${track.provider}:${track.id}@${index}`);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'shizuki:playback-intent',
      track: {
        ...tracks[1], id: 'opaque-b', trackId: 'opaque-b', providerId: 'qq',
        sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'opaque-b' },
      },
      positionMs: 0,
      playing: true,
      selection: {
        ...selection,
        queueEntryId: queueEntryIds[1],
        tracks: tracks.map((track, index) => ({
          ...track,
          id: String(track.id),
          trackId: String(track.id),
          providerId: track.provider,
          sourceRef: { kind: 'online', providerId: track.provider, mediaId: String(track.id) },
          queueEntryId: queueEntryIds[index],
        })),
      },
    }, '*');
  });
});
