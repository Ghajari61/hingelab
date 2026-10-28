## 1.27.1 — Consistent editor navigation

- Clock: on a layered face (Ring on back, Ring and centre), markers that would sit under the ring were partly hidden by it. They now stay wholly inside the ring's opening, 3 mm in from its edge, and the inscription moves in with them. The check now says so and offers to widen the ring to put them on it. No built-in preset changes.
- The left panel of every editor (all generators, Hinge Box, Letters and Parametric, on the website and in the Windows app) is now in the same order: Randomise first, then the picture-card settings, then the presets. Before, the presets came first and Randomise sat below them.

## 1.27.0 — Text operations in more generators

Shared Engrave, Score and raised-letter operations with No Weld (`lib/generators/textOps.ts`, built on the existing weld and score geometry) now cover eight more generators. Sign, Cake Topper, Name Charms and Family Names already had them and are unchanged.

- Table Numbers and Key Rack: No Weld for Score and Raised. Raised numbers and letters are cut as one second-material piece per glyph, dot and counter instead of one welded piece, laid out on their own sheets; scored lettering keeps each glyph's own outline, so joined scripts and accents still read.
- Keychain: No Weld for raised letters, so every glyph is its own piece instead of fusing where letters touch.
- Trophy: No Weld for scored marks (each glyph's own outline).
- Puzzle: the engraved text and piece numbers can be scored instead, with No Weld.
- Clock: numerals and engraved ticks or dots can be scored (Markers › Mark), and so can the inscription, with No Weld. Ticks and dots cut through stay cut.
- QR Code: a plain label on an engraved plate can be scored. A bar label stays engraved.
- Pop-up: the centre text, monogram, rim text and motifs can be scored. Scored lines stop at the slots and openings, and in 3D they follow the formed rings or spiral.
- Saved designs open exactly as before: the new settings default to Engrave and welded, and unknown values fall back to them. Every default and preset of every generator produces byte-identical SVG to 1.26.0.
- Not covered: Boxes already has Engrave/Score for its engraving but no No Weld. Shadow Box words, hook labels on the Key Rack, and part identifiers are unchanged. Letters, Hinge Box and Parametric have their own controls.

## 1.26.0 — Spiral and Multi for every Pop-up preset

- All 36 Pop-up presets now build as Spiral and as Multi with 2, 3 and 4 arms, with supports, a matching SVG and Lay Flat, and a coherent 3D assembly. Each of the 144 combinations is checked on every test run.
- Choosing Spiral or Multi widens an outer rim that is too narrow for the supports' rim tabs, rounded up to 0.5 mm, and the editor says so ("Outer rim widened from 10 to 12 mm…"). The rim takes the stock thickness, the joint clearance, the minimum feature and the outline's curve into account. Opening a saved design never changes it; a saved spiral whose rim is too narrow shows the error with a "Widen the outer rim" fix.
- The rim check now uses the rim slot's real footprint. It had treated the slot as stock-thick rather than stock plus clearance plus margin, so on small outlines (the nursery mobile's smallest size) it allowed a rim no joint fitted.
- Nested sets: each size's spiral now starts on a solid land outside the opening the next size is cut from. Starting at the opening's edge, the first turn ran closer to it than the cut gap and left a sliver loose ("Spiral cuts separate the strip" on the Kids Nursery Mobile with Multi 4). Every size keeps a rim wide enough for its own support tabs.
- Spiral supports are cut back round the lamp socket's shade ring, the bulb, an LED tealight and a sleeve's vase, with 2 mm of clearance. Their rim, centre and base joints are placed clear of these fittings. Before, the supports of the pendant lamps ran through the socket ring and the bulb.
- Names batches show one complete assembly per name in 3D, side by side and 40 mm apart, each with its own socket, bulb and cords. This applies to every generator with batches; the cut parts and the sheet layout are unchanged.
- Every public page, including Privacy and Terms, now uses the same header with Make, Community, Learn and search. On short pages (About, Contact, Gallery, Kerf tools) the footer sits at the bottom of the window instead of halfway up it. The Gallery uses the same column and title as the other pages.
- On phones, the app's header (Home, Templates, Help) no longer shows "Make" and "Community" overlapping the Menu button with the search box pushed off-screen; it shows the logo and a Menu button. The editor's status bar shows the part count and whether the design fits, and leaves out the pointer position, zoom and used area.
- The Kerf tool form uses the same card and fields as the other free tools. The Materials table has a header, row lines and right-aligned numbers.
- Type scale: the 67 half-pixel font sizes (9.5 to 15.5 px) and the 9, 19 and 21 px sizes now use whole steps of one scale (10–18, 20, 22, 24, 28, 34, 46 px). A test keeps new stylesheets on it.
- Sections no longer open empty. A section whose settings depended on a picture choice from the left panel (Cut-out pattern on 11 products, Puzzle Frame and Engraving, QR Output, Motif and Build on signs, toppers, table numbers and charms, Shadow Box Pattern, Charm Style) showed only its header until a choice was made there. The choice now also appears as a list at the top of its section. Rows of hidden number fields no longer leave gaps.
- Pop-up: Spiral supports are hidden while the pattern is Rings, because they only apply to spirals. Switching on a tealight or lamp socket, a very small or narrow outline, narrow rings, a thin rim or several nested sets no longer leave the design stuck on an error: each error offers a one-click fix that builds, such as widening the centre disc, using two ribs and wider rings, or enlarging the outline. The Leaf outline is less pinched in the middle, so it builds at the default size.
- Large ring Pop-ups build about five times faster (a 700 mm bowl: 27 s → 5 s). Rib joint searches, insertion reliefs and ring labels now clip only the slots that can reach the part being checked, instead of every slot on the sheet. Cut files are byte-identical for all Pop-up presets and four large or unusual designs.
- The AI designer no longer lists Wooden Packaging as a separate product; packaging requests go to Boxes & Packaging, matching the menus since 1.21.0. Old packaging links still open.
- Tests brought up to date with 1.21.0 and 1.24.1: product list, AI menu, the Boxes golden file header and the Parametric all-sheets file, which now uses the Lay Flat rows. The forty-design Shadow Box Randomise check gets a 60 s limit.

