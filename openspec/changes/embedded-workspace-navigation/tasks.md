## 1. Behavioral diagnosis

- [x] 1.1 Add failing real navigation/bridge regressions for host history isolation, playlist return, continued interaction and complete collection handoff.
- [x] 1.2 Record the exact boundary failures and preserve existing standalone/clock/color behavior as the baseline.

## 2. Embedded workspace implementation

- [x] 2.1 Implement bounded embedded navigation with active lifecycle, latest request acceptance and legacy set-view compatibility.
- [x] 2.2 Retain collection/queue return context so Escape/back returns to the current Folia playlist and dismisses only the top layer.
- [x] 2.3 Forward complete ordered native collection tracks, source identity and selected index to the host-owned playback session.
- [x] 2.4 Preserve responsive pointer/keyboard behavior through selection, clock updates and reentry while retaining stable queue/context identity.
- [x] 2.5 Repair the rendered Lattice exit/reentry lifecycle exposed by production acceptance; outgoing transparent layers must stop receiving pointer input and the player must become visible.
- [x] 2.6 Align current-entry identity consumers in Lattice lyrics, focus and controls with queueEntryId; preserve independent-mode fallback and distinguish duplicate-song queue slots.

## 3. Validation

- [x] 3.1 Run affected behavioral tests, standalone history regressions and existing controls/clock/lyric-color regressions.
- [x] 3.2 Run type checking and production build; document established environment-only test limitations honestly.
- [x] 3.4 Reproduce interrupted exit/reentry with real Framer Motion and verify complete repeated surface transitions.
- [ ] 3.5 Add and pass mounted queue-entry/duplicate-slot regressions for lyric input and focus/controls, then repeat visual color and ordinary-return acceptance.
- [ ] 3.3 Strictly validate OpenSpec and verify the host's synchronized source snapshots/public patch.

## 4. Authorized delivery

- [ ] 4.1 Commit and push the verified fork change to the user-controlled remote.
- [ ] 4.2 Coordinate joint clean-context deployment with the host and preserve rollback image/source identity.
- [ ] 4.3 Verify continuing real input and current-playlist return on fresh production assets and commit the acceptance record.
