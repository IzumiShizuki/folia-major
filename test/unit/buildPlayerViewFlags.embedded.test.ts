import { describe, expect, it } from 'vitest';
import { buildPlayerViewFlags } from '../../src/components/app/presentation/buildPlayerViewFlags';

const base = {
  currentView: 'player',
  disableHomeDynamicBackground: false,
  hidePlayerProgressBar: false,
  hidePlayerTranslationSubtitle: false,
  hidePlayerRightPanelButton: false,
  isNowPlayingControlDisabled: false,
  activePlaybackContext: 'main' as const,
  stageActiveEntryKind: null,
  audioSrc: null,
  duration: 180,
};

describe('embedded player control availability', () => {
  it('keeps controls available for the authoritative site session without a Folia audio source', () => {
    expect(buildPlayerViewFlags({ ...base, isEmbedMode: true, hasCurrentSong: true }).canToggleCurrentPlayback).toBe(true);
  });

  it('does not make an empty embedded player controllable', () => {
    expect(buildPlayerViewFlags({ ...base, isEmbedMode: true, hasCurrentSong: false }).canToggleCurrentPlayback).toBe(false);
  });

  it('keeps standalone source readiness behavior', () => {
    expect(buildPlayerViewFlags({ ...base, audioSrc: 'https://media.test/song.mp3' }).canToggleCurrentPlayback).toBe(true);
    expect(buildPlayerViewFlags({ ...base, audioSrc: null }).canToggleCurrentPlayback).toBe(false);
  });
});
