/**
 * Shizuki-site external bridge for the Folia (AGPL-3.0) web player.
 *
 * In embedded mode the surrounding site owns the real playback session and
 * the only audible HTMLAudioElement. Folia receives a versioned, complete
 * session snapshot solely to render its immersive UI, then relays user
 * actions back to the site as commands or track-selection intents.
 */

import { PlayerState, type LyricData, type SongResult } from './types';
import { usePlaybackStore } from './stores/usePlaybackStore';
import { useTypographySettingsStore } from './stores/useTypographySettingsStore';
import { lyricCurrentTime } from './stores/motionSignals';
import { findLatestActiveLineIndex } from './utils/appPlaybackHelpers';

const COOKIE_STORAGE_KEY = 'netease_cookie';
const EMBED_AUDIO_SELECTOR = '#folia-embed-root audio';

type UnknownRecord = Record<string, unknown>;

type FollowSession = {
  version: number;
  track: UnknownRecord | null;
  queue: UnknownRecord[];
  playlist: UnknownRecord | null;
  lyrics: UnknownRecord[];
  lyricRenderMode: string;
  lyricIndex: number;
  positionMs: number;
  durationMs: number;
  playing: boolean;
};

let followPlaybackActive = false;
let followClockFrame = 0;
let followClockPositionSec = 0;
let followClockStartedAt = 0;
let followClockPlaying = false;
let suppressPlaybackCommandsUntil = 0;
let latestFollowSessionVersion = -1;
let audioLockInstalled = false;
let progressSeekBridgeInstalled = false;
let navigationBridgeInstalled = false;
let lastFollowSeekPositionSec = -1;
let lastFollowSeekAt = 0;
let activeProgressInput: HTMLInputElement | null = null;
let activeProgressPointerId: number | null = null;
let pendingNavigationAction: 'next' | 'previous' | null = null;
let pendingNavigationActionAt = 0;
let cookieBridgeInstalled = false;
let lastReportedCookie = '';
let embedWallpaperStyleInstalled = false;
let embedWallpaperObserver: MutationObserver | null = null;
let embedLyricSizingInstalled = false;
let embedLyricBaseScale: number | null = null;
let embedLyricAppliedScale: number | null = null;

const MIN_EMBED_LYRIC_SCALE = 0.34;
const EMBED_LYRIC_CONTENT_WIDTH_RATIO = 0.72;

function cssBackgroundImage(url: string): string {
  const normalized = String(url || '').trim();
  return normalized ? `url(${JSON.stringify(normalized)})` : 'none';
}

/**
 * The site owns the ambient blur outside Folia. This layer keeps the actual
 * player surface on the unfiltered Home wallpaper, including when its host
 * enters native fullscreen.
 */
function installEmbedWallpaperStyle(): void {
  if (embedWallpaperStyleInstalled || typeof document === 'undefined') return;
  embedWallpaperStyleInstalled = true;
  const style = document.createElement('style');
  style.id = 'shizuki-folia-wallpaper-style';
  style.textContent = `
#folia-embed-root[data-shizuki-wallpaper='active'] { isolation: isolate; background: #0b0e14; }
#folia-embed-root[data-shizuki-wallpaper='active']::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image: var(--shizuki-folia-wallpaper-image);
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
#folia-embed-root[data-shizuki-wallpaper='active'] > * {
  position: relative;
  z-index: 1;
  background-color: transparent !important;
}
#folia-embed-root[data-shizuki-wallpaper='active'] [data-shizuki-folia-default-background='hidden'] {
  opacity: 0 !important;
  background-color: transparent !important;
}
#folia-embed-root[data-shizuki-wallpaper='active']:fullscreen::before,
.folia-embed-pane:fullscreen #folia-embed-root[data-shizuki-wallpaper='active']::before {
  background-size: cover;
}
`;
  document.head.appendChild(style);
}