## 1.25.1 — Pop-up spiral 3D

- The assembled spiral was drawn by lifting the blank's cap triangles only at their corners. Those triangles join far-apart points of the strip, so the surface sagged up to 19 mm from the target form and looked crumpled. Formed parts are now subdivided where the form bends (every edge under 12 mm, within 0.2 mm of the form) and shade smoothly; cut edges stay sharp.
- The strip now forms like a spring: each turn is level across its width and its height follows the turn's centreline, instead of tilting like a cone across every turn. The first and last turns meet the centre disc and rim without a step.
- Spiral supports follow the turns with flat treads and risers on the lower side, so the strip rests on every turn without passing into it. Rim and centre tabs overlap the support body by 0.3 mm.
- Multi spirals with fewer turns per arm than one (for example 4 arms, 2 turns) were formed as if each arm made a full turn; the form no longer matched the cut slots and the 3D mesh split into millions of triangles (17 s per preview). The form now follows the slots as cut.
- Added checks that formed spiral meshes stay within 1 mm of the target form (spiral and multi, dome/linear/bell profiles) and that the form follows the cut slots for 1 to 4 arms.

## 1.25.0 — Supported Pop-up spirals

- Spiral and Multi can now generate a permanent forming cradle: a base plate, three or four radial supports matching the chosen height profile, and headed retaining keys on flat rim/centre lands. The continuous strip remains intact.
- Stock thickness and joint clearance drive matching tabs, eyes and mortises. Supports account for the full stock footprint and profile transitions; key insertion paths avoid raised sections and accessory openings. Narrow rims and insufficient base clearance produce actionable errors.
- Base/support/key identifiers, matching mortise labels and step-by-step dry-fit/gluing instructions are included. Assembled, exploded, Lay Flat and SVG use the same parts. Manual forming remains available by disabling the cradle.
- Added digital fit, insertion-path, interference and SVG parity checks for 2/3/4/6 mm stock, three/four supports, single/multi spirals and six height profiles. Actual wood bending, kerf and load capacity still require a physical prototype.

## 1.24.2 — Continuous Pop-up spirals

- Selecting Spiral or Multi now switches away from separate-ring joints atomically, including saved designs with incompatible ribs, posts, feet or suspension holes. Returning to Rings restores rigid rib construction.
- Assembled previews retain the continuous cut strip instead of splitting it into artificial rings. Physical edge overlays follow the curved sheet without showing triangulation diagonals; Lay Flat and SVG retain the same manufacturing contours.
- Ring-only controls are hidden in spiral mode. Spiral spacing, arm counts, overlap guards and assembly instructions now describe the continuous-strip workflow. The 3D form is a target shape, not a material bending or load simulation; physical prototyping remains necessary.
- Added regression checks for the reported Ripple bowl, single/multi spirals, circular and concave outlines, mode switches, exact SVG/flat geometry, continuous 3D, physical edges and invalid cut gaps. Existing Pop-up presets and shared preview checks remain green.

