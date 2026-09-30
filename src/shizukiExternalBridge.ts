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
import { currentTime, lyricCurrentTime } from './stores/motionSignals';
import { findLatestActiveLineIndex } from './utils/appPlaybackHelpers';
import { projectEmbeddedPlaybackClock } from './services/shizukiEmbeddedPlayback';

const COOKIE_STORAGE_KEYS = ['online_provider:netease:cookie', 'netease_cookie'];
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
let applyingFollowSession = false;
let latestFollowSessionVersion = -1;
let latestFollowLyricsFingerprint = '';
let audioLockInstalled = false;
let progressSeekBridgeInstalled = false;
let navigationBridgeInstalled = false;
let lastFollowSeekPositionSec = -1;
let lastFollowSeekAt = 0;
let activeProgressInput: HTMLInputElement | null = null;
let activeProgressPointerId: number | null = null;
let cookieBridgeInstalled = false;
let lastReportedCookie = '';
let embedWallpaperStyleInstalled = false;
let embedWallpaperObserver: MutationObserver | null = null;
let embedLyricColorStyleInstalled = false;
let embedLyricSizingInstalled = false;
let embedLyricBaseScale: number | null = null;
let embedLyricAppliedScale: number | null = null;
let embedLyricSizingAuditFrame = 0;
let embedLyricSizingAuditFrames = 0;
let embedLyricGeometryLineKey = '';
let embedLyricGeometrySnapshot: { center: number; width: number } | null = null;
let embedLyricGeometryStableFrames = 0;
let embedLyricGeometryCommittedLineKey = '';
let embedLyricMeasuredRootWidth = 0;
let embedLyricHorizontalCorrection: {
  element: HTMLElement;
  lineKey: string;
  originalInlineTranslate: string;
  appliedOffset: number;
} | null = null;

const EMBED_LYRIC_HORIZONTAL_GUTTER = 32;
const EMBED_LYRIC_PRIMARY_FONT_SCALE = 2;
const EMBED_LYRIC_ACTIVE_WORD_SELECTOR = '[data-shizuki-folia-active-lyric-word]';
const EMBED_LYRIC_LINE_SELECTOR = '[data-shizuki-folia-lyric-line]';
const EMBED_LYRIC_STABLE_GEOMETRY_FRAMES = 4;
const EMBED_LYRIC_STABILITY_RATIO = 0.015;
const EMBED_LYRIC_ACTIVE_WORD_TRANSFORM_SAFETY = 1.6;

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
.folia-embed-pane:fullscreen #folia-embed-root[data-shizuki-wallpaper='active']::before,
.folia-embed-pane[data-folia-expanded='true'] #folia-embed-root[data-shizuki-wallpaper='active']::before {
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

function applyEmbedLyricColor(rawColor: unknown): void {
  const root = document.getElementById('folia-embed-root');
  if (!root) return;
  const color = String(rawColor || '').trim();
  if (!/^#[\da-f]{6}$/i.test(color)) {
    delete root.dataset.shizukiLyricColor;
    root.style.removeProperty('--shizuki-folia-lyric-color');
    return;
  }

  if (!embedLyricColorStyleInstalled) {
    const style = document.createElement('style');
    style.id = 'shizuki-folia-lyric-color-style';
    style.textContent = `
#folia-embed-root[data-shizuki-lyric-color='custom'] [data-shizuki-folia-lyric-word-body] {
  color: var(--shizuki-folia-lyric-color) !important;
}
`;
    document.head.appendChild(style);
    embedLyricColorStyleInstalled = true;
  }

  root.dataset.shizukiLyricColor = 'custom';
  root.style.setProperty('--shizuki-folia-lyric-color', color);
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
function getEmbedLyricWeightedGraphemeWidth(text: string): number {
  return Array.from(text).reduce((width, grapheme) => {
    if (/\s/u.test(grapheme)) return width + 0.34;
    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/u.test(grapheme)) return width + 1;
    if (/[A-Z0-9]/u.test(grapheme)) return width + 0.7;
    if (/[a-z]/u.test(grapheme)) return width + 0.58;
    return width + 0.48;
  }, 0);
}

