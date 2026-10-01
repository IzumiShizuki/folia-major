## Purpose

Let embedded playback honor a shared primary lyric color immediately across its renderer surfaces while keeping subtitle, background and standalone theme preferences intact.

## ADDED Requirements

### Requirement: Mounted renderer primary color
Embedded Folia SHALL apply a valid host primary lyric color to the active full-player and wall primary text, including renderers whose lyrics are not DOM text.

#### Scenario: Color event while full player is mounted
- **WHEN** the host sets a valid color during playback
- **THEN** the mounted full-player primary text updates without restarting playback or remounting the player

#### Scenario: Switch modes with custom color
- **WHEN** embedded playback changes lyric mode with a selected custom color
- **THEN** the new mode uses the same primary lyric color

### Requirement: Preference isolation and reset
The system SHALL preserve subtitle/background theme preferences and standalone rendering, and restore the current original primary theme on reset.

#### Scenario: Reset after theme changes
- **WHEN** a custom primary color is reset after the underlying theme changes
- **THEN** the current original primary theme is restored without changing subtitle/background colors

#### Scenario: Standalone renderer
- **WHEN** a renderer runs without the embedded host preference
- **THEN** its original theme remains effective

#### Scenario: Renderer unmount
- **WHEN** the embedded renderer unmounts and later mounts again
- **THEN** the current preference is applied once without stale event subscriptions
