# Pop-up assembly correction — 1.22.0

## Failure and correction
The old rib steps used contour crossings on the rib centre plane. Curved or angled ring edges could overlap the outer faces of a thick rib even when centre-line tabs matched. Independent solid sweeps reproduced interference in Ripple, Snowflake Tree, Heart Basket and Pyramid.

For every rib, retained ring material is projected over the full stock footprint. The support is relieved above each affected ring underside. Actual joint openings preserve locating tabs; connected supports, retained tabs and continuous insertion are checked. A 0.001-mm-per-face inset at exact fit avoids zero-area component bridges on the 0.001-mm clipping grid. Runtime tolerances are numerical allowances, not physical manufacturing accuracy claims.

Supported ring bands now retain complete annular void topology and release separately by default. Optional holding lands retain the former connected blank. SVG generation still applies measured kerf once. Engraving is clipped after all slots; each ring's final cut solid is also used in 3D.

## Assembly
Crossed supports: R1 has an upward-open half-lap; R2 enters downward through it. Radial supports enter a horizontal hub first. Rings then descend vertically in ascending seat-height order (outside-in on equal heights). L01 identifies the outer rim, regardless of installation sequence. Nested sizes prefix both ring and support identifiers. Handle and finial installation follows the rings. Tabs locate parts; adhesive retains them. Heights are references to the generator ring datum, not measurements from the floor.

Screen instructions and optional vector assembly cards share the ring schedule. The 3D selection name and engraved identifier match that schedule. No new bend/fold animation is implied.

## Validation
- Independent Manifold extrusions of the real cut contours; continuous vertical ring sweeps against every full-thickness support across all 36 presets, stock 2/3/4/6 mm with clearance 0/0.15/0.4 mm, radial 3/4 ribs, nested sizes, asymmetric zero-fit and non-monotonic height profiles.
- A downward contact probe verifies that each ring actually rests on its support shoulders. Support/hub insertion and final half-lap seating are checked at multiple travel positions.
- Cut topology, ring identification/order, engraving containment, nominal-to-kerf round trip and coupon slot dimensions checked. All preset SVG snapshots intentionally regenerated for release cuts, labels and corrected ribs.
- Windows server generation, edit/regeneration and free-tier gating checked for all 36 presets. Shared preview regression verifies actual cut material and rigid explode behavior.

## Manufacturing limits
No physical cutting, adhesive or load test was performed. Match the actual sheet thickness and run a joint coupon before production. A perpendicular laser does not produce bevel cuts; continuous spiral/flexure modes remain prototype-dependent. This release is not a strength certification.

## Release
Website and Windows use the same source. Release installers and updater signatures are versioned. Reverting the release commit plus updating the release feed is the rollback path; do not overwrite a published version artifact.
