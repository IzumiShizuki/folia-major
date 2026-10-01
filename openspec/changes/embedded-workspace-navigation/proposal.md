## Why

The site embed can play a selected song without keeping the Folia region interactive or revealing the correct surface, and Escape loses the current playlist. The embedded bridge currently changes a view without the navigation context that native standalone actions expect.

## What Changes

- Introduce a coherent embedded workspace entry/return path that does not write or consume the host browser's navigation history.
- Preserve full selected collection/queue identity when handing native song choices to the site-owned player, so playlist P2 replaces the shared queue and plays its intended selection.
- Keep wall playback on the active wall, reveal explicit immersive entries, and return song playback to the active playlist on Escape without leaving Folia.
- Keep pointer/keyboard operations available after selection, canceled animations, reentry and layer dismissal.
- Preserve standalone native navigation, Omni data access, the single embedded site audio owner, clocks, lyric-color rendering and existing controls.

## Capabilities

### New Capabilities
- `embedded-workspace-navigation`: Host-isolated navigation, complete selection context and responsive playlist return in the embedded runtime.

### Modified Capabilities
None.

## Impact

External bridge and focused navigation/selection modules, app assembly and real hook/bridge tests. The host contract and full accepted scenario matrix are recorded in `shizuki-site/openspec/changes/unify-folia-workspace-navigation`; this repository records its local responsibility and validation. No provider adapter or backend protocol changes are planned.