## 1.24.1 — SVG and Lay Flat parity

- Combined Parametric SVGs, the cutting canvas, Lay Flat and per-sheet exports now share one sheet grid and millimetre coordinates. Calibration bars are included in 3D, and fractional placements are rounded consistently for single and combined files.
- Lay Flat displays the actual exported score paths, engraving, images and part labels, including mixed material thicknesses. Export switches control the displayed operations; textures are released when changing designs.
- Hinge Box and Letter walls use the exported curved notch outlines. Hinge plates also respect directional kerf. Repeated generator parts retain unique copy IDs and correct sheet IDs in SVG metadata.
- Added cut-file readback comparisons of closed regions, openings, dimensions and spacing across all 572 generator defaults/presets, Hinge presets, Latin/Persian letter modes and six Parametric methods. Also checked numbering, mirroring, nesting, calibration and split-sheet exports. These are digital geometry checks, not physical laser calibration.

## 1.24.0 — Consistent Lay Flat and smoother 3D previews

- Parametric now has Assembled / Lay flat views. Flat parts use the same cut contours, rotations and separated sheet positions as the cutting canvas, including nested islands and internal cuts.
- Generic generators, Parametric and Letters move existing geometry while exploding or lifting lids instead of triangulating every animation frame. Assembled generic previews no longer rebuild for layout-only updates; Parametric no longer prepares duplicate edge overlays.
- Lay Flat respects secondary-stock thickness. Hinge Box and Letters normalize disconnected regions and holes before extrusion; preview resources and shared materials survive design switches correctly.
- Digitally checked 572 generic defaults/presets for overlapping filled regions, triangulated surface area and finite SVG paths; also checked all Hinge presets, Latin/Persian lettering modes and six Parametric methods. Local CPU motion measurements improved Pop-up from 10.92 to 0.033 ms and Puzzle from 23.82 to 0.024 ms per step (not total page-load or GPU times).

## 1.23.1 — Correct and faster Lay Flat previews

- Fixed Pop-up rings and other disconnected cut regions appearing as overlapping surfaces, filled gaps and diagonal lines in Lay Flat. Each wooden region now keeps only its own holes, including nested islands, rotated parts and mirrored layouts.
- Removed the malformed triangulation that stalled the 3D view. Local repeated measurements, including edge generation, improved Kids Nursery Mobile from 677 to 77 ms and Ripple display bowl from 1,092 to 62 ms. These are preview CPU timings, not total page load times.
- All 36 Pop-up presets plus tiered, holding-land and zero-kerf cases have surface checks against cut geometry. SVG toolpaths and assembly dimensions are unchanged.

## 1.23.0 — No Weld and letter Cut / Score

- Added **No Weld** beside the Weld controls in Letters, Name Charms, Signs, Cake Toppers and Family Names trees/snowflakes. The previous weld setting is retained; separate glyphs, dots and counters are preserved, including styled and curved text.
- Added **Cut / Score** for letter-based designs. Cut produces letter pieces; Score traces nominal letter contours on the backing without cutting a second letter layer. Toppers retain a structural backer for their stakes. Card-holder names are scored on retained wood clear of the window.
- Solid Letters can now export score-only SVG: text placement and counters stay intact, no kerf is applied, and the preview stock rectangle is never exported as a cutting path. Score marks remain visible under viewport material changes.
- Saved projects without the new settings keep their previous Cut and Weld behavior. Shared web controls and Windows settings use the same options.

## 1.22.1 — Clearer separate-part assembly note

- The shared cut-file check now explains that pieces intentionally cut free, such as Pop-up rings, should be kept for assembly. It recommends adding bridges only when a connected design is intended. Manufacturing geometry and all 1.22.0 joint corrections are unchanged.

## 1.22.0 — Pop-up joints and assembly order