function getEmbedLyricAvailableWidth(root: HTMLElement): number {
  return Math.max(1, root.clientWidth - EMBED_LYRIC_HORIZONTAL_GUTTER * 2);
}

function isEmbedLyricElementVisible(element: HTMLElement, root: HTMLElement): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.display === 'none'
      || style.visibility === 'hidden'
      || Number.parseFloat(style.opacity || '1') <= 0.01
    ) {
      return false;
    }
    if (current === root) return true;
    current = current.parentElement;
  }
  return false;
}

function getEmbedActiveLyricScope(root: HTMLElement, activeLine: { startTime: number }): HTMLElement | null {
  const lineKey = String(activeLine.startTime);
  return Array.from(root.querySelectorAll<HTMLElement>(EMBED_LYRIC_LINE_SELECTOR))
    .find((element) => element.dataset.shizukiFoliaLyricLine === lineKey) ?? null;
}

function measureEmbedActiveLyricBounds(root: HTMLElement, activeLine: { startTime: number }): {
  left: number;
  right: number;
  width: number;
  layoutWidth: number;
} | null {
  const scope = getEmbedActiveLyricScope(root, activeLine);
  if (!scope) return null;
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let layoutWidth = 0;

  scope.querySelectorAll<HTMLElement>(EMBED_LYRIC_ACTIVE_WORD_SELECTOR).forEach((element) => {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return;
    const marginLeft = Number.parseFloat(style.marginLeft || '0') || 0;
    const marginRight = Number.parseFloat(style.marginRight || '0') || 0;
    layoutWidth += Math.max(0, element.offsetWidth) + marginLeft + marginRight;
    if (!isEmbedLyricElementVisible(element, root)) return;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    left = Math.min(left, rect.left);
    right = Math.max(right, rect.right);
  });

  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    return layoutWidth > 0 ? { left: 0, right: 0, width: 0, layoutWidth } : null;
  }
  return { left, right, width: Math.max(0, right - left), layoutWidth };
}

function isEmbedLyricGeometryStable(
  activeLine: { startTime: number },
  bounds: { left: number; right: number; width: number },
): boolean {
  const lineKey = String(activeLine.startTime);
  const center = (bounds.left + bounds.right) / 2;
  if (embedLyricGeometryLineKey !== lineKey) {
    embedLyricGeometryLineKey = lineKey;
    embedLyricGeometrySnapshot = { center, width: bounds.width };
    embedLyricGeometryStableFrames = 0;
    embedLyricGeometryCommittedLineKey = '';
    return false;
  }
  if (embedLyricGeometryCommittedLineKey === lineKey) return true;

  const previous = embedLyricGeometrySnapshot;
  embedLyricGeometrySnapshot = { center, width: bounds.width };
  if (!previous) return false;
  const tolerance = Math.max(
    1.5,
    Math.max(previous.width, bounds.width) * EMBED_LYRIC_STABILITY_RATIO,
  );
  const stable = Math.abs(previous.center - center) <= tolerance
    && Math.abs(previous.width - bounds.width) <= tolerance;
  embedLyricGeometryStableFrames = stable ? embedLyricGeometryStableFrames + 1 : 0;
  if (embedLyricGeometryStableFrames < EMBED_LYRIC_STABLE_GEOMETRY_FRAMES) return false;
  embedLyricGeometryCommittedLineKey = lineKey;
  return true;
}

function resetEmbedLyricGeometry(): void {
  embedLyricGeometryLineKey = '';
  embedLyricGeometrySnapshot = null;
  embedLyricGeometryStableFrames = 0;
  embedLyricGeometryCommittedLineKey = '';
}