function applyEmbedWallpaper(rawSource: unknown, rawPreview: unknown): void {
  const root = document.getElementById('folia-embed-root');
  if (!root) return;
  const source = String(rawSource || rawPreview || '').trim();
  if (!source) {
    delete root.dataset.shizukiWallpaper;
    delete root.dataset.shizukiWallpaperUrl;
    root.dataset.shizukiWallpaperState = 'empty';
    root.querySelectorAll('[data-shizuki-folia-default-background]').forEach((element) => {
      element.removeAttribute('data-shizuki-folia-default-background');
    });
    root.style.setProperty('--shizuki-folia-wallpaper-image', 'none');
    return;
  }
  root.dataset.shizukiWallpaper = 'active';
  root.dataset.shizukiWallpaperUrl = source;
  root.dataset.shizukiWallpaperState = 'waiting-for-default-layer';
  root.style.setProperty('--shizuki-folia-wallpaper-image', cssBackgroundImage(source));
  markEmbeddedDefaultBackground(root);
  observeEmbeddedDefaultBackground(root);
}

/**
 * Folia's default latent canvas paints an opaque theme-color rectangle behind
 * the player. It is useful standalone, but in an embedded Home-wallpaper view
 * it would hide the supplied image completely. Mark exactly that canvas host;
 * visualizer foregrounds and every normal UI layer stay untouched.
 */
function markEmbeddedDefaultBackground(root: HTMLElement): void {
  if (root.dataset.shizukiWallpaper !== 'active') return;
  const shader = root.querySelector<HTMLElement>('[data-paper-shader]');
  const host = shader?.closest<HTMLElement>('.absolute.inset-0.z-0.overflow-hidden');
  if (!host) return;
  host.setAttribute('data-shizuki-folia-default-background', 'hidden');
  root.dataset.shizukiWallpaperState = 'ready';
}

function observeEmbeddedDefaultBackground(root: HTMLElement): void {
  if (embedWallpaperObserver) return;
  embedWallpaperObserver = new MutationObserver(() => markEmbeddedDefaultBackground(root));
  embedWallpaperObserver.observe(root, { childList: true, subtree: true });
}

/**
 * Folia visualizers size their primary line in viewport units. The embedded
 * music surface is narrower than the browser viewport. Long CJK lines are
 * often one unbreakable text segment, so fit that content as well as the
 * workspace itself instead of relying on viewport width alone.
 */
function resolveEmbedLyricContentScale(root: HTMLElement): number {
  if (document.fullscreenElement) return 1;
  const state = usePlaybackStore.getState();
  const lines = state.lyrics?.lines ?? [];
  const activeLine = lines[state.currentLineIndex] ?? null;
  const text = String(activeLine?.fullText || '').trim();
  if (!text) return 1;

  const longestUnbrokenSpan = text
    .split(/\s+/)
    .reduce((longest, segment) => Math.max(longest, Array.from(segment).length), 0);
  if (longestUnbrokenSpan < 2) return 1;

  // Cadenza uses a 0.086 x viewport font baseline and centers a lyric region
  // around 72% of its available width. Keeping the estimate here makes the
  // bridge work for its canvas text as well as DOM-based visualizers.
  const baseFontPx = Math.min(94, Math.max(34, root.clientWidth * 0.086));
  const availableTextWidth = Math.min(root.clientWidth * EMBED_LYRIC_CONTENT_WIDTH_RATIO, 820);
  const estimatedLineWidth = longestUnbrokenSpan * baseFontPx * 1.05;
  return Math.min(1, availableTextWidth / Math.max(estimatedLineWidth, 1));
}

function syncEmbedLyricSizing(): void {
  const root = document.getElementById('folia-embed-root');
  if (!root || root.clientWidth < 240 || typeof window === 'undefined') return;
  const settings = useTypographySettingsStore.getState();
  const currentScale = Number(settings.lyricsFontScale) || 1;
  if (embedLyricBaseScale === null || (
    embedLyricAppliedScale !== null
    && Math.abs(currentScale - embedLyricAppliedScale) > 0.005
  )) {
    embedLyricBaseScale = currentScale;
  }
  const viewportWidth = Math.max(1, window.innerWidth || root.clientWidth);
  const widthRatio = Math.min(1, Math.max(0, (root.clientWidth / viewportWidth) * 1.15));
  const preferredScale = embedLyricBaseScale ?? 1;
  const contentScale = resolveEmbedLyricContentScale(root);
  const nextScale = Math.max(
    MIN_EMBED_LYRIC_SCALE,
    Math.min(preferredScale, preferredScale * widthRatio, preferredScale * contentScale),
  );
  if (Math.abs(currentScale - nextScale) < 0.005) return;
  embedLyricAppliedScale = nextScale;
  // setState deliberately avoids persisting an embed-only presentation value.
  useTypographySettingsStore.setState({ lyricsFontScale: nextScale });
}

