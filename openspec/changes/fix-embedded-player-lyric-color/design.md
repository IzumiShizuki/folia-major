## Context

See proposal.md for motivation. The bridge exposes a validated color on the embed root and emits a discrete event. Selected DOM word bodies and Lattice consume it. The shared renderer model otherwise forwards the unmodified theme; Canvas/Pixi/Three modes cannot consume root text CSS.

## Goals / Non-Goals

Goals: live primary color for mounted full renderers and theme reset without remounting, stable mode/reentry behavior, standalone isolation and subscription cleanup.

Non-goals: audio/queue ownership changes, recoloring subtitles or backgrounds, new per-frame React state, or broad App refactoring.

## Decisions

- Use a focused embedded preference hook plus pure theme overlay at the shared renderer model boundary. Read the embed-root initial value and subscribe once to the discrete bridge event with cleanup. Keeping this only in CSS misses non-DOM modes; adding another controller to App grows an already large module.
- Preserve non-primary theme fields and subtitleTheme identity. Make primary palette fields consistently reflect a selected color where modes derive primary text from them; resetting returns the current original theme, including later theme changes. Do not mutate caller-owned objects.
- Keep the existing wall/Lattice consumer and verify its reset alongside full-player consumption. Do not put playback clock or animation frames in React state.
- Tests shall install the real bridge, send the actual protocol event and inspect a mounted renderer boundary/representative consumer. A bridge-root style assertion alone is insufficient.

## Risks / Trade-offs

- Mode-specific primary palettes → cover primary palette fields, rendered DOM text and a representative non-DOM theme consumer; preserve translations/backgrounds.
- Parked embedding and standalone rendering share modules → root-gate the override, verify absence outside embedding and reset/unmount cleanup.
- Theme updates while custom color is active → derive the overlay from the latest theme rather than caching a stale reset target.

## Migration Plan

Capture red tests first; pass affected visualizer/bridge tests, TypeScript and the /music/ build. Commit/push only the owner's fork remote. Refresh the host's public snapshot/patch, deploy exact source with OCI revision, keep the prior gateway image, then verify actual lyric glyph color and reset on the signed-in site.

For the server's limited disk capacity, build /music locally from a clean committed checkout using the existing production provider/base/version arguments. Package a SHA-256 manifest and verify it before and after the equivalent Nginx runtime image is deployed. Transfer the precise source commit through a verified incremental Git bundle, retain rollback images and compare the running image label and served files with the local artifact. No private environment values enter public source or logs.
