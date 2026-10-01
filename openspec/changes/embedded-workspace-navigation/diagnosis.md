# Embedded navigation baseline

The host user confirmed playback-only playlist entry: P1 → P2 installs the complete P2 queue and plays its first song. Specific collection selections retain their actual index. Escape must remain in Folia and return to the current playlist.

Before repair, direct installed Node/Vitest execution of `test/unit/shizukiEmbeddedWorkspaceNavigation.integration.test.ts` plus `test/unit/shizukiEmbeddedPlayback.test.ts` produced **3 failed / 5 passed**. Root independently reproduced the result.

- Canonical navigation dispatched through the real external bridge and mounted useAppNavigation leaves the view at home.
- A real mounted return action following legacy set-view changes the host's history/URL to a collection hash.
- sendEmbeddedTrackIntent drops the complete native collection selection/context/index payload.

Fresh production host/Folia assets were verified. Wall song B selection, audio clock and Pause worked in one baseline pass; entering the full player changed the host URL to #player, then Escape and the native return button failed to leave that player. The host's mounted SFC separately proves that its Folia pane swallows bubbling Escape.

This establishes navigation, event propagation and selection-context defects. The broader report that every pointer/keyboard operation freezes was not independently reproduced in this pass. Final acceptance must exercise continuing controls and wall movement after selection; do not infer recovery from audio alone.

The host change `unify-folia-workspace-navigation/diagnosis.md` records the full accepted contract, live reproduction and ranked explanations. Preserve native IDs, stable queue entries and existing clock/color/prefetch/audio-owner regressions; standalone history must keep its native behavior.