function restoreEmbedLyricHorizontalCorrection(): void {
  const correction = embedLyricHorizontalCorrection;
  if (!correction) return;
  if (correction.originalInlineTranslate) {
    correction.element.style.setProperty('translate', correction.originalInlineTranslate);
  } else {
    correction.element.style.removeProperty('translate');
  }
  delete correction.element.dataset.shizukiFoliaLyricOffset;
  embedLyricHorizontalCorrection = null;
}

function resolveEmbedLyricHorizontalOffset(
  bounds: { left: number; right: number },
  safeLeft: number,
  safeRight: number,
): number {
  const minimumOffset = safeLeft - bounds.left;
  const maximumOffset = safeRight - bounds.right;
  if (minimumOffset <= maximumOffset) {
    return Math.min(maximumOffset, Math.max(minimumOffset, 0));
  }
  return ((safeLeft + safeRight) - (bounds.left + bounds.right)) / 2;
}

function syncEmbedLyricHorizontalCorrection(
  root: HTMLElement,
  activeLine: { startTime: number },
): void {
  const lineKey = String(activeLine.startTime);
  if (embedLyricGeometryCommittedLineKey !== lineKey) return;

  const scope = getEmbedActiveLyricScope(root, activeLine);
  if (!scope) {
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
    return;
  }
  if (
    embedLyricHorizontalCorrection
    && (
      embedLyricHorizontalCorrection.lineKey !== lineKey
      || embedLyricHorizontalCorrection.element !== scope
      || !embedLyricHorizontalCorrection.element.isConnected
    )
  ) {
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
    return;
  }

  const renderedBounds = measureEmbedActiveLyricBounds(root, activeLine);
  if (!renderedBounds || renderedBounds.width <= 0) return;
  const appliedOffset = embedLyricHorizontalCorrection?.appliedOffset ?? 0;
  const uncorrectedBounds = {
    left: renderedBounds.left - appliedOffset,
    right: renderedBounds.right - appliedOffset,
  };
  const rootRect = root.getBoundingClientRect();
  const safeLeft = rootRect.left + EMBED_LYRIC_HORIZONTAL_GUTTER;
  const safeRight = rootRect.right - EMBED_LYRIC_HORIZONTAL_GUTTER;
  const maximumCorrection = Math.max(root.clientWidth, EMBED_LYRIC_HORIZONTAL_GUTTER * 2);
  const resolvedOffset = resolveEmbedLyricHorizontalOffset(uncorrectedBounds, safeLeft, safeRight);
  const nextOffset = Math.max(-maximumCorrection, Math.min(maximumCorrection, resolvedOffset));
  const normalizedOffset = Math.abs(nextOffset) < 0.5 ? 0 : nextOffset;

  if (normalizedOffset === 0) {
    restoreEmbedLyricHorizontalCorrection();
    return;
  }
  if (
    embedLyricHorizontalCorrection
    && Math.abs(embedLyricHorizontalCorrection.appliedOffset - normalizedOffset) < 0.5
  ) {
    return;
  }
  if (!embedLyricHorizontalCorrection) {
    embedLyricHorizontalCorrection = {
      element: scope,
      lineKey,
      originalInlineTranslate: scope.style.getPropertyValue('translate'),
      appliedOffset: 0,
    };
  }
  embedLyricHorizontalCorrection.appliedOffset = normalizedOffset;
  scope.dataset.shizukiFoliaLyricOffset = normalizedOffset.toFixed(3);
  // CSS translate is independent from Framer Motion's transform property.
  scope.style.setProperty('translate', `${normalizedOffset.toFixed(3)}px 0`);
}