function installEmbedLyricSizing(): void {
  if (embedLyricSizingInstalled || typeof document === 'undefined') return;
  embedLyricSizingInstalled = true;
  const root = document.getElementById('folia-embed-root');
  if (root && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncEmbedLyricSizing).observe(root);
  }
  window.addEventListener('resize', syncEmbedLyricSizing);
  document.addEventListener('fullscreenchange', syncEmbedLyricSizing);
  window.requestAnimationFrame(syncEmbedLyricSizing);
}

function readFollowSong(rawTrack: UnknownRecord | null | undefined): SongResult | null {
  if (!rawTrack) return null;
  const id = Number(rawTrack.foliaId ?? rawTrack.id ?? rawTrack.trackId ?? rawTrack.track_id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rawArtists = Array.isArray(rawTrack.artists) ? rawTrack.artists : [];
  const artistText = String(rawTrack.artist || '').trim();
  const artists = rawArtists.length
    ? rawArtists
    : artistText.split(/\s*[/,&]\s*/).filter(Boolean).map((name) => ({ name }));
  const rawAlbum = rawTrack.album && typeof rawTrack.album === 'object'
    ? rawTrack.album as UnknownRecord
    : {};
  const durationMs = Number(
    rawTrack.durationMs
      ?? rawTrack.duration_ms
      ?? (Number(rawTrack.durationSec ?? rawTrack.duration_sec ?? rawTrack.duration) || 0) * 1000,
  );
  return {
    ...rawTrack,
    // Never retain a main-site media address in Folia's display store.
    audio: undefined,
    url: undefined,
    src: undefined,
    id,
    name: String(rawTrack.name || rawTrack.title || ''),
    artists,
    album: {
      ...rawAlbum,
      picUrl: String(rawAlbum.picUrl || rawTrack.cover || rawTrack.coverUrl || rawTrack.cover_url || ''),
    },
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  } as unknown as SongResult;
}

function readFollowQueue(rawQueue: unknown): SongResult[] {
  if (!Array.isArray(rawQueue)) return [];
  return rawQueue
    .map((item) => (item && typeof item === 'object' ? readFollowSong(item as UnknownRecord) : null))
    .filter((item): item is SongResult => item !== null);
}

function readSeconds(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function buildFollowLyrics(rawLyrics: unknown, song: SongResult | null, durationMs: number): LyricData | null {
  if (!Array.isArray(rawLyrics)) return null;
  const rows = rawLyrics
    .filter((entry): entry is UnknownRecord => Boolean(entry) && typeof entry === 'object')
    .map((entry) => {
      const time = readSeconds(entry.time);
      const declaredEndTime = Number(entry.endTime);
      return {
        time,
        // Plain LRC has no declared line end. A null end must remain absent so
        // the next line's start defines the visible interval, rather than 0.01s.
        endTime: Number.isFinite(declaredEndTime) && declaredEndTime > time ? declaredEndTime : null,
        original: String(entry.original || entry.text || '').trim(),
        translation: String(entry.translation || '').trim(),
        furigana: String(entry.furigana || entry.romanization || '').trim(),
        words: Array.isArray(entry.words) ? entry.words : [],
      };
    })
    .filter((entry) => entry.original)
    .sort((left, right) => left.time - right.time);
  if (!rows.length) return null;

  const durationSec = Math.max(0, Number(durationMs || 0) / 1000);
  const lines: LyricData['lines'] = rows.map((entry, index) => {
    const nextStart = rows[index + 1]?.time;
    const fallbackEnd = Number.isFinite(nextStart)
      ? Number(nextStart)
      : (durationSec > entry.time ? durationSec : entry.time + 5);
    const endTime = Math.max(entry.time + 0.01, entry.endTime ?? fallbackEnd);
    const words = entry.words
      .filter((word): word is UnknownRecord => Boolean(word) && typeof word === 'object')
      .map((word) => {
        const startTime = readSeconds(word.time ?? word.startTime, entry.time);
        const declaredWordEnd = Number(word.endTime ?? word.end);
        const wordEnd = Number.isFinite(declaredWordEnd) && declaredWordEnd > startTime
          ? declaredWordEnd
          : Math.min(endTime, startTime + 0.25);
        return {
          text: String(word.text || '').trim(),
          startTime,
          endTime: Math.max(startTime + 0.01, wordEnd),
        };
      })
      .filter((word) => word.text);
    return {
      startTime: entry.time,
      endTime,
      fullText: entry.original,
      words: words.length ? words : [{ text: entry.original, startTime: entry.time, endTime }],
      ...(entry.translation ? { translation: entry.translation } : {}),
      ...(entry.furigana ? { romanization: entry.furigana } : {}),
    };
  });

  const artist = Array.isArray(song?.artists)
    ? song.artists.map((item) => String(item?.name || '')).filter(Boolean).join(' / ')
    : '';
  return {
    lines,
    title: String(song?.name || ''),
    artist,
    isWordByWord: rows.some((entry) => entry.words.length > 0),
  };
}

function readFollowSession(raw: unknown): FollowSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as UnknownRecord;
  const version = Number(data.version);
  if (!Number.isInteger(version) || version < 0) return null;
  const track = data.track && typeof data.track === 'object' ? data.track as UnknownRecord : null;
  const queue = Array.isArray(data.queue) ? data.queue.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object') : [];
  const playlist = data.playlist && typeof data.playlist === 'object' ? data.playlist as UnknownRecord : null;
  const lyrics = Array.isArray(data.lyrics) ? data.lyrics.filter((item): item is UnknownRecord => Boolean(item) && typeof item === 'object') : [];
  return {
    version,
    track,
    queue,
    playlist,
    lyrics,
    lyricRenderMode: String(data.lyricRenderMode || 'original'),
    lyricIndex: Number.isInteger(Number(data.lyricIndex)) ? Number(data.lyricIndex) : -1,
    positionMs: Math.max(0, Number(data.positionMs || 0)),
    durationMs: Math.max(0, Number(data.durationMs || 0)),
    playing: Boolean(data.playing),
  };
}

function writeFollowClock(positionSec: number): void {
  const safePosition = Math.max(0, Number(positionSec) || 0);
  try {
    const clock = (window as unknown as { __folia_current_time?: { set(v: number): void } }).__folia_current_time;
    clock?.set(safePosition);
    lyricCurrentTime.set(safePosition);
    const store = usePlaybackStore.getState();
    const lines = store.lyrics?.lines || [];
    if (lines.length) {
      const index = findLatestActiveLineIndex(lines, safePosition);
      if (index !== store.currentLineIndex) store.setCurrentLineIndex(index);
    }
  } catch {
    // A failed visual projection must never affect the owner audio element.
  }
}

function runFollowClockFrame(now: number): void {
  followClockFrame = 0;
  if (!followPlaybackActive) return;
  const elapsedSec = followClockPlaying ? Math.max(0, now - followClockStartedAt) / 1000 : 0;
  writeFollowClock(followClockPositionSec + elapsedSec);
  if (followClockPlaying) followClockFrame = window.requestAnimationFrame(runFollowClockFrame);
}

function syncFollowClock(positionMs: number, playing: boolean): void {
  followClockPositionSec = Math.max(0, Number(positionMs) || 0) / 1000;
  followClockStartedAt = performance.now();
  followClockPlaying = playing;
  if (followClockFrame) window.cancelAnimationFrame(followClockFrame);
  followClockFrame = 0;
  writeFollowClock(followClockPositionSec);
  if (followPlaybackActive && followClockPlaying) {
    followClockFrame = window.requestAnimationFrame(runFollowClockFrame);
  }
}

function embeddedAudioElements(): HTMLAudioElement[] {
  return Array.from(document.querySelectorAll<HTMLAudioElement>(EMBED_AUDIO_SELECTOR));
}

/** Clear every Folia media element so it cannot become a second sound source. */
function lockEmbeddedAudio(): void {
  for (const audio of embeddedAudioElements()) {
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.src = '';
      audio.load();
    } catch {
      // Keep checking the remaining elements if one browser media call fails.
    }
  }
}

