# Pop-up joint engineering — 1.12.0

## Defects reproduced
The old profile ribs had pockets centred on ring heights but no matching ring slots. Their 3D thickness started on the rib axis instead of being centred around it. A centre post did not reach outer rings. Handle blanks had no actual matching tab/shoulder. Late-added suspension and handle holes were absent from the visible ring pieces. Non-circular cord paths used an inscribed radius rather than their actual contour crossings.

## Changes
- One joint schedule generates rib tabs and matching ring slots. Rib shoulders meet ring undersides; tabs extend through exactly one measured material thickness. Placement matrices centre stock thickness on each slot axis.
- Search support orientations and seating positions against actual ring solids and existing cuts, retaining a material margin. Fail closed when rings are too narrow instead of exporting disconnected or colliding joinery.
- Two ribs use complementary half-laps; three/four radial ribs enter a matching base hub. Centre-post and handle modes use real profile frames that reach every ring.
- Handles now have through-tabs and shoulders on the rim top. Suspension holes and knot distances follow actual contours, including the centre ring. The 3D model receives all final holes.
- Nested sets remove centre-disc supports when their centre is waste. Base discs, feet and finials are positioned against their intended surfaces and explicitly documented as glue-on accessories.
- Add optional joint coupons, numbered rib engraving and assembly instructions. Clearance means total extra slot width; kerf is still applied once by the shared exporter.
- Convert preset spirals that claimed independent ring supports to explicit stepped/layered rings, retaining preset IDs and updating names. Continuous spirals remain available as prototypes; rigid ring supports reject them with a clear explanation.
- Six new editable designs: Orbit locking bowl, Oval entry valet, Hexagonal display bowl, Petal centrepiece, Gallery stepped tower, Soft-square organiser. Pop-up now has 36 presets.

## Evidence and limits
Tests reproduce the old missing mating geometry, then check real transformed rib sections against ring holes for every preset, full stock thickness, 2/3/4/6 mm stock, clearances, coupons, suspension holes, nested blanks and millimetre SVGs. Physical cut/fit, material strength, flexure and load stability have not been tested. These are locating/glue joints, not guaranteed snap locks. Use measured stock/kerf and the coupon before a full cut; do not force an unseparated blank onto rigid tabs.

## Release verification
- Windows 1.12.0 rebuilt from the final geometry code; updater signature verified. Installer size: 11,695,029 bytes. SHA-256: `5d5ddee329fc84b2c0c61942d0c1662aacb5ae8d98855aee754b2d8c09c319bb`.
- TypeScript validation passed. Changed Pop-up files have no ESLint errors or warnings. The template build script retains one pre-existing unused-helper warning.
- Directly rendered the exported SVG sheet and assembled geometry for visual inspection; all 36 sidebar presets were selected in the desktop UI bundle under its actual CSP with a stubbed native bridge.
- Additional boundary fixes: sleeve-mode defaults reserve enough annular material for tabs; collision checks measure intersections directly instead of comparing rounded polygon areas; thick-stock handles retain shoulders wider than their tabs, and coupons retain surrounding stock through 20 mm thickness.
- Template batch previews show one assembly instead of overlapping copies. All template thumbnail budget tests passed.
- Authenticode status was unavailable in the local PowerShell environment; updater signing is verified separately. No physical laser or native cloud account was used for testing.
- Final full suite: 3,266 passed, 7 skipped; 187 test files passed, 2 skipped. No failed tests.