function resolveEmbedLyricContentScale(
  root: HTMLElement,
  preferredScale: number,
  currentScale: number,
): number {
  const state = usePlaybackStore.getState();
  const lines = state.lyrics?.lines ?? [];
  const activeLine = lines[state.currentLineIndex] ?? null;
  const text = String(activeLine?.fullText || '').trim();
  if (!text) return 1;

  const weightedGraphemeWidth = getEmbedLyricWeightedGraphemeWidth(text);
  if (weightedGraphemeWidth < 2) return 1;

  const availableTextWidth = getEmbedLyricAvailableWidth(root);
  const safePreferredScale = Math.max(Number(preferredScale) || 1, 0.01);
  const safeCurrentScale = Math.max(Number(currentScale) || safePreferredScale, 0.01);
  const renderedBounds = measureEmbedActiveLyricBounds(root, activeLine);
  if (renderedBounds) {
    const layoutScale = renderedBounds.layoutWidth > 0
      ? Math.min(
        1,
        (safeCurrentScale * availableTextWidth)
          / (renderedBounds.layoutWidth * EMBED_LYRIC_ACTIVE_WORD_TRANSFORM_SAFETY * safePreferredScale),
      )
      : 1;
    if (
      renderedBounds.width <= 0
      || !isEmbedLyricGeometryStable(activeLine, renderedBounds)
    ) {
      // Framer Motion first exposes the new line at its waiting pose, then
      // springs every word into place. offsetWidth is transform-independent,
      // so use it until several consecutive frames agree on the final bounds.
      return Math.max(0.01, layoutScale);
    }
    const maximumGrowth = safePreferredScale / safeCurrentScale;
    const widthScale = availableTextWidth / renderedBounds.width;
    const measuredScale = Math.max(
      0.01,
      Math.min(widthScale, maximumGrowth),
    );
    // DOMRects include the active-word transforms and random line placement.
    // Convert that measured contraction back to the preferred-scale basis.
    const visualScale = Math.min(
      1,
      (safeCurrentScale * measuredScale) / safePreferredScale,
    );
    // Word-level highlight transforms keep moving after the line container has
    // settled. They may briefly squeeze the measured half-width near one edge;
    // never let that animated pose undercut the transform-independent layout
    // width that already reserves emphasis headroom for the complete line.
    return Math.max(layoutScale, visualScale);
  }

  // Before Cadenza has mounted its word nodes, match its two-times font tuning
  // instead of the unscaled 94px viewport baseline used by the old estimate.
  const baseFontPx = Math.min(
    94 * EMBED_LYRIC_PRIMARY_FONT_SCALE,
    Math.max(34 * EMBED_LYRIC_PRIMARY_FONT_SCALE, root.clientWidth * 0.086 * EMBED_LYRIC_PRIMARY_FONT_SCALE),
  );
  const estimatedLineWidth = weightedGraphemeWidth
    * baseFontPx
    * safePreferredScale
    * EMBED_LYRIC_ACTIVE_WORD_TRANSFORM_SAFETY;
  return Math.min(1, availableTextWidth / Math.max(estimatedLineWidth, 1));
}

function syncEmbedLyricSizing(): void {
  const root = document.getElementById('folia-embed-root');
  if (!root || root.clientWidth < 240 || typeof window === 'undefined') {
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
    return;
  }
  if (Math.abs(embedLyricMeasuredRootWidth - root.clientWidth) > 1) {
    embedLyricMeasuredRootWidth = root.clientWidth;
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
  }
  const playback = usePlaybackStore.getState();
  const activeLine = playback.lyrics?.lines?.[playback.currentLineIndex] ?? null;
  if (!activeLine) {
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
    return;
  }
  const activeLineKey = String(activeLine.startTime);
  const activeScope = getEmbedActiveLyricScope(root, activeLine);
  if (
    embedLyricHorizontalCorrection
    && (
      embedLyricHorizontalCorrection.lineKey !== activeLineKey
      || embedLyricHorizontalCorrection.element !== activeScope
      || !embedLyricHorizontalCorrection.element.isConnected
    )
  ) {
    restoreEmbedLyricHorizontalCorrection();
    resetEmbedLyricGeometry();
  }
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
  const contentScale = resolveEmbedLyricContentScale(root, preferredScale, currentScale);
  const nextScale = Math.max(
    0.01,
    Math.min(preferredScale, preferredScale * widthRatio, preferredScale * contentScale),
  );
  if (Math.abs(currentScale - nextScale) < 0.005) {
    syncEmbedLyricHorizontalCorrection(root, activeLine);
    return;
  }
  restoreEmbedLyricHorizontalCorrection();
  resetEmbedLyricGeometry();
  embedLyricAppliedScale = nextScale;
  // setState deliberately avoids persisting an embed-only presentation value.
  useTypographySettingsStore.setState({ lyricsFontScale: nextScale });
}

