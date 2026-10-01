# Verification record

## Local implementation review

The host/fork contract and the accepted playback-only playlist rule are implemented. Root independently reviewed the boundary and ran the affected tests, type check and production build after Luna's handoff on 2026-10-01.

| Requirement | Implementation and behavioral evidence |
| --- | --- |
| Embedded history isolation | `embeddedWorkspaceNavigation.ts` and `useAppNavigation.ts`; mounted bridge/navigation integration covers host route preservation, real back actions, parked-root stale requests/reentry and standalone history. |
| Current playlist return | One bounded playback return; matching native source/provider/type/ID uses its actual collection snapshot, otherwise the current queue wall. Repeated B/C/D navigation does not stack prior song pages. |
| Complete selection handoff | Actual mounted queue controller relays native collection tracks/index and exact wall queue entries. Shortcuts remain queue-preserving and reveal the player. Folia never falls through into standalone audio resolution when parked. |
| Continuing input | Mounted Lattice click/keyboard and mounted playback shortcut tests. Inactive playback, Lattice and command-palette global key handlers return before consuming input. |
| Stable playback projection | Bridge integration preserves equivalent queue/current-song references over pause/clock snapshots and does not overwrite newer native navigation with unchanged host context. Existing clock/seek/audio/color regressions remain included. |

Root command:

```powershell
node node_modules/vitest/vitest.mjs run -c vitest.config.ts test/unit/shizukiEmbeddedPlayback.test.ts test/unit/shizukiExternalBridge.integration.test.ts test/unit/shizukiLatticeLyricColor.integration.test.ts test/unit/buildPlayerViewFlags.embedded.test.ts test/unit/cadenzaWrappedLyrics.test.ts test/unit/shizukiEmbeddedWorkspaceNavigation.integration.test.ts test/unit/shizukiEmbeddedPlaybackController.integration.test.ts test/unit/shizukiEmbeddedKeyboard.integration.test.ts test/unit/latticeEmbeddedWorkspaceInput.integration.test.ts test/unit/navigation test/unit/lattice test/unit/search/searchNavigationStore.test.ts test/unit/gridView
node node_modules/typescript/bin/tsc --noEmit
$env:VITE_BASE_PATH='/music'; node node_modules/vite/bin/vite.js build
```

Outcome after final source-origin review: **36 files / 244 tests passed**, TypeScript passed, production build passed, `git diff --check` passed. Explicit native collection selection carries a detail-row origin marker and always replaces source/queue, including P2 with identical tracks to P1. Unmarked command-palette selections of that same queue preserve its ordering. Builds retain existing chunk-size and ineffective dynamic-import warnings.

The previous complete suite recorded 4,385 passing and 2 skipped tests with one Windows `EPERM` symbolic-link failure in upstream `modSignature`; the same failure was reproduced on clean upstream v0.7.11. This delivery reruns affected suites rather than claiming a new complete-suite pass or weakening that upstream test.

## Delivery status

The initial public patch/source identity verification, owner-controlled push and joint deployment passed. Production acceptance exposed the additional rendered transition defect below; the followup must be published and visually accepted before delivery is complete.

## Initial production acceptance and transition followup

Host `5f08281c` and fork `9b2346e2` were pushed and jointly deployed to personal server `111.228.35.186`. Initial Folia image `sha256:ff9b0f6fbb43919cdff3f5299ec117ee6cc84ca6ef9d820ae5229e21a58a22fb` was built from the exact Git archive and its OCI revision matches the fork. Site health/entry checks and gateway health passed; prior images, source stash and site restore points remain retained.

Fresh Edge (`index-Bvvt1XEq.js`, `main-CZFleggA.js`) confirmed full P2 `purple` (83 tracks), actual wall B selection, advancing clock, native pause and paused forward/back seek. Explicit B player entry and one Escape restored the P2 wall without changing the host URL. A subsequent toolbar C selection, however, updated song/clock but left only the background visible. Computed DOM exposed the outgoing Lattice wrapper at opacity zero with pointer-events auto and full pane bounds; invisible posters still appeared in center hit-testing while the new player controls were absent. Root captured a screenshot and delegated a real transition-lifecycle regression to Luna. Host canonical navigation was reviewed separately and still requests the correct player view.

This is a remaining production defect, not an accepted audio-only result. Final rendered input/return/color acceptance must be repeated after the followup deployment.

## Rendered lifecycle followup validation

`App` now uses `LatticePresenceLayer` with an explicit active opacity/interaction target and an inert exit target. `useLatticeExitGate` is the actual App gate also exercised by the integration fixture. A real Framer Motion test first failed with `expected 0 to be greater than 0.95`; after repair it verifies interrupted exit/reentry, an inert outgoing layer, complete exit mounting the player, and a second complete cycle. Root independently reran the previous affected suites plus `test/unit/latticePresenceLayer.integration.test.ts`: **37 files / 245 tests passed**. TypeScript, `/music/` production build and strict OpenSpec validation also passed. Final production acceptance remains required.
