## Why

The user reports that the host's lyric color picker remains ineffective in Folia. The existing embedded bridge reaches selected DOM bodies and the Lattice shader, but the shared full-player renderer model does not consume the preference. Existing tests cover the bridge CSS and Lattice rather than all full renderer themes.

## What Changes

- Consume embedded primary lyric color at the shared renderer model/theme boundary so mounted full-player modes update immediately and reset to their current theme.
- Preserve subtitle/background colors, mode-specific primary palette semantics, standalone behavior and runtime subscription cleanup.
- Add behavioral regressions through the real bridge and renderer consumer before changing implementation; validate representative DOM and non-DOM consumers.

## Capabilities

### New Capabilities

- `embedded-lyric-preferences`: Embedded primary lyric color consumption, live updates, reset and standalone isolation.

### Modified Capabilities

None.

## Impact

The shared visualizer renderer model and a focused embedded preference hook/helper, bridge tests and mounted renderer tests. No audio ownership, transport, queue or provider API change. The host follow-up is tracked in shizuki-site change fix-folia-color-controls-and-queue-return. Push the authorized IzumiShizuki/folia-major fork and deploy its verified runtime to the personal website server, preserving the existing rollback image.
