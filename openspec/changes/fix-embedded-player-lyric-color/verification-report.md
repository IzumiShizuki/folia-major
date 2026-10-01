# Verification: embedded lyric preference, 2026-10-02

## Implementation verification

| Dimension | Evidence |
| --- | --- |
| Completeness | 4/7 tasks complete; all two requirements implemented. Exact committed build, deployment and signed-in acceptance are still pending. |
| Correctness | Real bridge → mounted shared model regression was RED (#ffffff instead of #e43b57), now GREEN; reset/current theme, subtitle/background isolation, standalone, mode changes and subscription cleanup covered. Existing Lattice preference tests remain GREEN. |
| Coherence | Focused discrete hook + pure non-mutating palette overlay; no clock/frame React state. Original backgroundTheme reaches shell/stage, Monet, Harmony and Diorama particles; Fume skeleton retains its original palette. |

Root independently ran 100 affected visualizer/embedded/Lattice suites: **1056 passed / 1 skipped**. After the background follow-up, **9 affected suites / 130 tests** and `tsc --noEmit` passed. Strict OpenSpec and source whitespace checks passed. Luna also passed the initial Vite build; the deliverable will be rebuilt from the precise clean commit with production arguments.

Representative non-DOM coverage uses Cadenza's real word/sweep color derivation and the separate Diorama background palette. It does not claim pixel acceptance for every renderer. The mounted shell test checks real GeometricBackground accent isolation. Actual signed-in glyph color/reset and wall/reentry acceptance remain delivery tasks; no archive readiness is claimed yet.