function installEmbeddedAudioLock(): void {
  if (audioLockInstalled || typeof document === 'undefined') return;
  audioLockInstalled = true;
  document.addEventListener('play', (event) => {
    if (!followPlaybackActive) return;
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement)) return;
    const root = document.getElementById('folia-embed-root');
    if (!root?.contains(audio)) return;
    suppressPlaybackCommandsUntil = performance.now() + 500;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.src = '';
      audio.load();
    } catch {
      // The main site remains audible even when an upstream media call fails.
    }
    window.setTimeout(() => {
      if (!followPlaybackActive) return;
      suppressPlaybackCommandsUntil = performance.now() + 150;
      usePlaybackStore.getState().setPlayerState(followClockPlaying ? PlayerState.PLAYING : PlayerState.PAUSED);
    }, 0);
  }, true);
}

function readEmbeddedProgressInput(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof HTMLInputElement) || target.type !== 'range') return null;
  const root = document.getElementById('folia-embed-root');
  return root?.contains(target) ? target : null;
}

function readEmbeddedProgressPosition(target: HTMLInputElement): number | null {
  if (!followPlaybackActive) return null;
  const duration = Math.max(0, Number(usePlaybackStore.getState().duration) || 0);
  const minimum = Number(target.min || 0);
  const maximum = Number(target.max);
  const value = Number(target.value);
  const tolerance = Math.max(1, duration * 0.04);
  if (!duration || !Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(value)) return null;
  // Duration matching excludes volume/preferences without hard-coding Folia's markup.
  if (maximum <= minimum || Math.abs(maximum - duration) > tolerance || value < minimum || value > maximum) return null;
  return Math.min(duration, Math.max(0, value));
}

