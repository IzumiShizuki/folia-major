# Embedded workspace verification, 2026-10-02

Verified implementation: `7069103b4ce862f0e1f8befde5c48dbe778777f4` on the user's `codex/unify-folia-workspace` branch. Root diagnosed, reviewed and independently validated Luna's implementation. This report completes acceptance and leaves the change unarchived.

## OpenSpec assessment

| Dimension | Result |
| --- | --- |
| Completeness | 18/18 tasks; all 5 requirements mapped below. |
| Correctness | Mounted behavioral tests, type check, build and the reproduced continuous production failure chain pass. |
| Coherence | Bounded embedded navigation, sole host audio ownership, stable projection and native component boundaries follow design.md. |

| Requirement | Implementation and scenario evidence |
| --- | --- |
| Embedded navigation is isolated | `src/services/embeddedWorkspaceNavigation.ts`, `src/hooks/useAppNavigation.ts`, `src/shizukiExternalBridge.ts`; mounted navigation/bridge tests preserve host routing, reject inactive/stale work and retain standalone history. |
| Return preserves current playlist | One bounded player layer returns to a matching real native collection snapshot or the authoritative queue wall. Mounted tests cover B/C/D, missing collection and top-layer dismissal; live Escape restores both the P2 wall and actual native purple collection. |
| Complete native selection is handed to host | `src/services/shizukiEmbeddedPlayback.ts` and mounted playback-controller tests relay complete ordered tracks, opaque source and exact index. Explicit collection selection replaces even an equal-song queue; unmarked shortcuts preserve/insert. Live native purple B installs all 83 tracks at its actual slot. |
| Selection leaves interface interactive | Active input guards, stable identity, `LatticePresenceLayer`, `useLatticeExitGate` and separate poster presence. Real mounted keyboard/pointer, interrupted exit, duplicate-slot and repeated poster-wave tests pass; live pause, held-pointer seek, repeated entry and Escape pass. |
| Existing playback and visuals remain compatible | Shared continuous clock and host intents, empty/paused Folia audio, consistent entry identity in lyrics/focus/controls, primary shader color/reset and standalone fallback. Existing tests and actual blue lyric canvas/reset acceptance pass. |

No unresolved critical implementation issue or known spec/design divergence was found. No verification dimension was skipped. Coverage limits are explicit below.

## Rendered-boundary diagnosis and repair

- `9b2346e2` could leave an outgoing wall at opacity 0 with pointer-events auto. `311b98d5` restores active opacity/interaction and makes exit inert; tests share App's exit gate with real Framer Motion.
- `311b98d5` selected the exact entry but lyrics/focus/transport still compared song keys. `9ed6ab22` consistently uses `getLatticeTileId` (queueEntryId, otherwise standalone song key). Mounted real Lattice/provider tests distinguish duplicate slots and verify lyric consumer input and focus/controls.
- `9ed6ab22` could strand the third exit after B reentry and C auto-focus. `latticeRepeatedExit.integration.test.ts` mounts real Lattice/presence/gate with 84 slots and a 5000x5000 measured viewport, producing 400 virtualized posters. Original code fails with `completed=2/3; opacity=0; pointerEvents=none; posters=400`. `7069103b` isolates poster removal with non-propagating inner AnimatePresence. The same regression passes without a fixed-duration fallback. An earlier act-scheduling false positive was discarded.

## Local quality and public source

Root's final affected run: **39 files / 247 tests passed**, covering embedded playback/bridge/navigation/controller/keyboard, real Lattice input/presence/identity/repeated exit and standalone navigation/search/grid. TypeScript `--noEmit`, Vite `/music/` build, strict OpenSpec validation and source whitespace checks pass. Existing chunk-size/dynamic-import build warnings remain.

The site's **40 TS/TSX snapshots** match this implementation byte for byte. The complete binary-capable upstream `6fe68d89` patch is checked by actual application to a clean worktree and comparison of every changed Git blob during final host publication. The host verification record contains final patch bytes/hash and the documentation tip separately from the deployed implementation revision.

The previously run full suite had **4,385 passed, 2 skipped and one upstream Windows symbolic-link EPERM** in modSignature; clean v0.7.11 reproduces it. This change reruns affected suites, without claiming a new complete-suite pass or weakening that test.

## Exact-source deployment and live acceptance

Personal server `111.228.35.186`: host release `5f08281c28c6742f69d60c1c1ea9d1070e29c513` and Folia `7069103b4ce862f0e1f8befde5c48dbe778777f4` are deployed. Clean source `/opt/folia/folia-major-main` used verified bundles and exact Git archives. The final build exited 0; npm ci ran, without a cache-hit claim. Running image `sha256:1d74dd2d4bee41abd9832a6698f7a4144efc814ca46057740e792b71b1c2b529` has the matching OCI revision. Gateway, external `/music/`, site entry and API health pass. Previous images/source stash/site snapshots remain retained; completed archive contexts were safely removed. Final free space was 731 MiB; future builds need a capacity check.

Fresh signed-in Edge loaded **`index-Bvvt1XEq.js`** and **`main-rROf5Ust.js`**:

1. Ordinary P1 A played; immersive entry preserved its position. Toolbar P2 purple replaced the full queue with 83 songs and started its first song.
2. Wall B selection showed real lyrics. Play advanced and Pause held **00:46**. Custom `#3366ff` produced blue primary glyphs with separately colored translation.
3. Actual held-pointer drag moved paused B **00:46 -> 03:09**, preserving pause. B player/Escape/wall, a second B player/Escape, then toolbar C displayed the real full player. Continuing keyboard pause worked. C Escape/toolbar D also showed the player and blue rendered glyphs; D Escape restored P2.
4. Default-color reset removed the custom variable. Ordinary return displayed **purple, 83 songs, D and paused 01:34**. Current-song immersive reentry retained position and theme color.
5. Native playlist navigation opened actual purple. Centering B's card and clicking Play handed off all 83 tracks at its selected slot. Pause/player entry worked; **Escape restored the actual native purple collection**. Ordinary return used `/music-library/queue`, showing purple/83/B paused. Internal Folia navigation did not mutate the host hash.

Root kept local before/after screenshots and left the acceptance tab available with playback paused and default color restored. Signed-in screenshots are not published in Git.

## Coverage limits

This verifies the reproduced signed-in Edge/provider/desktop chain, not every device or arbitrary stream. Duplicate slots, stale async completion, empty/failing playlists, hidden input and standalone history are tested at mounted boundaries rather than forced against the live account. The original total freeze was not reproduced in every baseline run; route/return and the three observed rendered defects are separately evidenced. Host render acknowledgement remains optional as specified; message dispatch alone is never visual acceptance evidence.