- **Full-thickness ring clearance.** Profile ribs now clear the complete vertical insertion path of the actual ring material, including curved and angled edges. This removes interference in Ripple, Snowflake Tree, Heart Basket and Pyramid. A geometry check rejects lost tabs, split rings and obstructed insertion paths.
- **Separate rings ready to assemble.** Supported rings are released directly by the SVG by default. Temporary holding lands remain optional and must be removed flush before assembly. Negative joint clearance is rejected for rigid supports; slot dimensions use measured stock plus total clearance and the shared exporter applies kerf once.
- **Numbered assembly.** Engraved L01-to-centre ring identifiers match the 3D part names, per-ring installation order, seat heights and finished widths. Nested sizes use S1/S2 prefixes on rings and ribs. Instructions cover crossed half-laps, radial hubs, rings, handles and finials; printable assembly cards are available.
- **Existing files:** Pop-up files without the new release/numbering settings use separate rings and enabled engraving. Enable temporary holding lands to retain the former connected cutting blank, or disable ring identifiers for very small parts. Regenerate the full matching set of rings and supports; do not mix these revised ribs with older cut files.
- All 36 presets and additional stock/clearance/support variants were checked digitally. Actual wood variation, glue strength and load capacity still require a physical test cut.

## 1.21.1 — Correct Pop-up geometry in 3D

- **All 36 Pop-up previews now use the final cut material.** Nested ring openings no longer cancel against joint cuts and create phantom wooden islands, extra edges or filled-in holes. Slots, handle holes, cord holes and engraving are clipped to their actual rings.
- **Rigid parts stay rigid.** Assembled and Lay flat show the two real states. Explode separates every ring, rib and accessory; the misleading slider that pushed rings through their supports is removed. Assembled pendants keep their cords and fittings.
- Refreshed every Pop-up thumbnail. Existing SVG cutting geometry and kerf compensation remain unchanged and validated against all preset snapshots. Holding lands still need to be cut before assembly; workshop fit and load testing remain necessary.

## 1.21.0 — Unified Boxes & Packaging

- **Boxes and Wood Packaging are one product.** The shared Boxes & Packaging library includes every former box and packaging preset, with editable sizes, joints, lids, engraving, sheet layouts, SVG export and 3D preview. Existing packaging project files, links and local drafts retain their original settings.
- **Photo to Product has been removed** from the website and Windows app, including its analysis endpoints and desktop API access. Existing personal files and local stored data are not deleted. Opening an old Photo to Product file explains that the feature has been retired.

## 1.20.0 — Wood Packaging and sturdier Pop-up ribs

- **Paper Box is now Wood Packaging.** Gift, product and shipping boxes in plywood with finger joints: lift-off, sliding, pin-hinged, inset or closed lids, trays and divided boxes, drawer boxes, hexagon boxes, divider inserts, stacking trays and book boxes, with your brand engraved on the lid. All the paper designs became their wooden equivalents (70 ready-made boxes): two-piece boxes take a lift-off lid, tuck-end cartons a sliding lid, mailers and clamshells a hinged lid, drawer cartons and sleeves a wooden drawer. Designs saved as paper boxes open as the matching wooden box at the same inside size. Bags, cones, pillow boxes, pyramids and other paper-only forms are gone.
- **Pop-up ribs are one solid frame.** Each rib used to be a comb: a 0.6 mm slit between every two rings ran almost to its foot, so a tower's rib was a row of 9 mm strips joined only at the bottom. The rib is now solid below its treads; tall ribs (towers, tiered stands, the vase sleeve) are lightened with round-cornered windows inside a 12 mm frame and struts, so the stands look like stands and use less wood. The rib's foot no longer stands 0.3 mm proud of the outer tread.

## 1.19.0 — Animated assembly inside the 3D workspace

- Photo-generated parallel ribs with verified curved supports now have an **Assembly guide** in the 3D toolbar. The saved 40-piece sculpture uses 43 stages: preparation, four support sections, two alignment ribs, an explicit curing checkpoint, the remaining ribs and a final review.
- Numbered cutting parts move down onto their actual matching joints. Cyan adhesive faces show the rail overlaps and slot shoulders; numbering follows the SVG export. Animation never changes the fabrication geometry.
- Play/pause, previous/next, step selection, progress scrubbing, three playback speeds, remaining-part ghosts and optional full numbering make the sequence easy to inspect. Playback pauses when hidden and respects reduced-motion settings.
- The guide requires a complete verified support assembly. Dry fitting, adhesive cure time, secure mounting and physical strength still require workshop verification; animation is not a load or adhesive certification.

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