function readProgressPositionFromPointer(target: HTMLInputElement, clientX: number): number | null {
  const current = readEmbeddedProgressPosition(target);
  if (current === null) return null;
  const rect = target.getBoundingClientRect();
  if (!Number.isFinite(clientX) || rect.width <= 0) return current;
  const minimum = Number(target.min || 0);
  const maximum = Number(target.max);
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const value = minimum + (maximum - minimum) * ratio;
  target.value = String(value);
  return Math.min(maximum, Math.max(minimum, value));
}

function relayEmbeddedProgressSeek(positionSec: number): void {
  const now = performance.now();
  const unchanged = Math.abs(positionSec - lastFollowSeekPositionSec) < 0.05;
  if (unchanged && now - lastFollowSeekAt < 45) return;

  lastFollowSeekPositionSec = positionSec;
  lastFollowSeekAt = now;
  syncFollowClock(Math.round(positionSec * 1000), followClockPlaying);
  postToParent({
    type: 'shizuki:playback-command',
    action: 'seek',
    positionMs: Math.round(positionSec * 1000),
  });
}

/** Route keyboard and native range input changes to the site-owned audio element. */
function handleEmbeddedProgressSeek(event: Event): void {
  const input = readEmbeddedProgressInput(event.target);
  const positionSec = input ? readEmbeddedProgressPosition(input) : null;
  if (positionSec === null) return;
  event.stopPropagation();
  relayEmbeddedProgressSeek(positionSec);
}

/** Give the Folia scrubber immediate visual and audio feedback while dragging. */
function handleEmbeddedProgressPointer(event: PointerEvent): void {
  if (event.type === 'pointerdown') {
    const input = readEmbeddedProgressInput(event.target);
    if (!input) return;
    activeProgressInput = input;
    activeProgressPointerId = event.pointerId;
  }
  if (!activeProgressInput || activeProgressPointerId !== event.pointerId) return;

  const positionSec = readProgressPositionFromPointer(activeProgressInput, event.clientX);
  if (positionSec !== null) {
    event.stopPropagation();
    relayEmbeddedProgressSeek(positionSec);
  }
  if (event.type === 'pointerup' || event.type === 'pointercancel') {
    activeProgressInput = null;
    activeProgressPointerId = null;
  }
}

