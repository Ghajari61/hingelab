## 1.18.0 — Curved supports for photo-generated ribs

- Optional curved support construction preserves parallel rib shapes and placements, adds two support tracks and paired bottom-open / top-open half-laps, and splits long rails into overlapping sheet-sized sections.
- The saved 36-rib wave sculpture now has four support sections, 76 paired joints and two adhesive side-laps in one connected assembly. The entire downward insertion path is checked from actual solid geometry, with no unconnected parts or rib/rail interference.
- Editable section length, stock thickness, fit clearance and minimum web rebuild the construction. Unsupported orientations, crowded ribs and insufficient material stop export with a clear message.
- Numbered assembly instructions, connection dimensions and labels accompany the cutting files. Per-part package exports now preserve enabled labels as well as the sheet export.
- Physical cutting, adhesive strength and load capacity remain unverified. This assembly is a decorative sculpture, not certified seating.

## 1.17.0 — Photo reconstruction and matching joints

- Photo reconstruction now compares actual front, side, top and assembled model renders with the uploaded references before accepting a valid correction. A failed review keeps the usable draft and says the comparison was not completed.
- Curved ribs can vary every profile vertex across the assembly instead of repeating one silhouette. Uploaded photos retain more edge detail within a bounded project size.
- Automatic tab/slot and complementary half-lap joints follow real panel contacts and the mating material thickness. Total clearance, tab spacing and minimum material webs are editable; preview and SVG use the same geometry.
- The assembly report distinguishes mechanical joints, adhesive contacts and unresolved pieces. Build packages include connection dimensions and assembly steps. Existing projects retain their original geometry until auto joinery is enabled.
- Connections are geometrically checked; physical fit, insertion access, invisible construction and load strength still require a sample and review.

## Unreleased — Photo to Product: engineering review

