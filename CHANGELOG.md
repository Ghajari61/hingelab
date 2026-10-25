## Unreleased — Free tools, 3D printing and the Christmas collection

- **Free tools** at /tools, no account and nothing uploaded: a thickness resizer (a file drawn for 3 mm scaled to fit 4 mm stock), a laser-to-3D-print converter (SVG to STL) and sheet nesting for your own SVG (parts packed by their real shape, engraving kept on its part). Each tool has its own page with steps and questions.
- **STL export.** Every editor's More… export dialog has STL (3D print): the cut-out parts as solid pieces at the material thickness (or one you choose), laid out as on the sheet.
- **Christmas collection.** A name ornament, a star ornament, a tree of life ornament and a bird house ornament join the stocking holder, Christmas table numbers, pop-up trees and toppers on a new Christmas page. The home page features the season's collection (Christmas from October, Valentine's Day in January and February).
- **Collections** now have their own pages (Christmas, Wedding, Birthday, Baby, Halloween, Eid and Ramadan, Valentine's Day, Graduation), each listing every fitting design from every generator with its picture.
- **Search.** The sitemap lists every generator, tool, collection and guide (it listed four pages before), and generator and tool pages describe themselves to search engines.
- Boxes show how much a box holds (litres or millilitres). The export dialog reminds you to measure your material and cut a test first.
- One product button in the header instead of a row of tabs and a Generators menu: it shows the open product and opens a panel of pictures (the three main products, then every generator) to choose from. The editor opens on the Hinge Box when no product is named.
- The settings panel no longer has the Simple/Advanced switch and the seven-step bar above it: every setting shows, and the panel starts straight with the sections.

## Unreleased — Review, motifs and fixes

- Twelve detailed motifs that cut in one piece: mandala, girih star, compass rose, tree of life, Celtic knot, lotus, olive branch, anchor, mountains, fleur-de-lis, dreamcatcher and paisley. They appear in every motif picker (signs, toppers, table numbers, trophies, key holders), with ten new ready-made designs built on them.
- Trophies with a built-in motif and no words on the emblem engrave the motif's openings, so detailed motifs read on the solid piece.
- Every ready-made design now opens without a warning about itself (a new test checks all 450+ of them): the farmhouse and cloud key holders put their wall-mount holes inside the board, five Hinge Box designs bend within the hinge or spread over sheets, letter boxes spread over sheets, and the matchbox no longer warns about its thumb notch.
- Key holders: wall-mount holes slide down (then inward) into shaped boards such as a roof or a cloud, and always hang level.
- Fixed: the Shadow Box panel had settings with the same internal key (one per design), which broke the panel's updates; its "Pattern" rail is now "Design", so it is not confused with the cut-out pattern.
- Fixed: a browser console error on every page from an unsupported Permissions-Policy entry, and a three.js warning in the 3D view.
- Security: Next.js 15.5.28 (fixes a critical advisory) and a patched undici; other libraries take their in-range updates. `npm audit` reports no vulnerabilities.
- Website: a motif showcase on the home page, a two-column Questions section, and generator pages with a picture, the actions beside it and up to six preset pictures.
- Code: unused imports and stale lint directives removed.

## Unreleased — New look

- Purple is HingeLab's colour: buttons, selection and links across the website, the editors and the Windows app. Everyone starts on purple; an accent picked in Settings still wins (Settings › Accent now lists Purple first).
- Warm paper neutrals replace the lavender-grey surfaces, so panels and the canvas sit well beside the wood pictures. Laser layer colours are unchanged.
- Pictures instead of icons: the app's start screen, the Studio home, the Generators catalogue, each generator's page and Collections show the 3D-shaded drawing of a ready-made design.
- Fixed: the "Open generator" button on generator pages had purple text on a purple button.

## 1.5.0 — Letters keep their corners (25 Oct 2026)

- Letter Box with living-hinge walls now keeps the letter's sharp corners (Corners: Keep, the new default). The wall is split into a strip per stretch between corners, the strips meet at each corner with a lap or butt joint, and the hinge cuts only where the letter actually curves. Before, every letter was rounded with a corner radius as large as the hinge's bend limit (about R 10–12 mm), which blunted serifs and stems and could round thin parts away entirely.
- Corners: Round off keeps the old behaviour (one strip per outline, Corner R).
- Strip ends carry matching joint numbers, and the base engraves the same numbers at each corner. Sharp kinks under 35° become a gentle bend instead of a joint where the outline allows.
- Fixes found in the review: hinge tabs could overlap the start of a curve by up to half a tab; tight curves next to a corner were left uncut.
- A letter that is too narrow for two walls along its corners falls back to rounded corners, with a warning.

- Split walls now omit base slots when the matching tab is removed at a sheet seam. Ten regression cases cover different maximum strip lengths.
- Website and Windows installer updated together; earlier installers remain available.

## 1.4.0 — Windows workflow update (25 Oct 2026)

- Windows installer updated from the published main branch, including the shared seven-step workflow, Simple/Advanced controls and adjustable settings panels.
- Includes the latest Pop-up fixes for whole ribs, tiered stands, support heights and all 27 editable presets.
- Keeps the existing updater identity and project format; version 1.3.0 remains available for rollback.

## 1.3.0 — Pop-up

- Pop-up generator with connected ring/spiral designs, editable profiles, 27 presets, shared laser exports and flat/open preview.
- Pop-up fixes: ribs stay one piece on hearts, pumpkins, snowflakes, stars and odd polygons; tiered stands rise to their centre and k tiers make k levels; preset cards show the open form; towers, stands and shades have realistic heights; ribs, posts and knotted cords set every ring's height, so the bridges are snapped instead of warning about strain, and cords list their knot spacing.
- Windows 1.3.0 installer published; superseded by later releases.
- Shared design-to-export workflow, Simple/Advanced settings, resizable/collapsible panels and a visible first-run tour.
- Projects search and product/storage filters, including existing device-only generator drafts.

# Changelog

## 1.2.0 (21 Oct 2026)

**Patterns everywhere.** The cut-out pattern on every part it fits: all Boxes designs, the clock's stand, the Hinge Box (with motif, shape, size and engrave or score), Letters lids and bases, the Parametric backboard, and the QR plate round the code (which still scans). Parts glued on top stay solid; a check says when a pattern is too large for its space and offers a smaller one. Your own seamless tile: upload a picture or SVG and it repeats edge to edge, joined across the seams, on a square, brick, half-drop or mirrored grid.

**Paper Box folds in 3D.** A Fold slider from the flat net to the folded box, Explode to pull it apart, creases drawn in 3D, mountain and valley folds (dash-dot scoring for mountains, if you like). Fourteen new structures: cube, pyramid, triangle prism, candy cone, bakery box with a window, hinged-lid box, pie box, burger clamshell, takeout pail, carry box, wine carrier with its insert, paper bag, CD sleeve and cell divider insert, with tab, hook and friction locks, windows of your own shape anywhere on a face, and 29 new presets.

**Parametric wall art.** Slat wall art like LaserBurn's: sine waves, a ridge along your curve, Perlin noise, ripples, mountains, attractor points or your picture, as a wave relief, with an organic edge, or with level shelves. Mount it on 1x2, 1x3 or 1x4 rails notched into every slat, or on a board; pick 3 mm, 6 mm or 1/4" stock; see the sheets, lumber and screws it needs; export the 3D model as GLB. A guided Wall art panel, four Generate recipes and twelve presets.

Decisions D193-D196 in `DECISIONS.md`; checks in `docs/SMOKE-TEST.md`.

## 1.1.0

The unified app: see `CHANGELOG-REDESIGN.md`.