function installEmbeddedProgressSeekBridge(): void {
  if (progressSeekBridgeInstalled || typeof document === 'undefined') return;
  progressSeekBridgeInstalled = true;
  document.addEventListener('input', handleEmbeddedProgressSeek, true);
  document.addEventListener('change', handleEmbeddedProgressSeek, true);
  document.addEventListener('pointerdown', handleEmbeddedProgressPointer, true);
  document.addEventListener('pointermove', handleEmbeddedProgressPointer, true);
  document.addEventListener('pointerup', handleEmbeddedProgressPointer, true);
  document.addEventListener('pointercancel', handleEmbeddedProgressPointer, true);
}

function readNavigationAction(target: EventTarget | null): 'next' | 'previous' | null {
  if (!(target instanceof Element)) return null;
  const button = target.closest('button');
  const root = document.getElementById('folia-embed-root');
  if (!button || !root?.contains(button)) return null;
  const hint = [
    button.getAttribute('aria-label'),
    button.getAttribute('title'),
    button.getAttribute('data-tooltip-content'),
    button.getAttribute('data-action'),
    button.className,
    button.textContent,
    ...Array.from(button.querySelectorAll('[data-lucide], svg, i')).map((node) => (
      `${node.getAttribute('data-lucide') || ''} ${node.getAttribute('class') || ''}`
    ))
  ].join(' ').toLowerCase();
  if (/(next|skip[-_ ]?forward|forward|下一首|下一个)/.test(hint)) return 'next';
  if (/(previous|prev|skip[-_ ]?back|backward|上一首|上一个)/.test(hint)) return 'previous';
  return null;
}

function installEmbeddedNavigationBridge(): void {
  if (navigationBridgeInstalled || typeof document === 'undefined') return;
  navigationBridgeInstalled = true;
  document.addEventListener('click', (event) => {
    if (!followPlaybackActive) return;
    const action = readNavigationAction(event.target);
    if (!action) return;
    pendingNavigationAction = action;
    pendingNavigationActionAt = performance.now();
  }, true);
}

function relayEmbeddedNavigation(action: 'next' | 'previous'): void {
  suppressPlaybackCommandsUntil = performance.now() + 750;
  lockEmbeddedAudio();
  const store = usePlaybackStore.getState();
  store.setAudioSrc(null);
  store.setPlayerState(PlayerState.PAUSED);
  postToParent({ type: 'shizuki:playback-command', action });
}

function applyFollowSession(session: FollowSession): void {
  if (session.version < latestFollowSessionVersion) return;
  latestFollowSessionVersion = session.version;
  followPlaybackActive = true;
  suppressPlaybackCommandsUntil = performance.now() + 900;

  const store = usePlaybackStore.getState();
  const song = readFollowSong(session.track);
  const queue = readFollowQueue(session.queue);
  const lyrics = buildFollowLyrics(session.lyrics, song, session.durationMs);
  lockEmbeddedAudio();
  store.setAudioSrc(null);
  store.setCurrentSong(song);
  store.setPlayQueue(queue.length ? queue : (song ? [song] : []));
  store.setCachedCoverUrl(String(song?.album?.picUrl || ''));
  store.setDuration(Math.max(0, Number(session.durationMs || 0) / 1000));
  store.setLyricsState(lyrics);
  store.setCurrentLineIndex(session.lyricIndex);
  store.setPlayerState(session.playing ? PlayerState.PLAYING : PlayerState.PAUSED);
  try {
    (window as unknown as { __shizukiPlaybackSession?: FollowSession }).__shizukiPlaybackSession = session;
  } catch {
    // The store remains sufficient if diagnostics cannot be attached to window.
  }
  syncFollowClock(session.positionMs, session.playing);
  syncEmbedLyricSizing();
}

function stopFollowPlayback(): void {
  followPlaybackActive = false;
  followClockPlaying = false;
  latestFollowSessionVersion = -1;
  if (followClockFrame) window.cancelAnimationFrame(followClockFrame);
  followClockFrame = 0;
  suppressPlaybackCommandsUntil = performance.now() + 300;
  lockEmbeddedAudio();
  try {
    const store = usePlaybackStore.getState();
    store.setAudioSrc(null);
    store.setPlayerState(PlayerState.PAUSED);
  } catch {
    // no-op
  }
}

