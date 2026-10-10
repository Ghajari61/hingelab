# HingeLab Studio — Master Product Spec for Cursor

**This is the master document.** It turns HingeLab from a single generator into a complete, subscription-based laser design studio: a professional vector editor (in the spirit of Adobe Illustrator and CorelDRAW, focused on laser work) plus ten parametric generators.

It **supersedes the phase order** of the earlier briefs. The earlier briefs stay valid as the detailed specs for their parts:

| File | Role now |
|---|---|
| `CURSOR_PROMPT.md` | Stack, Hinge Box port, accounts, cloud, Stripe — details referenced by phases S0, S4, S9 |
| `hingelab-prototype.html` + `golden-svgs.json` | Ground truth for the Hinge Box geometry (golden test must always pass byte-for-byte) |
| `CURSOR_LETTERS_PROMPT.md` | Detailed spec of generator #3 (Letters) — phase S7 |
| `CURSOR_PARAMETRIC_PROMPT.json` | Detailed spec of generator #4 (Parametric Slicer) — phase S8 |
| **`CURSOR_STUDIO_PROMPT.md` (this file)** | Product, editor, generators, presets, accounts, plans, UI/UX, execution order |

If anything conflicts, **this file wins**, except for Hinge Box geometry, where the prototype and golden file win.

**Execution mode:** autopilot, as already instructed. Do not stop to ask questions. Log decisions in `DECISIONS.md`, blockers in `BLOCKERS.md`, progress in `PROGRESS.md`, owner tasks in `SETUP.md`. Tests are the gate between phases.

---

## 1. Positioning (competitor review)

| Competitor | What it is | Strengths | Gaps HingeLab Studio fills |
|---|---|---|---|
| **LightBurn** (2.x, desktop, paid licence) | The standard laser control + layout app. 2.0 added dark mode, new shapes (stars, polygons), an Edit Nodes toolbar, boolean buttons, independent design/machine units. | Machine control, cut settings, camera, trace, arrays, offset, booleans | No real parametric generators (living hinges, letter boxes, sliced sculptures), dated UI, desktop only, no cloud projects, no Persian/Arabic shaping |
| **Glowforge App + Premium** (web, subscription) | Now sold as a subscription to owners of *any* laser. Magic Canvas (AI art), catalog, Design View, Smartfit packing, exports to SVG / LightBurn / xTool. | Very polished, cloud, catalog, cross-brand export | Few engineering generators, weak precision tooling, no kerf-aware joinery, limited parametric control |
| **xTool Creative Space / xTool Studio** (free with xTool machines) | Brand software with product generators (tissue box, treasure box, ornament, puzzle) and atomm.com community tools (incl. a living-hinge generator). | Free, friendly, generators | Tied to xTool hardware, shallow parameters, little engineering validation |
| **Boxes.py / MakerCase / Festi** (free web generators) | Large libraries of parametric boxes. | Breadth, free | 2000s-style UI, no editor, no projects, no previews, no presets, no bend analysis |
| **Inkscape / Illustrator / CorelDRAW / Affinity** | General vector editors. | Deep drawing tools | Not laser-aware (no kerf, cut order, tabs, layers-as-operations), no generators |

**Our promise:** *the precision of an engineering tool, the polish of Adobe, generators no one else has (living hinges, letter boxes, sliced sculptures), in the browser, with your projects in the cloud, for any laser.* Every exported file opens in LightBurn, xTool Creative Space, Glowforge, RDWorks, LaserGRBL and Inkscape.

---

## 2. Information architecture

| Route | Purpose |
|---|---|
| `/` | Marketing landing page (hero with a live generator demo, the 10 generators, pricing, FAQ, footer) |
| `/login`, `/signup` | **Continue with Google** (primary), email magic link (secondary) |
| `/home` | **Start screen** (§3); default route after login |
| `/editor/[projectId]` | The studio (§4) |
| `/projects` | All projects: grid/list, folders, tags, search, sort, trash |
| `/presets` | Manage my presets, materials, machine profiles, shortcut sets |
| `/account` | Profile, preferences, connected Google account, data export, delete account |
| `/billing` | Plan, invoices, Stripe Customer Portal |
| `/templates` | Curated starter projects |
| `/help` | Docs, video tutorials, keyboard shortcut reference |

Logged-out visitors can open `/home` and use the editor in **guest mode** (local only, Free limits). Saving to the cloud prompts sign-in, and the guest project is migrated into the new account automatically.

---

## 3. Start screen (`/home`)

Shown every time the app opens (setting: "Show start screen on launch", default on). Layout:

1. **Greeting bar:** "What do you want to make today, {firstName}?", a search field ("Search generators, templates and projects… ⌘/Ctrl+/"), account avatar.
2. **Generator grid:** the ten generators (§7) as large cards. Each card has a looping 3-second animated preview (pre-rendered WebM/Lottie, under 300 KB), name, one-line description, a "Pro" badge where applicable, and a "Last used" chip. Click → a **New project dialog** pre-filled for that generator: project name (default "Untitled {Generator} {n}"), material preset, machine profile, units. Enter → editor opens with the generator panel focused.
3. **Blank canvas card** (first in the grid, visually distinct): "Start from scratch — draw with pen, shapes and text". Opens the New document dialog: name, sheet presets (machine bed sizes, A-series, Letter, 12×12 in, 300×200, 600×400, custom), orientation, units (mm, cm, in, pt), material, machine.
4. **Open:** "Open from computer…" (`.hingelab`, `.svg`, `.dxf`, `.pdf` later), "Import image to trace…".
5. **Recent projects:** horizontal strip of the last 12 cloud and local projects with thumbnails, name, generator icon, modified time. Right-click: Open, Rename, Duplicate, Download, Move to folder, Delete.
6. **Templates:** a row of curated templates (§11.6).
7. **What's new** (dismissable card) and **Learn** (2–3 short tutorials).

