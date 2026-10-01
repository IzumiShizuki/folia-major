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

Public patch/source identity verification, owner-controlled push, joint deployment and fresh real-browser acceptance are still pending. Local mounted tests do not by themselves establish that the full production region remains usable. Record the exact released commit/image/assets and continuing pointer/keyboard plus Escape acceptance here after those gates pass.
