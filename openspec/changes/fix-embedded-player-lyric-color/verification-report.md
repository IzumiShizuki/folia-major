# Verification: embedded lyric preference, 2026-10-02

## Result

All **7/7 tasks**, two requirements and five specification scenarios are covered. No critical or warning-level implementation issue remains; the change remains unarchived.

| Dimension | Evidence |
| --- | --- |
| Completeness | Shared primary preference, isolation/reset and subscription cleanup implemented; exact committed production build, owner-fork push and personal-server deployment completed. Actual signed-in glyph, mode/reentry and reset acceptance passed. |
| Correctness | Real bridge → mounted shared model regression was RED (#ffffff instead of #e43b57), now GREEN; reset/current theme, subtitle/background isolation, standalone, mode changes and subscription cleanup covered. Existing Lattice preference tests remain GREEN. |
| Coherence | Focused discrete hook + pure non-mutating palette overlay; no clock/frame React state. Original backgroundTheme reaches shell/stage, Monet, Harmony and Diorama particles; Fume skeleton retains its original palette. |

Root independently ran 100 affected visualizer/embedded/Lattice suites: **1056 passed / 1 skipped**. After the background follow-up, **9 affected suites / 130 tests** and `tsc --noEmit` passed. Strict OpenSpec and source whitespace checks passed. Production Vite/PWA build from clean runtime commit **1fca2ef15922c55b8655873bbd4d6a4415db828b** with the existing Docker arguments passed; 193 served files match the complete SHA-256 manifest. Host independently passed 251 files / 1513 tests, then 2 files / 4 tests for the final ordinary-row-centering refinement, with another exact host production build.

Representative non-DOM coverage uses Cadenza's real word/sweep color derivation and the separate Diorama background palette. The mounted shell test checks real GeometricBackground accent isolation. Standalone theme, reset after underlying theme change, discrete mode changes and subscription cleanup are covered. No per-frame/clock React state was introduced.

## Signed-in acceptance

- Full-player primary word body computes rgb(228,59,87) for #e43b57, and Lattice shader glyphs visibly become blue for #3388ff. Cover/background and translated text retain their own theme. Saved host proof: `.codex-tmp/folia-color-full-acceptance.jpg` and `folia-color-wall-acceptance.jpg`.
- Lattice → full player and ordinary → Folia reentry retain the selected blue; actual word body computes rgb(51,136,255). Reset clears the custom root property and restores rgb(244,244,245) at the same paused 42.4s. Reset remains effective on reentry.
- Native keyboard pause, pointer drag to 42.4s and Esc to current playlist work. The host's extra compact bar is absent; native transport remains. Native purple playlist playback replaces the full queue, and ordinary mode shows purple's complete 83-entry profile/list rather than the previous playlist.

Native OS color-picker dragging was not automated; the host mounted input-only regression covers feedback before commitment. Actual DOM/shader acceptance covers representative modes, with real derived-color tests for non-DOM consumers; it does not claim pixel verification of every renderer.

## Production identity and handoff

Only personal server **111.228.35.186** was changed. Folia source `/opt/folia/folia-major-main` is clean at **1fca2ef15922c55b8655873bbd4d6a4415db828b**, advanced by a verified incremental Git bundle. Runtime image **sha256:91b1df73ec35c4372e48750e89859bd9d69f547b385c359a4089ad3098170620**, OCI revision matches; actual browser module **main-pG2vG0Xv.js**. Gateway is healthy, music endpoint returns HTTP 200 and API reports UP.

Rollback **folia-local/gateway:backup-before-color-20261002-7069103b** and previous source stash remain. Host runtime **7abce02172af0bd5b459f3b7147f25a928a3ffc3** has 229 verified served files, module **index-Cd9jeifr.js**, and its full READY restore point plus initial/intermediate rollback images are retained. Private configuration/backend/volumes were unchanged. Temporary owned artifact contexts were disposed after image verification; only exact reclaimable private build caches were pruned.

Commits are pushed only to **shizuki**, the owner's IzumiShizuki/folia-major fork, on codex/unify-folia-workspace. Upstream origin was not pushed. The host public canonical patch clean-applies to upstream 6fe68d89 and all changed blobs match; 57 TS/TSX snapshots match byte-for-byte. Final documentation commits are newer than the deployed runtime and do not change application code.

Existing build chunk/empty React warnings remain. The earlier full fork run's Windows modSignature symlink EPERM reproduced in clean upstream; affected suites pass without weakening that test. No application work remains for this follow-up; OpenSpec archival awaits an explicit close request.