Empty states: a new user sees a welcome card with a 30-second tour button instead of recents.

---

## 4. The editor (studio)

### 4.1 Layout
- **Menu bar** (§6) + document tabs (multiple open projects, like Illustrator tabs) + Share/Export button + account menu.
- **Control bar** (context-sensitive, like Illustrator's Control panel / Corel's Property Bar): shows the options of the active tool or selection (e.g. rectangle: W, H, corner radius, corner type; text: font, size, tracking; generator: its key params).
- **Toolbar** (left, collapsible to one or two columns; tools with sub-tools grouped in flyouts with long-press or right-click).
- **Canvas** with rulers, guides, grid, artboards (= material sheets), pan/zoom, minimap (optional).
- **Panel dock** (right): tabbed, collapsible, drag to reorder, detachable as floating panels, resizable; state saved per workspace.
- **Status bar:** cursor X/Y, selection size, zoom, units switcher, snapping toggles, cut-time estimate, cloud save state, sync indicator.

### 4.2 Workspaces (Window → Workspace)
Built-in: **Essentials**, **Laser Production** (Cut Layers, Cut Preview, Materials up front), **Typography**, **Generators** (generator panel large, 3D preview), **Minimal**. Users can save their own workspaces, and "Reset {workspace}" restores the layout.

### 4.3 Panels (Window menu lists all)
Properties (contextual), Layers & Objects (tree with visibility, lock, rename, drag reorder), **Cut Layers** (laser operations, §5), Transform, Align & Distribute, Pathfinder / Shape Ops, Offset & Contour, Arrays, Character & Paragraph, Glyphs, Swatches (cut colors), Generators, Presets, Materials & Machines, Assets/Library, History (clickable states + snapshots), Cut Preview / Simulation, 3D Preview, Measure, Document Info, Comments (later).

### 4.4 Interaction quality bar
- 60 fps pan/zoom with 20,000 path segments on a mid-range laptop.
- Smart guides with magenta snapping hints (centres, edges, distances, equal spacing).
- Every numeric input supports math (`25.4*2`, `+10`, `50%`), units (`3in`, `12mm`), arrow-key stepping (Shift ×10, Alt ×0.1), scrubbing on the label, and **reset** (§10).
- On-canvas HUD with dimensions while drawing and transforming.
- Undo/redo for everything, 200 steps, plus named snapshots.
- Copy/paste between projects and from/to other apps as SVG.

---

## 5. Laser-specific core (what makes it more than a drawing app)

