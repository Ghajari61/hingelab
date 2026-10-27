# Photo-generated 36-rib assembly

- [x] Reproduce the saved 36-rib reference with no invented geometry changes.
- [x] Deterministic curved rails from actual rib cross-sections; complementary bottom-open rib / top-open rail half-laps.
- [x] Split rails into overlapping, side-lapped sections to fit the sheet; validate every rib has two support paths and no solid interference during downward insertion.
- [x] Editable support controls, thickness/clearance rebuilding, numbered assembly instructions and exact SVG/package.
- [x] Geometry/insertion/export tests and type/lint checks. Full suite: 3,399 passed; seven timing-sensitive cases passed when their six affected files were rerun with two workers (161 tests passed). No geometry assertions were relaxed.
- [ ] Real UI verification, Windows build and publication.

Existing 800 mm estimated design, 6 mm stock, 0.15 mm total clearance/kerf retained as unmeasured assumptions. Preserve all 36 original outlines and poses except local joint notches. No load-rating claim for the bench-like sculpture; physical cut and adhesive strength remain unverified.