function scheduleEmbedLyricSizingAudit(frameCount = 90): void {
  embedLyricSizingAuditFrames = Math.max(
    embedLyricSizingAuditFrames,
    Math.max(1, Math.floor(frameCount)),
  );
  if (embedLyricSizingAuditFrame) return;
  const run = () => {
    embedLyricSizingAuditFrame = 0;
    syncEmbedLyricSizing();
    embedLyricSizingAuditFrames -= 1;
    if (embedLyricSizingAuditFrames > 0) {
      embedLyricSizingAuditFrame = window.requestAnimationFrame(run);
    }
  };
  embedLyricSizingAuditFrame = window.requestAnimationFrame(run);
}

function installEmbedLyricSizing(): void {
  if (embedLyricSizingInstalled || typeof document === 'undefined') return;
  embedLyricSizingInstalled = true;
  const root = document.getElementById('folia-embed-root');
  if (root && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => scheduleEmbedLyricSizingAudit()).observe(root);
  }
  window.addEventListener('resize', () => scheduleEmbedLyricSizingAudit());
  scheduleEmbedLyricSizingAudit();
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
      coverUrl: String(rawAlbum.coverUrl || rawAlbum.picUrl || rawTrack.cover || rawTrack.coverUrl || rawTrack.cover_url || ''),
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

function buildFollowLyricsFingerprint(
  rawLyrics: unknown,
  song: SongResult | null,
  durationMs: number,
): string {
  const artists = Array.isArray(song?.artists)
    ? song.artists.map((artist) => String(artist?.name || ''))
    : [];
  return JSON.stringify([
    Number(song?.id || 0),
    String(song?.name || ''),
    artists,
    Math.max(0, Number(durationMs) || 0),
    Array.isArray(rawLyrics) ? rawLyrics : [],
  ]);
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
    projectEmbeddedPlaybackClock(safePosition, currentTime, lyricCurrentTime);
    const store = usePlaybackStore.getState();
    const lines = store.lyrics?.lines || [];
    if (lines.length) {
      const index = findLatestActiveLineIndex(lines, safePosition);
      if (index !== store.currentLineIndex) {
        store.setCurrentLineIndex(index);
        scheduleEmbedLyricSizingAudit();
      }
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
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.src = '';
      audio.load();
    } catch {
      // The main site remains audible even when an upstream media call fails.
    }
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
    event.preventDefault();
    event.stopImmediatePropagation();
    relayEmbeddedNavigation(action);
  }, true);
}

function relayEmbeddedNavigation(action: 'next' | 'previous'): void {
  postToParent({ type: 'shizuki:playback-command', action });
}

