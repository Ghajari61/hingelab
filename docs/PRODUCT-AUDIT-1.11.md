# Product engineering review — 1.11.0

Scope: every family returned by siteProducts: 13 generators plus Hinge Box, Letters and Parametric. This is a software/geometry review, not physical certification. Existing dimensions, tolerances, materials and manufacturing methods remain editable.

## Catalogue

48 new purpose-specific presets; 743 total built-in presets. All are exposed in the left sidebar, including the three core editors which previously lacked the complete library there. The procedural Parametric design gallery remains available separately.

| Product | Before | After | New preset IDs |
|---|---:|---:|---|
| boxes | 50 | 53 | studio-maker-tray, studio-watch-case, studio-sample-holder |
| clock | 16 | 19 | studio-atelier-clock, studio-workbench-clock, studio-gallery-clock |
| puzzle | 11 | 14 | studio-logic-puzzle, studio-cafe-puzzle, studio-home-puzzle |
| qr | 8 | 11 | studio-care-code, studio-guest-wifi, studio-inventory-tag |
| keyrack | 18 | 21 | studio-entry-rail, studio-shared-studio, studio-mail-station |
| sign | 27 | 30 | studio-meeting-sign, studio-market-sign, studio-quiet-space |
| tablenum | 19 | 22 | studio-cafe-numbers, studio-exhibition-labels, studio-banquet-arches |
| trophy | 19 | 22 | studio-maker-award, studio-team-cup, studio-design-shield |
| topper | 21 | 24 | studio-celebrate-topper, studio-milestone-topper, studio-anniversary-topper |
| paperbox | 84 | 87 | studio-accessory-drawer, studio-voucher-pillow, studio-sample-sleeve |
| calibration | 6 | 9 | studio-axis-coupons, studio-precision-fit, studio-hinge-comparison |
| popup | 27 | 30 | studio-ripple-bowl, studio-polygon-tray, studio-petal-bowl |
| shadowbox | 146 | 149 | studio-lagoon-relief, studio-silk-portal, studio-quiet-arch |
| hinge | 59 | 62 | studio-stationery-case, studio-object-display, studio-drawing-case |
| letters | 12 | 15 | studio-maker-word, studio-label-stencil, studio-monogram-box |
| parametric | 72 | 75 | studio-wave-relief, studio-atlas-stack, studio-fluted-vessel |

## Engineering findings and changes

- QR defaults and presets had a two-module quiet zone. Use four modules and warn when the effective margin is smaller. DENSO WAVE: https://www.qrcode.com/en/howto/code.html . A change to the plate size must be an explicit fix, not a silent auto-fix.
- The generic production pipeline accepted nonfinite or negative production settings and corrupt part coordinates. Reject these before generator execution, kerf offsetting or nesting; return a useful error and no layout.
- Preserving production setup omitted directional kerf and grain constraints. Preserve them while keeping the new design's batch count.
- New Hinge case walls initially exceeded the standard sheet. Use the existing split-wall construction, with matching joints, rather than automatically shrinking the product.
- Review includes all built-in preset builds, existing product-specific joint/bridge/stock/assembly checks and server parameter validation. New generic presets also undergo a nominal-dimensions/arrangement/SVG millimetre contract test.

- Pop-up sleeve selection now provides centre clearance for the object opening. Pop-up bed scaling and QR symbol enlargement require explicit user selection, preserving intended product dimensions during Auto-fix.

## Option exploration

857 visible choice/toggle variations from product defaults were built individually across the 13 generic definitions. There were no uncaught exceptions or nonfinite nominal outlines. Expected missing-input errors include custom outlines, QR payloads and empty table-number lists. This is not exhaustive coverage of every parameter combination. Existing warnings for crowded text, thin structures, hardware clearances and unsupported lighting remain visible.

## Interface

One accessible preset library provides complete lists, live search, clear-filter recovery, A–Z sorting, favourites, recent designs and optional material/sheet preservation. Changing a preset is undoable. The existing product-specific options remain in the sidebar below the library and in the settings dock.

## Limits

No laser was operated. Kerf, joint clearance, minimum features, optical QR readability, bridge fatigue and load stability need confirmation on the actual material and machine. Generated thumbnails are geometric previews, not physical photographs. Desktop UI checks use the actual app bundle under its CSP with a stubbed native bridge; they do not exercise a real cloud account.

## Release verification

- 3,208 active tests passed across the full run and targeted reruns (7 integration tests skipped). The first parallel run had three CPU-load timeouts and an oversized thumbnail; after the thumbnail fix and stopping the native build, all 299 tests in those four files passed with the original timeouts.
- TypeScript validation passed; changed-file ESLint had no errors (existing warnings remain).
- All 16 preset libraries and 48 new selections exercised in the desktop UI bundle; search, empty-state reset, A–Z and favourites checked. Parametric modelling was allowed to finish before screenshot inspection.
- Template previews over the size budget are optimized at screen precision, without rounding cutting files.
- Windows 1.11.0 built successfully; updater signature verified. Installer: 11,442,502 bytes, SHA-256 `18181984ca2d4c3742730acd0498df35e75ebc584b7d92f9a2f7c1dbe728962b`.
- Review covered correctness, shared-component reuse, input validation and thumbnail performance. No new dependency or credential was introduced. Authenticode status could not be determined by the local PowerShell module; updater signing is separately verified.
