## Context

See proposal.md and the host change `unify-folia-workspace-navigation`. The external bridge directly writes `useAppViewStore` for set-view, while `useAppNavigation` writes the same window history used by the host hash router. FollowSession already parses playlist metadata but does not consume it for navigation. Existing embedded early handoff avoids independent playback but only forwards a selected track.

## Goals / Non-Goals

**Goals:** A focused embedded navigation/selection boundary and real behavioral regression tests, preserving native module structure and high-frequency runtime constraints.

**Non-Goals:** Changing standalone navigation semantics, bypassing Omni/provider normalization, owning a second embedded audio stream or expanding App.tsx with a large new controller.

## Decisions

- Embedded navigation uses bounded memory context and the native navigation action interface, without host history/hash/popstate. Standalone retains existing actions. The legacy set-view adapter enters this same boundary.
- Host contract: `shizuki:navigate {protocolVersion:1,requestId,view,active,sourceContext?,returnTarget?}`; optional navigate-result ack. Follow-session sourceContext is consumed discretely and retained over clock-only updates.
- Outbound playback-intent gains `selection:{kind,queuePolicy,sourceContext,selectedIndex?,tracks?}`. Complete native collection playback carries ordered host-resolvable refs and replace policy; shortcuts preserve-or-insert. SourceContext contains opaque collection source/provider/type/id/name and only an explicitly supplied genuine sitePlaylistCode.
- Current collection snapshots and authoritative queue wall provide return targets. Player/song changes replace a playback layer; top menus/dialogs/posters own one Escape. Hidden embedded input is gated by active lifecycle.
- Keep continuous clocks outside React state. Retain queue/context identity on equivalent snapshots and clean up subscriptions, animations, pointer/focus locks on exit.
- Host playlist codes describe the authoritative queue, not a native online collection. Retain a real native snapshot only if its source/provider/type/opaque ID matches; repeated player/song changes replace one return layer, and a missing native snapshot returns to the queue wall. Wall selection preserves exact current queue entry/index even when the source is a native collection.
- Host protocol IDs remain monotonic across host page remount while the embedded root is parked. Inactive handlers and command relays must return before consuming keys or opening hidden modal surfaces.
- Reproduce red at real bridge/navigation/queue-controller seams before implementation. Use mounted component/browser interaction for the full input symptom; mocked Pixi or message spies alone cannot prove it.

## Risks / Trade-offs

- [Native collection does not exist in the site library] → Retain opaque source and complete queue; host maps only known site codes.
- [History isolation changes standalone] → Embedded root guard and explicit standalone regression.
- [Layer/focus remains blocked after async entry] → Exercise continuing click/keyboard input, Escape and canceled transitions.

## Migration Plan

Root coordinates public snapshots/patch and a joint host/fork release. Build from a clean Git archive, retain previous image and verify actual asset versions and signed-in playback/return workflows. Repository-local tests/types/build and strict OpenSpec validation precede any push or deployment.