function applyFollowSession(session: FollowSession): void {
  if (session.version < latestFollowSessionVersion) return;
  latestFollowSessionVersion = session.version;
  followPlaybackActive = true;
  applyingFollowSession = true;

  const store = usePlaybackStore.getState();
  const song = readFollowSong(session.track);
  const queue = readFollowQueue(session.queue);
  const lyricsFingerprint = buildFollowLyricsFingerprint(session.lyrics, song, session.durationMs);
  const lyricsChanged = lyricsFingerprint !== latestFollowLyricsFingerprint;
  try {
    lockEmbeddedAudio();
    store.setAudioSrc(null);
    store.setCurrentSong(song);
    store.setPlayQueue(queue.length ? queue : (song ? [song] : []));
    store.setCachedCoverUrl(String(song?.album?.coverUrl || ''));
    store.setDuration(Math.max(0, Number(session.durationMs || 0) / 1000));
    if (lyricsChanged) {
      const lyrics = buildFollowLyrics(session.lyrics, song, session.durationMs);
      latestFollowLyricsFingerprint = lyricsFingerprint;
      store.setLyricsState(lyrics);
    }
    store.setPlayerState(session.playing ? PlayerState.PLAYING : PlayerState.PAUSED);
    (window as unknown as { __shizukiPlaybackSession?: FollowSession }).__shizukiPlaybackSession = session;
  } catch {
    // The store remains sufficient if diagnostics cannot be attached to window.
  } finally {
    applyingFollowSession = false;
  }
  syncFollowClock(session.positionMs, session.playing);
  syncEmbedLyricSizing();
}

function stopFollowPlayback(): void {
  followPlaybackActive = false;
  followClockPlaying = false;
  latestFollowSessionVersion = -1;
  latestFollowLyricsFingerprint = '';
  if (followClockFrame) window.cancelAnimationFrame(followClockFrame);
  followClockFrame = 0;
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
    for (const key of COOKIE_STORAGE_KEYS) {
      const cookie = window.localStorage.getItem(key);
      if (cookie) return cookie;
    }
    return '';
  } catch {
    return '';
  }
}

function writeCookieToStorage(cookie: string): void {
  if (!cookie) return;
  try {
    for (const key of COOKIE_STORAGE_KEYS) window.localStorage.setItem(key, cookie);
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
    if (event.key && COOKIE_STORAGE_KEYS.includes(event.key)) reportCookieIfChanged();
  });
  window.setInterval(reportCookieIfChanged, 1500);
}

function snapshotStatus(): UnknownRecord {
  const state = usePlaybackStore.getState();
  const song = state.currentSong as SongResult | null;
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
        coverUrl: String(song.album?.coverUrl || ''),
        durationMs: Number(song.durationMs || 0),
      }
      : null,
    positionMs: Math.round(followClockPositionSec * 1000),
    playing: followClockPlaying,
    liked: Boolean((state as unknown as { isLiked?: boolean }).isLiked),
    sessionVersion: latestFollowSessionVersion,
  };
}

function readSongId(song: unknown): number {
  const id = Number((song as { id?: unknown } | null)?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

function forwardTrackIntent(rawTrack: UnknownRecord, positionMs = 0, playing = true): void {
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
  if (type === 'shizuki:set-lyric-color') {
    applyEmbedLyricColor(data.color);
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
    applyingFollowSession = true;
    try {
      usePlaybackStore.getState().setPlayerState(playing ? PlayerState.PLAYING : PlayerState.PAUSED);
      syncFollowClock(Number(data.positionMs || 0), playing);
    } finally {
      applyingFollowSession = false;
    }
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
    if (applyingFollowSession) return;
    const switchedTrack = readSongId(state.currentSong) !== readSongId(previousState.currentSong);
    const startedLocalAudio = Boolean(state.audioSrc) && state.audioSrc !== previousState.audioSrc;

    if (followPlaybackActive && switchedTrack) {
      const track = snapshotStatus().track as UnknownRecord | null;
      if (track) forwardTrackIntent(track, 0, true);
      return;
    }

    if (followPlaybackActive && startedLocalAudio) {
      lockEmbeddedAudio();
      usePlaybackStore.getState().setAudioSrc(null);
    }
  });
  const pending = (window as unknown as { __shizukiPendingCookie?: string }).__shizukiPendingCookie;
  if (pending) {
    writeCookieToStorage(pending);
    delete (window as unknown as { __shizukiPendingCookie?: string }).__shizukiPendingCookie;
  }
}