1. **Cut Layers = operations** (like LightBurn): each colour is a layer with mode (Cut / Score / Engrave fill / Engrave image), speed, power, passes, interval, air assist, priority (order), output on/off, show on/off. Default palette follows LightBurn indices C00–C29 so exported colours map 1:1.
2. **Kerf compensation** per layer (outward for outer contours, inward for holes; detected automatically by nesting depth).
3. **Tabs / micro-joints** on cut paths: manual (click on path) and automatic (count or spacing, width).
4. **Cut order optimisation:** inside-before-outside, then nearest-neighbour with optional direction and start-point control; show the order as numbers in Cut Preview.
5. **Cut Preview simulation:** animated tool path with travel moves shown dashed, scrub bar, total time estimate from the machine profile.
6. **Clean-up for laser:** remove duplicate/overlapping lines (critical: avoids double burns), join open paths within tolerance, close nearly-closed paths, find open paths, remove tiny objects, merge collinear segments. Run automatically before export, with a report.
7. **Sheets & nesting:** artboards = material sheets with size and material; **Nest selection onto sheets** (rectangle packing v1, true-shape NFP nesting v2), with spacing, rotations, grain constraint; "Fill area with copies".
8. **Material & machine library:** machine profiles (laser type CO₂/diode/fiber, wattage, bed size, max speed, origin, export colour mapping, preferred export format) and material presets (thickness, kerf, recommended hinge params, starting cut settings per laser type). Ship starting values labelled **"Starting point — run a test grid first"**; the Test & Calibration generator (#10) writes calibrated values back into the user's preset.
9. **Engraving:** text and fill areas; single-line (Hershey/EMS) fonts for fast scoring; image engraving with dithering preview (Floyd–Steinberg, Jarvis, Stucki, halftone) — export as embedded PNG on an Image layer.

---

## 6. Menus (complete)

Shortcuts shown are Windows; macOS uses ⌘ for Ctrl and ⌥ for Alt.

**File:** New… (Ctrl+N) · New from Generator ▸ (list of 10) · New from Template… · Open… (Ctrl+O) · Open Recent ▸ · Import… (Ctrl+Shift+I) · Place Image… (Ctrl+Shift+P) · Close (Ctrl+W) · Save (Ctrl+S) · Save As… (Ctrl+Shift+S) · Save a Copy… (Ctrl+Alt+S) · Save to Computer (.hingelab) · Rename… (F2 when nothing selected) · Version History… · Revert to Saved · Export ▸ (SVG… Ctrl+E · DXF… · PDF… · PNG… · LightBurn .lbrn2… · Export Selection… · Export for Screens/All Sheets ZIP…) · Document Setup… (Ctrl+Alt+P) · Share… · Project Settings · Exit to Start Screen

**Edit:** Undo (Ctrl+Z) · Redo (Ctrl+Shift+Z) · Cut / Copy / Paste (Ctrl+X/C/V) · Paste in Front (Ctrl+F) · Paste in Back (Ctrl+B) · Paste in Place (Ctrl+Shift+V) · Paste Attributes · Duplicate (Ctrl+D, Corel-style; Illustrator's "Transform Again" is Ctrl+Alt+D) · Step and Repeat… (Ctrl+Shift+D) · Delete · Select All (Ctrl+A) · Find & Replace Text… · Reset ▸ (Selected Field · Section · Generator · Project to Template · Workspace · All Preferences) · Presets ▸ · Keyboard Shortcuts… (Ctrl+Alt+Shift+K) · Preferences… (Ctrl+K)

**Object:** Transform ▸ (Move… Shift+Ctrl+M, Rotate, Reflect, Scale, Shear, Transform Each… Ctrl+Alt+Shift+D, Reset Bounding Box) · Arrange ▸ (Bring to Front Ctrl+Shift+], Forward Ctrl+], Backward Ctrl+[, Send to Back Ctrl+Shift+[) · Align ▸ · Distribute ▸ · Group (Ctrl+G) · Ungroup (Ctrl+Shift+G) · Lock (Ctrl+2) / Unlock All (Ctrl+Alt+2) · Hide (Ctrl+3) / Show All (Ctrl+Alt+3) · Arrays ▸ (Grid, Circular, Along Path, Mirror/Symmetry) · Compound Path ▸ (Make Ctrl+8, Release Ctrl+Alt+Shift+8) · Clipping Mask ▸ (Make Ctrl+7, Release) · Expand (turns live shapes, text and generator objects into plain paths) · Expand Generator · Edit Generator… (double-click) · Flatten Transparency (n/a) · Artboards/Sheets ▸ (Fit to Artwork, Rearrange, Add Sheet)

**Type:** Font ▸ · Recent Fonts ▸ · Size ▸ · Glyphs · Text on Path · Area Type Options · Create Outlines (Ctrl+Shift+O) · Change Case ▸ · Direction ▸ (LTR, RTL) · Upload Font… · Single-line Fonts ▸ · Find Font…

**Select:** All · Deselect (Ctrl+Shift+A) · Reselect · Inverse · Same ▸ (Cut Layer, Fill, Stroke, Object Type, Generator) · Object ▸ (Open Paths, Duplicates, Tiny Objects, Text, Images) · Save Selection… · Next/Previous Object (Tab / Shift+Tab)

**Path:** Join (Ctrl+J) · Average… (Ctrl+Alt+J) · Close Path · Reverse Direction · Break Apart (Ctrl+K in Corel mode) · Simplify… · Smooth… · Offset Path… · Outline Stroke · Add Anchor Points · Remove Anchor Points · Divide Objects Below · Split into Grid… · Fillet / Chamfer Corners… · Clean Up for Laser… · Pathfinder ▸ (Unite, Minus Front, Minus Back, Intersect, Exclude, Divide, Trim, Merge, Crop, Outline) · Shape Builder (Shift+M)

**Laser:** Cut Layers… · Assign to Layer ▸ (C00–C29, shortcuts Alt+0…9) · Kerf Compensation… · Add Tabs… · Optimise Cut Order… · Cut Preview (Ctrl+Shift+L) · Clean Up for Laser… · Material & Machine… · Run Pre-flight Check (Ctrl+Shift+K) · Nest Selection on Sheets… · Fill Area with Copies… · Image Engraving Settings…

**Generators:** the ten generators (§7) · Recently Used ▸ · Manage Generator Presets… · Expand Selected Generator · "Request a generator…" (opens feedback form)

**View:** Zoom In (Ctrl+=) · Zoom Out (Ctrl+-) · Fit Artboard (Ctrl+0) · Fit All (Ctrl+Alt+0) · Actual Size (Ctrl+1) · Zoom to Selection (Ctrl+Shift+0) · Outline Mode (Ctrl+Y) · Pixel/Material Preview toggle · Rulers (Ctrl+R) · Guides ▸ (Show Ctrl+;, Lock Ctrl+Alt+;, Make from Selection Ctrl+5, Clear) · Grid (Ctrl+') · Snap to Grid (Ctrl+Shift+') · Snap to Point (Ctrl+Alt+') · Smart Guides (Ctrl+U) · Show Cut Order · Show Kerf · 3D Preview · Presentation Mode (F) · Theme ▸ (Dark, Darker, Light, System)

**Window:** every panel (§4.3) · Workspace ▸ (built-ins, New Workspace…, Manage…, Reset) · Arrange ▸ (Tile, Cascade documents) · Command Palette (Ctrl+/)

**Help:** Search Help (F1) · Keyboard Shortcuts (Ctrl+Alt+/) · Interactive Tour · Tutorials · What's New · Material Testing Guide · Contact Support · Report a Bug · About HingeLab

---

## 7. Generators (10)

Every generator is a **live object** on the canvas (`GeneratorInstance`): its parts are drawn from its parameters, it can be moved/rotated/duplicated like any object, double-click reopens its parameters, and **Expand** turns it into plain editable paths. Several generator instances and hand-drawn art can live in the same project and be nested together on sheets.

### 7.0 Generator contract (all generators implement this interface)
```ts
interface GeneratorDef<P> {
  id: string; name: string; category: "Boxes" | "Hinges" | "Lettering" | "Sculpture" | "Home" | "Games" | "Tools";
  plan: "free" | "pro";
  version: number;                       // geometry version; stored with every instance for migrations
  defaults(material: MaterialPreset): P;
  schema: ParamSchema<P>;                // drives the panel UI: groups, fields, units, min/max/step, visibility rules, help text
  builtInPresets: Preset<P>[];           // curated, read-only, with thumbnails
  validate(p: P): Issue[];               // errors block export; warnings do not
  build(p: P, ctx: BuildContext): GeneratorOutput;  // pure, deterministic, runs in a Web Worker
  preview3D?(p: P, out: GeneratorOutput): Scene3D;  // optional
  migrate?(old: unknown, fromVersion: number): P;
}
interface GeneratorOutput {
  parts: Part[];                         // each with outline, inner cuts, engrave paths, label, cut layer assignment
  analysis: { stats: Stat[]; issues: Issue[] };
  assembly?: AssemblyGuide;
}
```
Every generator panel shows: preset picker (built-in + mine + favourites), parameter groups with reset buttons, a live analysis box, "Randomise" where it makes sense (puzzle, patterns), **Place on canvas / Update**, **Save as preset**, and **Reset generator**. Every generator ships with deterministic golden tests (fixed params → byte-identical SVG) plus invariants (all parts connected, tabs = slots, no part larger than the sheet, kerf applied once).

### 7.1 Hinge Box  — *Boxes · Pro*
Exactly the existing HingeLab generator (rounded/pill/polygon/cylinder; open/fixed/removable lid; straight/wave/relief/serpentine; slot/line cuts; auto-fit; bend analysis; test strip). Ported per `CURSOR_PROMPT.md`; golden test byte-for-byte. Built-in presets: "Jewellery box 3 mm birch", "Pencil cup Ø80", "Hexagon gift box", "Pill tray", "Tea box with lid".

### 7.2 Hinged Cover  — *Hinges · Pro*
Flat book covers, journals, notebook covers, menu folders, photo albums and card holders with a living-hinge **spine** (as in the owner's reference: a full-height lattice band in the middle, rectangular slots near the edges, an engraving area).
- Params: cover width & height (one panel), spine width (or "auto from page block thickness + 2 mm"), corner radius, hinge pattern & cut style (reuse `lib/hinge` patterns; the band runs full height with edge notches merged into the outline), number of hinge zones (1 spine; 2 for tri-fold; N for accordion), slots (for elastic band / ring binder / leather strap: count, size, positions mirrored front/back), ring-binder holes (2/3/4-ring standards and custom), clasp hole, pen loop slots, **artwork area** (place any canvas art or SVG, auto-scaled with margin, on the engrave layer), border engraving, spine text (rotated).
- Presets: A5 journal, A4 folder, menu 2-fold, passport cover, 6×4 photo album, recipe binder (3-ring).
- Checks: bend analysis for 180° fold over the spine width (`neutral radius = spineWidth / π`), slot clearance from the hinge band, artwork collision with slots.

### 7.3 Letters  — *Lettering · Pro*
Per `CURSOR_LETTERS_PROMPT.md`: Letter Box (hinge walls), Solid, Stencil; any script with HarfBuzz shaping (Persian/Arabic RTL included).

### 7.4 Parametric Slicer  — *Sculpture · Pro*
Per `CURSOR_PARAMETRIC_PROMPT.json`: parallel fins, stacked layers, waffle, radial, fins along a curve; from 3D files, photos, or formulas.

### 7.5 Finger-Joint Box  — *Boxes · Free*
The classic box, done better than Boxes.py/MakerCase.
- Params: outer/inner dimensions, thickness, kerf, finger width (auto/odd count), finger style (standard, dovetail-look, rounded relief/dog-bone for MDF), edge rules per side.
- Lid types: none, lift-off with lip, **sliding lid** (grooves via stacked inner rails), **pin-hinged lid** (barrel knuckles with a 3 mm dowel/filament pin), flap lid with living hinge, magnet pockets.
- Extras: internal dividers (grid with cross-halving slots), feet, handle cut-outs, ventilation pattern, engraved label plate, T-slot screw joints (M3 nut traps) as an alternative to glue.
- Presets: Business-card box, Tissue box, Raspberry Pi enclosure, Wine box, Toolbox with handle.

### 7.6 Tray & Drawer Organizer  — *Home · Free*
- Params: outer size or "fit inside drawer W×D×H minus clearance", grid of compartments (columns × rows, or custom split lines drawn on a mini-editor), divider height ratio, finger-pull cut-outs, stackable rim, rounded inner corners via living-hinge corner option, drawer front with handle hole.
- Cross-halving divider joints (slot depth = half height ± clearance), tabbed into the base.
- Presets: Cutlery tray, Watch box 6 slots, Screws organizer 4×6, Spice drawer, Desk organizer.

### 7.7 Hinge Pattern Fill  — *Hinges · Pro*
Apply a living-hinge pattern to **any closed shape or selected region** of the user's own design (pattern-only tool for pros).
- Select a shape (or draw a band) → choose pattern (straight, wave, relief, serpentine, plus **cross-hatch**, **diamond**, **hexagon**, **spiral/radial** for 2-axis flex), orientation/angle, spacing, slit, bridge, cut style, margin from edges, "merge edge cuts into outline".
- Pattern is clipped to the region with Clipper2; slits never closer than `minBridge` to the region border unless the user allows edge notches.
- Bend analysis per region, and a "bend axis" arrow on canvas.

### 7.8 Lamp & Lantern  — *Home · Pro*
- Forms: cylinder or polygon lantern with living-hinge wall; panel lantern (flat panels with finger joints); stacked-ring pendant shade; table lamp with base.
- Decorative perforation library for the wall (all parametric, seedable): hexagons, Voronoi, Islamic geometric star patterns (girih 8/10/12-fold), Moroccan arches, waves, stars, custom image → halftone holes, text.
- Structural rules: minimum web width between holes (≥ 1.5·T for wood), keep-out bands at hinge columns and top/bottom rims, max open-area ratio warning (strength).
- Fittings: E26/E27 socket hole (40/27 mm), LED puck recess, cable hole, bulb clearance check (bulb dimensions preset vs inner diameter).
- Presets: Moroccan lantern, Hex pendant, Night-light cube, Voronoi table lamp.

### 7.9 Jigsaw Puzzle  — *Games · Free (≤ 50 pieces) / Pro*
- Params: overall shape (rectangle, circle, heart, custom closed path from canvas), piece count or grid, tab size, jitter, random seed, edge style (classic, wavy, straight-cut "kids"), corner radius, frame/tray (with base), image engraving on top (place image → engrave layer, aligned).
- Algorithm: Bezier tab edges per shared edge (each shared edge generated once, used by both pieces), seeded RNG, guaranteed no self-intersection (re-roll edge on failure); pieces as closed outlines for counting/preview, but export as **shared single lines** (no double cutting).
- Presets: Kids 12 pieces, Photo 100 pieces 300×200, Heart 24, Round 36.

### 7.10 Test & Calibration Suite  — *Tools · Free*
The tool every pro needs before cutting real work. Results are saved into the user's material presets.
- **Power/speed test grid:** rows × columns of squares (engrave fill or score), labels engraved, speed and power ranges, layer per cell (C00–C29 cycling) with an exportable LightBurn project so each cell has its own settings.
- **Kerf gauge:** comb of fingers + matching slots at kerf offsets (e.g. 0.00 → 0.30 mm in 0.02 steps) engraved with values; the user enters which one fit snugly → saved as the kerf in the material preset.
- **Joint fit test:** finger-joint coupons at several clearances.
- **Living-hinge test card:** the four patterns × three spacings on one card, with radius gauges (circles of R10–R60) to test bending; the user records the tightest that survived → updates hinge recommendations.
- **Focus/ramp test** (diagonal line with distance marks).
- Output also includes a printable instructions panel engraved on the card.

*Backlog (not in v1, but design the registry so they drop in):* phone/tablet stand, coasters + holder, ornaments, signs & plaques with mounting holes, gears, tissue box, bird house, planter, clock faces, tea-light holders, map/topographic layers.

---

## 8. Drawing & editing tools (toolbar)

Grouped like Illustrator (flyouts). Shortcuts in brackets (Illustrator-compatible default set).

**Selection:** Selection [V] · Direct Selection [A] · Group Selection · Lasso [Q] · Magic Wand (same cut layer/size) [Y]

**Pen & paths:** Pen [P] · Curvature [Shift+~] · Add Anchor [+] · Delete Anchor [-] · Anchor Point / Convert [Shift+C] · Pencil (with smoothing) [N] · Smooth tool · Path Eraser · Join tool · Line Segment [\] · Arc · Spiral · Polyline · **Bezier node editing**: smooth/corner/symmetric nodes, break, join, align nodes, fillet single corner by dragging (live corners)

**Shapes:** Rectangle [M] (per-corner radius, chamfer, inverted round) · Rounded Rectangle · Ellipse [L] · Polygon (3–64 sides, inner radius for stars) · Star · **Rounded polygon** · Arc/Pie · Grid/Table · Rounded slot (stadium) · Gear (module/teeth) · Arrow · Speech bubble · Heart · Shape library (basic + laser-friendly icons, public-domain or self-made only)

**Type:** Type [T] (point & area text, OpenType features, kerning/tracking, RTL) · Type on a Path · Vertical Type · Glyph insert

**Modify:** Rotate [R] · Reflect [O] · Scale [S] · Shear · Free Transform [E] · Width/Offset tool · Warp/Envelope (later) · Shape Builder [Shift+M] · Scissors [C] · Knife (cut through shapes) · Eraser [Shift+E] · Blend [W] (steps between shapes) · Contour (Corel-style inner/outer contour steps) · Live Symmetry (mirror while drawing)

**Measure & guides:** Measure [I in Corel set; Shift+I here] · Dimension tool (linear, angular, radius — on a non-output layer) · Guides (drag from rulers, numeric guide dialog) · Eyedropper [I] (copies cut layer & style)

**Navigation:** Hand [H, hold Space] · Zoom [Z, Alt to zoom out] · Rotate View [Shift+H]

**Image:** Place image · Trace Image (threshold, multilevel, centre-line for single-line engraving; use **imagetracerjs (public domain)** or OpenCV.js (Apache-2.0); do **not** bundle GPL potrace) · Crop · Dither preview

**Arrays & repeats:** Grid array · Circular array · Copy along path · Step & repeat · Mirror array

---

## 9. Shortcuts system

1. **Shortcut sets:** *HingeLab (Illustrator-compatible)* default, *CorelDRAW*, *LightBurn*, *Inkscape*. Chosen in the onboarding step and in Edit → Keyboard Shortcuts.
2. **Editor:** searchable list of every command (from the same command registry that drives menus and the palette), conflict detection with "reassign" prompt, per-user custom sets synced to the cloud, export/import set as JSON, printable cheat sheet (Help → Keyboard Shortcuts).
3. **Command palette** (Ctrl+/): fuzzy search over every command, generator, preset, panel, recent project and setting; shows shortcut hints; recently used first.
4. Every menu item, tool tooltip and context-menu entry displays its current shortcut. Tooltips: name + shortcut + one-line description + "Learn more".
5. macOS mapping automatic (Ctrl→⌘, Alt→⌥). Browser-reserved combos (Ctrl+W/T/N in some browsers) fall back gracefully: document why in Help, and the installed PWA/desktop build gets the full set.
6. Single-key tool shortcuts never fire while typing in a field or editing text.

Implementation: one `CommandRegistry` (`id`, label, category, `run(ctx)`, `isEnabled(ctx)`, default bindings per set). Menus, toolbar, palette, context menus and shortcuts are all generated from it.

---

## 10. Reset everywhere

| Scope | How |
|---|---|
| **Single value** | A small ↺ appears beside any field whose value differs from its default (or from the active preset — user preference which). Alt+click on the field label also resets. Right-click a field: *Reset to default · Reset to preset value · Copy value · Paste value · Lock value (excluded from Randomise)*. |
| **Section / panel group** | Section header ⋯ menu → *Reset section*. |
| **Generator** | *Reset generator* button + Edit → Reset ▸ Generator. Option "keep material & sheet". |
| **Selection** | Object → Transform → Reset Bounding Box; *Clear transformations* for live shapes. |
| **Project** | File → Revert to Saved; Edit → Reset ▸ Project to Template (for projects created from a template or generator); Version History restore. |
| **Workspace** | Window → Workspace → Reset {name}. |
| **Preferences** | Preferences → *Restore defaults* per tab and globally. |

All resets are undoable, show a toast "Reset Corner radius to 24 mm · Undo", and confirmation dialogs appear only for project-level resets.

---

## 11. Presets system

1. **Types:** generator presets, material presets, machine profiles, cut-setting libraries, export presets, workspace layouts, shortcut sets, document (sheet) presets.
2. **Sources:** *Built-in* (curated, read-only, duplicable), *Mine* (cloud-synced per user), *Imported* (`.hlpreset` JSON with schema version). Team/shared presets are a later Business-plan feature; keep `owner_type` in the schema now.
3. **Preset picker UI:** searchable dropdown/grid with thumbnails (auto-generated SVG thumbnail of the generator output), favourites ★, "Modified" dot when current values differ from the preset, actions *Update preset · Save as new · Rename · Delete · Export*.
4. **Partial presets:** a preset may store only some fields (e.g. a "Hinge settings for 3 mm birch" preset changes only hinge fields). The UI shows which fields a preset touches.
5. **Material presets** carry: thickness (measured), kerf (from calibration), density/brittleness class → γ for bend analysis, recommended hinge spacing/slit/bridge, cut settings per laser type (starting values), finish notes.
6. **Templates** (`/templates`): full projects (several generators + art + layout) — e.g. "Gift set: hinge box + tag + card", "Wedding name sign", "Café menu cover", "Desk organizer kit".

---

## 12. Projects, naming, saving

- **Every project has a name** (required, default "Untitled {Generator|Design} {n}"); rename inline in the tab, on the start screen, in File → Rename (F2). Names are unique per folder (auto-suffix "(2)").
- **Cloud autosave** 1.5 s after the last change, with status in the status bar: Saved · Saving… · Offline — saved on this device · Conflict (choose: keep mine / keep cloud / save both).
- **Version history:** automatic version every 10 minutes of editing and on every manual Save, named versions ("Before client changes"), restore/duplicate a version. Retention: Free 7 days, Pro 90 days.
- **Local save:** File → Save to Computer writes a `.hingelab` file (ZIP: `document.json`, `assets/`, `thumbnail.png`, `manifest.json` with app & schema versions). File → Open accepts it. Also an **offline cache** in IndexedDB so recent projects open without a connection.
- **Projects page:** folders, tags, search, sort, grid/list, multi-select, move, duplicate, download, delete → **Trash** (restore within 30 days).
- **Document schema** is versioned (`schemaVersion`), with migrations and a test per migration.

### Document model
```ts
Document { id, name, schemaVersion, units, createdAt, updatedAt,
  sheets: Sheet[]                    // artboards = material sheets (size, material, machine, position)
  cutLayers: CutLayer[]              // C00–C29 operations with settings
  root: Group                        // scene tree
  assets: AssetRef[]                 // images, fonts, imported meshes (stored in Supabase Storage)
  generatorInstances (inside tree): { type:"generator", generatorId, version, params, transform, cachedOutputHash }
  guides, grid, snapping, view }
Node types: Group | Path (compound, cubic Béziers) | LiveShape (rect/ellipse/polygon/star/... with params) | Text (runs, font, OpenType features, direction) | Image | GeneratorInstance | Dimension (non-output)
```

---

## 13. Accounts, cloud and database

- **Auth:** Supabase Auth with **Google OAuth** (primary button "Continue with Google") and email magic link. Store avatar and name in `profiles`. Account page: connected providers, sign out of all devices, export all my data (ZIP), delete account (with 7-day grace).
- **Storage:** Supabase Storage buckets `assets` (images, meshes, fonts) and `thumbnails`, private per user (`userId/…` paths, RLS-style policies).
- **Tables** (all with RLS `auth.uid() = user_id`):
  - `profiles` (plan fields from Stripe, preferences JSON, onboarding state, shortcut set id, default units/material/machine)
  - `projects` (id, user_id, folder_id, name, product/generator ids, doc JSONB or storage pointer when > 1 MB, thumbnail_path, schema_version, size_bytes, updated_at, deleted_at)
  - `project_versions` (project_id, created_at, label, doc pointer)
  - `folders`, `tags`, `project_tags`
  - `presets` (user_id, type, generator_id, name, data JSONB, favourite, schema_version)
  - `materials`, `machines` (user-owned; built-ins shipped in code)
  - `assets` (user_id, kind, path, bytes, hash)
  - `usage_events` (for plan limits and product analytics, privacy-safe)
- Quotas enforced server-side (Postgres functions / API routes), never only in the UI.
- Realtime is not needed in v1; leave room for collaboration later (`project_members` table reserved).

---

## 14. Subscription and plans (Stripe)

Prices are **placeholders for the owner to confirm** (`lib/plans.ts`):

| | Free | Pro Monthly | Pro Yearly |
|---|---|---|---|
| Price | $0 | **$12 / month** | **$99 / year** |
| Editor & all drawing tools | ✅ | ✅ | ✅ |
| Generators | Finger-Joint Box, Tray & Organizer, Jigsaw (≤ 50 pcs), Test & Calibration | **All 10** | **All 10** |
| Cloud projects | 5 | Unlimited | Unlimited |
| Storage | 200 MB | 10 GB | 10 GB |
| Version history | 7 days | 90 days | 90 days |
| Export | SVG | SVG, DXF, PDF, PNG, LightBurn | same |
| Pro presets & templates | — | ✅ | ✅ |
| Pro generators | Preview only; export blocked (upgrade sheet) | Full | Full |

- **14-day free trial** of Pro (Stripe trial, card required; reminder email 3 days before end).
- Stripe Checkout, Customer Portal (cancel, switch monthly/yearly, update card, invoices), webhooks (`checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`) update `profiles`. Grace period 7 days on failed payment.
- Locked features show a lock badge; clicking opens an upgrade sheet with what Pro adds — never a dead button.
- Tax: enable Stripe Tax (owner task in `SETUP.md`). Coupons and promo codes supported.
- Business/Team plan: reserved in the schema, not built.

---

## 15. UI / UX design system

**Direction:** a modern professional creative tool — calm, dense, precise, quietly premium (Adobe-grade), not a toy. Dark theme by default, full Light theme, plus "Darker" for dim workshops.

- **Tokens** (CSS variables, one source in `styles/tokens.css`): surfaces (pasteboard, chrome, panel, raised, field), lines, text (primary/secondary/disabled), accent (default blue `#3B8FF0`, user-selectable: blue, violet, teal, orange), semantic (success/warning/danger/info), cut-layer palette C00–C29, focus ring, elevation shadows, radii (2/4/6/10), spacing scale (2/4/6/8/12/16/24/32).
- **Typography:** UI — Source Sans 3 (or Inter Tight); numbers — Source Code Pro with tabular figures; 12–13 px UI base, 11 px labels, uppercase micro-labels with letter-spacing.
- **Icons:** one consistent 1.5 px stroke set (Lucide, MIT) plus custom laser icons drawn to the same grid. Every icon has a tooltip.
- **Motion:** 120–180 ms ease-out for panels/menus, spring for drag/drop, no gratuitous animation; respect `prefers-reduced-motion`.
- **Components** (build a small internal library with Storybook): MenuBar, Menu, ContextMenu, Toolbar + Flyout, IconButton, SegmentedControl, NumberField (math, units, scrub, reset), ColorSwatch, Slider, Select, Combobox, Tabs, Panel/Dock, Dialog, Sheet, Toast, Tooltip, PresetPicker, CommandPalette, ProgressBar, EmptyState, Badge (Pro/Free/New).
- **Onboarding:** first-run 4-step setup (laser type & machine → units → shortcut set → favourite material) and a skippable interactive tour with coach marks; checklist "Make your first cut" (generate → export → test card).
- **Feedback:** inline validation messages say what is wrong and how to fix it; toasts for actions with Undo; pre-flight report before export (open paths, duplicates, tiny parts, parts outside sheets, missing fonts).
- **Accessibility:** WCAG 2.2 AA contrast in both themes, full keyboard operation of menus/panels/dialogs, visible focus, ARIA roles, screen-reader labels for tools.
- **Responsive:** desktop first (≥ 1280 px ideal); tablet (≥ 834 px) with collapsible dock and touch gestures (pinch zoom, two-finger pan); phone = view projects, run generators with simplified panels, export — no full editing.
- **Internationalisation:** UI in English for launch, all strings through `next-intl` so other languages can be added; user content supports any script and RTL.

---

## 16. Import / export

- **Export:** SVG (layered, mm, LightBurn colour mapping, Inkscape layers), DXF (R14, LWPOLYLINE + layers named by cut layer, circles/arcs preserved where possible), PDF (vector, sheets as pages), PNG (preview), **LightBurn `.lbrn2`** (XML with CutSettings per layer and Shapes as Path — implement a tested subset; add an owner check in `SETUP.md`: "open sample.lbrn2 in LightBurn"), ZIP of all sheets. Export dialog with presets (machine-specific colour mapping, stroke width hairline 0.001 in / 0.1 mm, units, which layers, "selection only", "one file per sheet").
- **Import:** SVG (with transforms, units, `viewBox`, CSS styles, text → keep as text when the font is available, else outlines), DXF (lines, polylines, arcs, circles, splines, layers → cut layers), PNG/JPG/WebP (place or trace), fonts (TTF/OTF/WOFF2), 3D meshes for the Parametric generator. PDF/AI import is a later phase.
- Run Clean Up for Laser automatically after import (report, undoable).

---

## 17. Architecture & engineering

- **Rendering & geometry:** **paper.js** (MIT) as the scene/vector engine for the editor (hit testing, Béziers, booleans, selection), rendered to Canvas with a WebGL overlay for heavy previews if needed; **Clipper2** for offsets, kerf, robust booleans on flattened paths; **HarfBuzz + opentype.js** for text; **three.js** for 3D previews; **manifold-3d** for the Parametric generator. Wrap paper.js behind our own `doc` model — paper is the view/engine, the JSON document is the source of truth.
- **Workers:** generators, booleans on large selections, nesting, export, trace, and pre-flight run in Web Workers (comlink).
- **State:** Zustand (or Redux Toolkit) store for the document with an immer-based command pattern → undo/redo, autosave diffing, multi-tab sync.
- **Command registry** (§9) is the single source for menus, shortcuts, palette, toolbar.
- **Generator registry:** `lib/generators/{id}/` each exporting a `GeneratorDef`; the start screen, menus and plan gates read from it.
- **Performance budgets:** first load < 2.5 s on fast 4G for `/home` (code-split the editor and each generator), editor interactive < 4 s, generator rebuild < 300 ms for typical params (Parametric excepted, < 4 s with progress).
- **Observability:** Sentry (errors), PostHog or Plausible (privacy-friendly analytics, opt-out in settings).
- **Security:** RLS on every table, signed URLs for storage, Stripe webhook signature verification, rate limiting on API routes, CSP headers, no `eval` (mathjs only for formulas), uploaded SVGs sanitised (strip scripts/foreignObject/external refs).

---

## 18. Testing & QA

1. **Unit tests** (Vitest) for every geometry module and generator (golden SVG snapshots + invariants listed in §7.0).
2. **Hinge Box golden test** — byte-for-byte, always.
3. **Editor tests:** boolean ops on known shapes (areas within 1e-6), offset distances, kerf direction for outer vs hole, transform math, undo/redo round-trips (apply 200 random commands, undo all → identical document JSON), schema migrations.
4. **Import/export round-trips:** export SVG/DXF → re-import → geometry within 0.01 mm.
5. **End-to-end (Playwright):** guest → generate Hinge Box → export SVG; sign in with Google (mocked provider in CI) → project saved to cloud → reload on a fresh browser context → project opens; rename/duplicate/delete/restore; preset save/apply/reset; shortcut reassign; Free plan gate → upgrade (Stripe test mode with stripe-mock) → feature unlocked; offline edit → reconnect → sync.
6. **Visual regression** of the start screen, editor shell (dark/light), each generator panel (Playwright screenshots, 0.1% threshold).
7. **Accessibility** checks (axe) on all routes.

---

## 19. Execution order (autopilot)

Run in this order. Each phase ends only when its tests pass. Commit after each phase; update `PROGRESS.md`.

| Phase | Scope | Main references |
|---|---|---|
| **S0** | Next.js foundation + Hinge Box port + golden test | `CURSOR_PROMPT.md` Phase 1 |
| **S1** | Design system (tokens, components, Storybook), app shell, routes, **start screen**, New Project/Document dialogs, local project model + `.hingelab` save/open, onboarding skeleton | §2, §3, §12, §15 |
| **S2** | Vector editor core: document model, paper.js view, selection, transforms, shapes, pen/pencil/node editing, text (HarfBuzz), layers & objects, guides/grid/snapping/smart guides, rulers, history, **command registry + menus + shortcuts + command palette**, reset system, preferences | §4, §6, §8, §9, §10 |
| **S3** | Path operations & laser core: pathfinder, offset, contour, arrays, clean-up, cut layers, kerf, tabs, cut order, cut preview, pre-flight, sheets & nesting v1, material/machine library, image place/trace/dither, import SVG/DXF, export SVG/DXF/PDF/PNG/LBRN2 | §5, §16 |
| **S4** | Google sign-in, cloud projects, autosave, offline cache, version history, folders/tags/trash, projects page, presets sync, account page | §12, §13, `CURSOR_PROMPT.md` Phases 2–3 |
| **S5** | Generator framework (contract, registry, live instances, Expand, preset picker) + generators **#1 Hinge Box (as live object), #5 Finger-Joint Box, #6 Tray & Organizer, #10 Test & Calibration, #7 Hinge Pattern Fill** | §7 |
| **S6** | Generators **#2 Hinged Cover, #8 Lamp & Lantern, #9 Jigsaw Puzzle** | §7 |
| **S7** | Generator **#3 Letters** | `CURSOR_LETTERS_PROMPT.md` |
| **S8** | Generator **#4 Parametric Slicer** | `CURSOR_PARAMETRIC_PROMPT.json` |
| **S9** | Stripe subscriptions, trial, plan gates (server-side), billing page, landing page with pricing, templates gallery | §14, `CURSOR_PROMPT.md` Phases 4–5 |
| **S10** | Polish: interactive tour, What's New, help centre with shortcut sheet, performance budgets, accessibility pass, full E2E + visual regression suite green | §15, §17, §18 |

Out of scope for this run: Windows desktop app (Tauri), team plan, real-time collaboration, AI image generation, machine control/G-code streaming. Keep the architecture ready for them.

---

## 20. Acceptance criteria (the product is "done" when)

1. Opening the app shows the start screen with the 10 generators and a Blank canvas option; both paths lead to a working editor in under 5 seconds.
2. A user signs in with Google, creates a named project, closes the browser, signs in on another computer and finds the project with the same content and thumbnail.
3. The same project can be saved to and reopened from a local `.hingelab` file.
4. Every numeric field, every panel section, every generator, the workspace and the project can be reset, and every reset can be undone.
5. Built-in presets exist for every generator, material and machine type; users can save, favourite, rename, export and import their own.
6. All menu items in §6 exist and work (or are visibly disabled with a reason), every one has its shortcut shown, and the command palette finds every command.
7. A Free user can use the editor and the four Free generators; Pro features are gated server-side and unlocked after a Stripe test-mode subscription.
8. Every generator passes its golden and invariant tests; the Hinge Box golden test passes byte-for-byte.
9. Exported SVG and DXF files open correctly in Inkscape; LightBurn import is checked by the owner via `SETUP.md`.
10. Lighthouse ≥ 90 for performance and accessibility on `/` and `/home`; axe reports no critical issues.
