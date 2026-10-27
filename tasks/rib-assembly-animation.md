# Animated rib assembly — 1.19.0

The checked curved-support report supplies the guide order, numbered parts and adhesive surfaces. Rendering reuses the actual cutting meshes and translates only the active part vertically. It does not edit output contours, poses or SVG layout.

For the saved 36-rib fixture the sequence contains four rail sections, two splice alignment ribs, a manual curing checkpoint, 34 remaining ribs, preparation and completion (43 stages / 40 pieces). The user must dry-fit the full model before the illustrated bonding sequence. A temporary level jig and a secure final mount are still required.

Playback supports play/pause, previous/next, step selection, scrubbing, speed, ghost parts, glue visibility and optional full numbering. Badges retain screen size. Hidden panes and reduced-motion preferences pause playback. Idle orbit stops while the guide is open.

Validation:
- 3411 tests passed, 33 service-dependent tests skipped.
- New tests check complete unique placement order, all 78 glue contacts, vertical transforms, unchanged cutting output, geometry reuse and final poses.
- TypeScript and focused ESLint passed.
- Browser checks: one-step animation, keyboard scrubbing, curing checkpoint, resumed continuous playback to 40/40, closing the guide and narrow-pane layout.
- Windows uses the same component and geometry. Release build, updater signature and deployed download are checked during publication.

Limits: geometric insertion checks do not certify physical material fit, adhesive cure or load strength. This sculpture is not rated seating. The guide is shown only for a complete checked curved-support assembly; it does not infer an assembly sequence for arbitrary generated products.