function readCookieFromStorage(): string {
  try {
    return window.localStorage.getItem(COOKIE_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeCookieToStorage(cookie: string): void {
  if (!cookie) return;
  try {
    window.localStorage.setItem(COOKIE_STORAGE_KEY, cookie);
    // The parent already owns this value when it sends a sync request. Record
    // it so the change watcher does not echo the same credential back.
    lastReportedCookie = cookie;
  } catch {
    // no-op
  }
}

function postToParent(payload: UnknownRecord): void {
  try {
    window.parent.postMessage(payload, '*');
  } catch {
    // no-op
  }
}

/** Return a newly completed Folia login to the site without repeatedly exposing it. */
function reportCookieIfChanged(): void {
  const cookie = readCookieFromStorage();
  if (!cookie || cookie === lastReportedCookie) return;
  lastReportedCookie = cookie;
  postToParent({ type: 'shizuki:cookie', cookie });
}

/**
 * Folia's login writes localStorage in this same document, so the browser's
 * storage event alone is insufficient. A low-frequency check covers that
 * case while only emitting when the credential value actually changes.
 */
function installCookieBridge(): void {
  if (cookieBridgeInstalled || typeof window === 'undefined') return;
  cookieBridgeInstalled = true;
  lastReportedCookie = readCookieFromStorage();
  window.addEventListener('storage', (event) => {
    if (event.key === COOKIE_STORAGE_KEY) reportCookieIfChanged();
  });
  window.setInterval(reportCookieIfChanged, 1500);
}

function readSongId(song: unknown): number {
  const id = Number((song as { id?: unknown } | null)?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function snapshotStatus(): UnknownRecord {
  const state = usePlaybackStore.getState();
  const song = state.currentSong as (SongResult & { album?: { picUrl?: string } }) | null;
  const artists = Array.isArray(song?.artists)
    ? song.artists.map((artist) => String(artist?.name || '')).filter(Boolean)
    : [];
  return {
    track: song
      ? {
        id: song.id,
        trackId: String((song as unknown as { trackId?: unknown }).trackId || song.id),
        provider: String((song as unknown as { provider?: unknown }).provider || 'netease'),
        name: String(song.name || ''),
        artists,
        coverUrl: String(song.album?.picUrl || ''),
        durationMs: Number(song.durationMs || 0),
      }
      : null,
    positionMs: Math.round(followClockPositionSec * 1000),
    playing: followClockPlaying,
    liked: Boolean((state as unknown as { isLiked?: boolean }).isLiked),
    sessionVersion: latestFollowSessionVersion,
  };
}

function forwardTrackIntent(rawTrack: UnknownRecord, positionMs = 0, playing = true): void {
  suppressPlaybackCommandsUntil = performance.now() + 600;
  lockEmbeddedAudio();
  const store = usePlaybackStore.getState();
  store.setAudioSrc(null);
  store.setPlayerState(PlayerState.PAUSED);
  postToParent({ type: 'shizuki:playback-intent', track: rawTrack, positionMs, playing });
}

function handleMessage(event: MessageEvent): void {
  const data = event.data as UnknownRecord | null;
  if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
  const type = data.type;

  if (type === 'shizuki:sync-cookie') {
    writeCookieToStorage(typeof data.cookie === 'string' ? data.cookie : '');
    return;
  }
  if (type === 'shizuki:get-cookie') {
    postToParent({ type: 'shizuki:cookie', cookie: readCookieFromStorage() });
    return;
  }
  if (type === 'shizuki:set-theme') {
    if (typeof data.isDaylight === 'boolean') {
      import('./stores/useThemeSettingsStore')
        .then(({ useThemeSettingsStore }) => useThemeSettingsStore.getState().setDaylightPreference(Boolean(data.isDaylight)))
        .catch(() => {});
    }
    return;
  }
  if (type === 'shizuki:set-wallpaper') {
    installEmbedWallpaperStyle();
    applyEmbedWallpaper(data.source, data.preview);
    return;
  }
  if (type === 'shizuki:set-view') {
    const view = String(data.view || '').trim();
    if (view === 'player' || view === 'lattice') {
      import('./stores/useAppViewStore')
        .then(({ useAppViewStore }) => useAppViewStore.getState().setView(view as 'player' | 'lattice'))
        .catch(() => {});
    }
    return;
  }
  if (type === 'shizuki:follow-playback') {
    const session = readFollowSession(data.session);
    if (session) applyFollowSession(session);
    return;
  }
  if (type === 'shizuki:activate-playback-bridge') {
    followPlaybackActive = true;
    suppressPlaybackCommandsUntil = performance.now() + 300;
    lockEmbeddedAudio();
    usePlaybackStore.getState().setAudioSrc(null);
    return;
  }
  if (type === 'shizuki:stop-follow-playback') {
    stopFollowPlayback();
    return;
  }
  if (type === 'shizuki:sync-clock') {
    if (!followPlaybackActive) return;
    const playing = Boolean(data.playing);
    suppressPlaybackCommandsUntil = performance.now() + 120;
    usePlaybackStore.getState().setPlayerState(playing ? PlayerState.PLAYING : PlayerState.PAUSED);
    syncFollowClock(Number(data.positionMs || 0), playing);
    return;
  }
  if (type === 'shizuki:play-track') {
    const trackId = Number(data.trackId);
    if (Number.isFinite(trackId) && trackId > 0) {
      forwardTrackIntent({ id: trackId, trackId, provider: 'netease' }, Number(data.positionMs || 0), true);
    }
    return;
  }
  if (type === 'shizuki:play-tracks') {
    // The site owns queues in embedded mode. Do not re-enable Folia audio.
    postToParent({ type: 'shizuki:play-tracks-result', ok: false, error: 'embedded playback is site-owned' });
    return;
  }
  if (type === 'shizuki:get-status') {
    postToParent({ type: 'shizuki:status', ...snapshotStatus() });
  }
}

/** Install the bridge listener once. Safe to call multiple times. */
export function installShizukiExternalBridge(): void {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { __shizukiBridgeInstalled?: boolean }).__shizukiBridgeInstalled) return;
  (window as unknown as { __shizukiBridgeInstalled?: boolean }).__shizukiBridgeInstalled = true;
  installEmbeddedAudioLock();
  installEmbeddedProgressSeekBridge();
  installEmbeddedNavigationBridge();
  installCookieBridge();
  installEmbedWallpaperStyle();
  installEmbedLyricSizing();
  window.addEventListener('message', handleMessage);
  usePlaybackStore.subscribe((state, previousState) => {
    const now = performance.now();
    const switchedTrack = readSongId(state.currentSong) !== readSongId(previousState.currentSong);
    const startedLocalAudio = Boolean(state.audioSrc) && state.audioSrc !== previousState.audioSrc;

    if (followPlaybackActive && now >= suppressPlaybackCommandsUntil && startedLocalAudio) {
      suppressPlaybackCommandsUntil = now + 500;
      lockEmbeddedAudio();
      usePlaybackStore.getState().setAudioSrc(null);
      return;
    }
    if (followPlaybackActive && switchedTrack && now >= suppressPlaybackCommandsUntil) {
      const navigationAction = now - pendingNavigationActionAt < 1200 ? pendingNavigationAction : null;
      pendingNavigationAction = null;
      pendingNavigationActionAt = 0;
      if (navigationAction) {
        // The main player owns shuffle order. Do not fall back to Folia's
        // display queue when a visitor uses previous/next controls.
        relayEmbeddedNavigation(navigationAction);
        return;
      }
      const snapshot = snapshotStatus();
      const track = snapshot.track as UnknownRecord | null;
      if (track) forwardTrackIntent(track, 0, true);
      return;
    }
    if (!followPlaybackActive || now < suppressPlaybackCommandsUntil) return;
    if (state.playerState === previousState.playerState) return;
    if (state.playerState === PlayerState.PLAYING) {
      postToParent({ type: 'shizuki:playback-command', action: 'play' });
    } else if (state.playerState === PlayerState.PAUSED) {
      postToParent({ type: 'shizuki:playback-command', action: 'pause' });
    }
  });
  const pending = (window as unknown as { __shizukiPendingCookie?: string }).__shizukiPendingCookie;
  if (pending) {
    writeCookieToStorage(pending);
    delete (window as unknown as { __shizukiPendingCookie?: string }).__shizukiPendingCookie;
  }
}
