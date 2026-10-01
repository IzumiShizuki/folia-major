## Purpose

Keep the site-embedded Folia interactive and correctly situated in its current playlist while sharing authoritative playback and preserving the standalone application's native behavior.

## ADDED Requirements

### Requirement: Embedded navigation is isolated
Embedded Folia SHALL maintain its own bounded navigation context without writing or consuming the host URL, browser history or routing events. Standalone navigation SHALL retain its native behavior.

#### Scenario: Host enters a playback surface
- **WHEN** a valid latest host navigation request opens a wall or immersive player
- **THEN** Folia reveals that surface with its source/return context and the host route/history stays unchanged

#### Scenario: Inactive embedded surface
- **WHEN** the host parks Folia or removes its workspace
- **THEN** obsolete navigation and hidden input handlers cannot change the active interface

### Requirement: Return preserves the current playlist
Escape and back from embedded playback SHALL restore the current collection or authoritative queue wall inside Folia, preserving playback and input availability.

#### Scenario: Song changes before return
- **WHEN** B/C/D are selected in P2 and Escape leaves D's player
- **THEN** P2 is restored once without traversing earlier songs or returning to initial home

#### Scenario: Top layer dismissal
- **WHEN** a dialog/menu or expanded poster owns Escape
- **THEN** only that layer is dismissed and the underlying current playlist remains intact

### Requirement: Complete native selection is handed to the host
Embedded collection playback SHALL relay the ordered full queue, provider-aware collection source and selected index to the single site-owned audio session. Song-only shortcuts SHALL preserve or insert into the active queue.

#### Scenario: Native playlist replacement
- **WHEN** the user selects P2 for playback
- **THEN** the host receives P2's full ordered tracks, opaque source identity and index 0
- **AND THEN** Folia does not independently resolve or start audio

#### Scenario: Select another song in the collection
- **WHEN** the user selects B at a specific collection index
- **THEN** the matching song/index and complete source context are handed off without losing the queue

### Requirement: Selection leaves the interface interactive
After playback selection, visual entry and subsequent clock updates, the wall/player SHALL remain responsive to pointer and keyboard operations and SHALL display the authoritative song.

#### Scenario: Interact after selection
- **WHEN** B is selected and audible
- **THEN** another visible control can be clicked, wall focus/movement can be changed, and Escape restores the current playlist

#### Scenario: Late or canceled work
- **WHEN** entry is superseded, fails, is canceled or the layout changes
- **THEN** stale results cannot restore old surfaces and temporary input restrictions are released

### Requirement: Existing playback and visuals remain compatible
The embedded changes SHALL retain shared clocks, pause/seek ordering, empty Folia-owned audio, primary lyric color/reset and standalone Omni playback paths.

#### Scenario: Reenter paused playback
- **WHEN** a paused session is projected after reentry
- **THEN** the correct song, position, lyrics and paused controls appear without independent audio or stale navigation