- **Paw ornaments hold together at every size.** On larger paws, or with a narrow frame, neighbouring windows came within hundredths of a millimetre of each other, a web the laser would burn through. Every window now keeps the frame width from the others.
- **Honeycomb lids are centred and symmetric**, and the smallest supported heart box (95 × 85 mm) gets smaller cells instead of an error, so an AI analysis of a small box no longer fails at the last step.
- **Clear measurement messages:** a known width, depth, height or thickness outside its range now says which one and what range, instead of "Upload 1–5 normalized photos and valid dimensions".
- **Lighter projects:** reference photos are kept at 1024 px (about 0.8 MB for five, was 1.9 MB of the browser's 5 MB local storage), and each photo is checked once instead of on every edit.
- Switching between paw, heart box and tag no longer shows the previous product while a font loads.

## Unreleased — Release check: security and speed

- **Security.** AI Studio no longer refunds a job the browser walked away from mid-answer, so credits can't be dodged; the SVG safety check refuses more tricks (prefixed script elements, `<svg/onload>`, embedded images and forms, doctypes); the laser-sheet SVG service answers as a download that can never run as a page; gallery posts go in only through the site, after its checks; the browser may talk only to HingeLab's own database server.
- **Pages load faster.** The site menu, the bookmark button and the editor no longer carry every product's preset list: site pages download about 65 KB less script (the home page 180 → 117 KB), and the editor 33 KB less. Preset and template links still open the right design.
- **Plans and billing.** A paid plan on the website now ends with its paid period (plus three days), as in the desktop app, so a lost cancellation message can't keep it on; a lapsed plan can be bought again; two checkouts at once make one Stripe customer; Free exports from the desktop app carry the "Made with HingeLab" mark on every product, as they already did for the Hinge Box.
- **Faster.** Part labels on a Pop-up (and any design with many long slots) are placed in about 2 s instead of half a minute; very large Pop-ups build three times faster.

## Unreleased — Pop-up: engineering review and true-to-life 3D

- **The 3D shows how a pop-up is really assembled.** Hanging designs show their three cords running through every cord hole, a knot under each ring and the ring they hang from; lamps show the socket, its shade ring and the LED bulb; tealight holders show the tealight; a vase sleeve shows the glass vase standing inside it. Drawn only, never cut.
- **Nested sets stand side by side** in 3D instead of inside each other.
- **Vase sleeve**: the ribs are now radial round an open ring, so nothing crosses the opening, and the ready-made sleeve is taller (150 mm) for a real vase.
- **Dome** is a true spherical cap whose wall meets the rim at 65°, so the rim ring no longer floats far above the one below it. **Varied rings** are now spaced evenly along the slope (narrower where the wall is steep), as they were meant to be.
- **Base plate** under ribs sits on the floor below them instead of cutting through them; a **finial** stands on a tab through a slot in the top disc.
- New checks: a bowl wall with slits taller than 12 mm, rings that hang far apart, and a lamp bulb that would not fit through the ring under the centre disc (with a fix). The E27 lamp designs get an 80 mm centre so the bulb clears.


## Unreleased — Family Names and more Christmas charms

- **New product: Family Names.** One list of names becomes one piece: a name crossword where every name crosses another, a Christmas tree built from the names, a snowflake with a name on each arm, a ring of names round "Mum" or an initial, a split monogram with the name across the initial, or bunting with a letter on each flag. Add a silhouette backer for two layers. 20 ready-made designs.
- **Name Charms:** gift card holder ornaments (four layers, the card slides into a pocket), a little dangle tag under a charm for the year, and snowman, reindeer, cat and gingerbread characters whose hat, nose and buttons cut separately to paint. 9 new designs.
- Welded names now score every letter so they read clearly, like weld-and-score.

## Unreleased — Name Charms

- **New product: Name Charms.** Type a list of names and get one charm each: Christmas ornaments (baubles, stars, trees, snowflakes, paws, dog bones, lanterns), keychains (connected script names, layered mirror acrylic, engraved tags, big initials, house key tags), earrings in pairs, school and luggage bag tags, wine-glass markers that clip on the stem, place cards that stand on a slotted foot, and gift and stocking tags.
- Engrave, score or cut the name through, glue it on in mirror acrylic, or make the welded name itself the charm. Add a second line (a year, a date, a phone number) and a motif.
- Built to last: every hanging hole keeps enough material round it (it moves inwards on stars and hearts), names are fitted clear of the edge and the hole, earrings show their weight, glass clips are checked so they flex without snapping, and place-card slots match your stock. 28 ready-made designs.

## Unreleased — Calibration removed

- The Calibration product (kerf strips, fit ladder and hinge test strip) and its Test & Calibration card are gone, with the coupon results form in My materials. The sheet's Calibration bar and the kerf page stay, and materials you already tested keep their measured values.

## 1.8.0 — 3D that opens out and moves smoothly

## Unreleased — 3D that explodes gently and moves smoothly

- **Explode in place.** The Explode slider pulls the design apart where it stands and glides there gently instead of jumping; the views widen to hold the opened design. (The play button that laid the parts out flat was removed at the owner's request.)
- **Smooth movement.** Explode glides to where the slider asks instead of jumping, the views widen as the design opens out, and orbiting, panning and zooming ease to a stop instead of halting with the mouse.
- **Idle turn.** After five seconds without the mouse or keys, the perspective view turns slowly round the design; any movement stops it. Reduced-motion settings turn the animations off.

## Unreleased — Lids, doors, cabinets and drawers

- **Flip-top lid.** One plate with a living-hinge band across it: the strip behind the band is held by the wall's tabs and the rest swings open. Pick the hinge side (back, left, right or front); the band is sized to open about 105° and the panel says how far it opens. Finger and knob holes move to the free edge.
- **Cabinets.** Stand any box up (Base & standing › Stand it up): the base is the back, a flip-top lid hinged on the left is the door, and dividers across the depth are shelves. New ready-made mini, wall, display (glass door) and flap-door cabinets.
- **Chests of drawers.** Set Drawers to 1–4: the case stands open at the front with a shelf between each two drawers, and each drawer is a small hinge box of its own with a front plate and a knob or finger hole. Drawer walls get their own fitted hinge when the case's is too stiff for them.
- **Cap lid.** A shallow box of its own that slips over the top, like a shoebox or a hat box, with its own fitted hinge for short walls.
- **Stepped lids** (up to three smaller plates on a fixed, lift-off or cap lid; round on a cylinder), a **clear window** under a rim, and a **lamp-holder hole** (E27).
- **Base openings**: a round hole (lamp cord, planter drain) or an open bottom for lamp shades; **hanging holes** (two keyholes) to hang a box or cabinet on screws.
- 21 new ready-made designs (flip-top box, pencil and glasses cases, book box, cigar box, four cabinets, three chests of drawers, shoebox, hat box, tea tin, stepped keepsake, stepped jewellery box, display box, pendant shade, table lamp, planter with drain hole), new Randomise box ideas, and a Cabinets & storage collection page. Hinge Box designs can now be linked with `?p=hinge&preset=<id>`.
- The 3D view and the pictures show flip lids opening, caps, steps, windows, cabinets standing up and drawers; the preset and card pictures are drawn by a new renderer that sorts every face, so inside walls and lids no longer overlap wrongly.

## 1.7.0 — Free tools, 3D printing and the Christmas collection

- **Free tools** at /tools, no account and nothing uploaded: a thickness resizer (a file drawn for 3 mm scaled to fit 4 mm stock), a laser-to-3D-print converter (SVG to STL) and sheet nesting for your own SVG (parts packed by their real shape, engraving kept on its part). Each tool has its own page with steps and questions.
- **STL export.** Every editor's More… export dialog has STL (3D print): the cut-out parts as solid pieces at the material thickness (or one you choose), laid out as on the sheet.
- **Christmas collection.** A name ornament, a star ornament, a tree of life ornament and a bird house ornament join the stocking holder, Christmas table numbers, pop-up trees and toppers on a new Christmas page. The home page features the season's collection (Christmas from October, Valentine's Day in January and February).
- **Collections** now have their own pages (Christmas, Wedding, Birthday, Baby, Halloween, Eid and Ramadan, Valentine's Day, Graduation), each listing every fitting design from every generator with its picture.
- **Search.** The sitemap lists every generator, tool, collection and guide (it listed four pages before), and generator and tool pages describe themselves to search engines.
- Boxes show how much a box holds (litres or millilitres). The export dialog reminds you to measure your material and cut a test first.
- One product button in the header instead of a row of tabs and a Generators menu: it shows the open product and opens a panel of pictures (the three main products, then every generator) to choose from. The editor opens on the Hinge Box when no product is named.
- The settings panel no longer has the Simple/Advanced switch and the seven-step bar above it: every setting shows, and the panel starts straight with the sections.

## 1.6.0 — GitHub sync (25 Oct 2026)

- Website and Windows installer include the latest UI redesign and whole-app changes from GitHub PRs #6 and #7.
- This packaging release was built without additional tests or code review, as requested.

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
