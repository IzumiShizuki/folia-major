## 1. Reproduce renderer preference gaps

- [x] 1.1 Add and run a failing mounted real-bridge/full-renderer color regression, distinguishing DOM CSS coverage from the unconsumed renderer theme.
- [x] 1.2 Cover reset with changed underlying theme, subtitle/background isolation, non-DOM primary palettes, mode changes and subscription cleanup.

## 2. Implement focused shared consumption

- [x] 2.1 Add a focused discrete embedded preference consumer and apply a non-mutating primary theme overlay at the shared renderer model boundary.
- [x] 2.2 Preserve existing wall/Lattice preference behavior and standalone themes without continuous React state updates.

## 3. Verify and deliver

- [ ] 3.1 Pass affected bridge/visualizer regressions, TypeScript and the deployment build; strictly validate this change and review runtime guards.
- [ ] 3.2 Commit/push only the owner's fork, refresh host public patch/snapshots and deploy the exact verified runtime with rollback retained.
- [ ] 3.3 Verify actual mounted glyph color/reset and mode/reentry behavior on the signed-in site; record deployment identity and bounded acceptance results.
