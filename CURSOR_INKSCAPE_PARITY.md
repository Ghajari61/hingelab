# HingeLab Studio — Inkscape-level editing, in our own style

Reference product (for **features and workflows only**): https://inkscape.org — manual: https://inkscape-manuals.readthedocs.io/ and keyboard reference: https://inkscape.org/doc/keys.html

Goal: the HingeLab Studio editor (see `CURSOR_STUDIO_PROMPT.md` §4–§10) must match Inkscape's useful vector-editing power for laser work, but look and feel 100% like HingeLab (our tokens, components, icons, dark/light themes, panel dock, command registry, presets, reset system). Users who come from Inkscape should feel at home; nobody should think it *is* Inkscape.

---

## 0. Legal rules — non-negotiable (read first)

Inkscape is free software under the **GNU GPL (version 2 or later)**. HingeLab is closed-source and ships a Windows EXE, so any GPL code inside it would force us to publish our whole source. Therefore:

1. **Clean-room only.** Use Inkscape's public website, user manual and keyboard reference to understand *what* a feature does. **Do not open, read, copy, port, translate or paraphrase Inkscape source code** (including its extensions, e.g. its Python extensions and live path effects).
2. **No Inkscape assets:** no icons, cursors, UI artwork, palettes files, templates, fonts or screenshots. Draw our own icons on our 24 px / 1.5 px grid (or use Lucide, MIT).
3. **No GPL/LGPL/AGPL dependencies at all** in the web app or desktop app. Add a CI step (`license-checker` or `license-compliance`) that fails the build on GPL, LGPL, AGPL, SSPL or unknown licences, with an allow-list for MIT, ISC, BSD-2/3, Apache-2.0, MPL-2.0 (file-level only), Unlicense, CC0, Zlib, OFL (fonts).
4. **Trademark:** never use the name or logo "Inkscape" in product UI, marketing or file names, except descriptively for compatibility (e.g. the shortcut set may be labelled "Inkscape-style shortcuts", and docs may say "exports open in Inkscape").
5. Record every borrowed *idea* (feature name + manual link) in `docs/FEATURE_SOURCES.md` so the clean-room process is documented.

---

## 1. Features to add (parity list, adapted to laser work)

Implement with our own code on top of the existing stack (paper.js view, Clipper2, HarfBuzz/opentype.js, our document model and command registry). Every feature gets: a command in the registry (menu + shortcut + palette), our own icon, Properties/Control-bar options, presets where useful, reset buttons on every field, undo support, and tests.

### 1.1 Tools (toolbar additions or upgrades)
| Feature | What it must do |
|---|---|
| **Node editor upgrades** | Node types cusp/smooth/symmetric/auto-smooth; insert node at midpoint; join/break at nodes; join with segment; delete segment; straighten/curve segments; show handles of all nodes toggle; show path outline & direction toggle; snap nodes to nodes/paths/guides/grid; transform a node selection (scale/rotate nodes with handles) |
| **Pen modes** | Regular Bézier, **Spiro** (smooth through points), **B-Spline**, and polyline/paraxial (horizontal/vertical only) modes; shape option for the stroke (none, triangle in/out, ellipse) only as engrave artwork |
| **Pencil** | Smoothing slider, pressure off/on, "LPE spiro/B-spline output" option |
| **Calligraphy tool** | Width, thinning, angle, fixation, caps, tremor, mass; output a filled path for engraving (useful for hand-lettering in any script) |
| **Tweak tool** | Brush that pushes, shrinks/grows, roughens, attracts/repels paths or moves/rotates/scales objects under the cursor (for organic designs) |
| **Spray tool** | Spray copies or clones of the selection with scatter, scale and rotation variation, density; option "no overlap" (important for laser parts) |
| **Paint Bucket (Fill bounded area)** | Click inside any visually closed region formed by multiple overlapping paths → creates a new closed path of that region (gap tolerance, grow/shrink). Very useful to turn line drawings into cut shapes |
| **Measure tool** | Drag to measure length, angle, and segment lengths of every crossed path; "Convert to item" (dimension object on a non-output layer) |
| **Connector tool** | Lines that stay attached to objects (for jig/fixture drawings and assembly guides) — lower priority |
| **Eraser** | Modes: delete objects touched, or cut away from paths (true path eraser) with width |
| **Text tools** | Text on path, flow text into shape, letter-spacing/kerning per glyph with on-canvas handles (Alt+arrows), vertical text, RTL (already via HarfBuzz) |

### 1.2 Path & object operations
| Feature | What it must do |
|---|---|
| **Object to Path / Stroke to Path** | Convert live shapes, text, and strokes to editable filled outlines |
| **Path operations** | Union, Difference, Intersection, Exclusion, Division, Cut Path, Combine, Break Apart, **Split Path** (keeps holes with their outer contour), **Fracture** (split overlapping shapes into all non-overlapping pieces) and **Flatten** (remove hidden overlaps) |
| **Inset / Outset / Linked offset / Dynamic offset** | Fixed-step inset/outset (preference: step in mm), plus a live offset object linked to its source |
| **Simplify** (with threshold), **Reverse**, **Close**, **Remove duplicate nodes**, **Join nearby endpoints** |
| **Clones** | Live clones that follow their original (move/rotate allowed), Unlink clone, Select original, Relink |
| **Tiled clones / symmetry** | Create patterns from one tile with the 17 wallpaper symmetry groups (P1…P6M), rows/columns, per-row/column shift, scale, rotation, randomisation, and "trace" from an underlying image to vary size — this is how users make perforation and Islamic-geometric style patterns |
| **Arrange** | Grid arrange (rows/cols, spacing, alignment in cell) and **Polar/circular arrange** (on circle or ellipse, rotate objects) |
| **Align & Distribute** | Relative to first/last/biggest/smallest/selection/page/sheet, distribute by gaps, **remove overlaps**, align nodes, exchange positions (clockwise/random/stack order) |
| **Transform dialog** | Move (relative/absolute), Scale (% or mm, proportional), Rotate (direction CW/CCW), Skew, Matrix; "Apply to each object separately" |
| **Duplicate & Paste options** | Paste in place, paste size (width/height/both, separately), paste style |

### 1.3 Path Effects (live, non-destructive) — implement as our own "Live Effects" stack
Each effect is a parameter set stored on the object, shown in a **Live Effects panel** (stackable, reorderable, toggle, reset, presets), and baked by **Expand**.
1. **Corners (Fillet/Chamfer)** — per-node or all: fillet, inverse fillet, chamfer, inverse chamfer, radius in mm (laser essential).
2. **Offset** — live offset with join type (round, miter, square) and miter limit.
3. **Pattern Along Path** — repeat or stretch a pattern shape along a spine (borders, frames).
4. **Bend** — bend artwork along a guide path (text and shapes).
5. **Envelope Deformation / Perspective** — 4-side or 4-corner warp.
6. **Roughen / Jitter Nodes** — organic edges with seed.
7. **Interpolate Subpaths** / **Blend** — steps between two paths (contour art).
8. **Mirror Symmetry / Rotate Copies** (kaleidoscope with N copies, fuse paths option) — mandalas and rosettes.
9. **Hatches / Fill with lines** — line fills at angle and spacing, clipped to shape (fast scoring instead of raster engraving).
10. **Measure Segments** — dimension labels on every segment (non-output layer).
11. **Taper Stroke / Power Stroke** — variable-width stroke turned into a fill (engraving art).
12. **Boolean Operation (live)** — keep both operands editable.
13. **Living Hinge** — *our own effect, not in Inkscape*: fills the object with any HingeLab hinge pattern (reuse `lib/hinge` patterns, cut styles, bend analysis). This is the Hinge Pattern Fill generator exposed as a live effect.

### 1.4 Laser-specific extras (beyond Inkscape)
- **Trace Bitmap** parity: brightness cut-off, edge detection, colour quantisation, multiple scans (stacked/separate), centre-line trace for engraving, options for speckle removal, corner smoothing and path optimisation; preview side by side. Use **imagetracerjs (Unlicense)** and/or **OpenCV.js (Apache-2.0)** — never potrace (GPL).
- **Pre-flight** after every path operation can flag new duplicates/open paths.
- **Document Properties**: sheet size presets for common laser beds, display units vs document units, scale, background (wood/acrylic texture preview), guides and grid (rectangular, axonometric, **modular grid**, polar).
- **XML/Structure inspector** (power-user panel): shows our document JSON tree for the selection with editable attributes (read-only in v1).
- **Extensions system (later):** our own sandboxed JS plug-in API (worker-isolated, permission-scoped) — designed now, built later. Do not support Inkscape's Python extensions.

### 1.5 Interface conveniences users expect from Inkscape
- Canvas rotation (Ctrl+scroll / Ctrl+Shift+scroll) and flip view; split view (normal vs outline mode); **outline overlay** mode.
- Zoom presets: 1:1, 1:2, 2:1, fit page/drawing/selection; zoom history (back/forward).
- Snap controls bar with per-target toggles (bounding box edges/corners/midpoints, nodes, path intersections, smooth nodes, centres, rotation centres, text baseline, page/sheet edges, guides, grid) and "simple snapping" vs "advanced" modes.
- Object rotation centre that can be moved; Ctrl-constrained angles with a preference for the snap angle (default 15°).
- Selection cue preferences, "touch selection" (Alt-drag to select by touching), "select under" (Alt+click cycles through stacked objects).
- Swatches for **cut layers** (our C00–C29 palette) docked at the bottom like Inkscape's palette bar; click = assign fill/stroke operation, Shift+click = stroke.
- Commands bar + **Inkscape-style shortcut set** as one of our shortcut sets (only key bindings, mapped onto our commands).

---

## 2. Style rules (make it ours, not a copy)

- Use only HingeLab tokens, typography, spacing, radii and motion from `CURSOR_STUDIO_PROMPT.md` §15. Panels live in our dock with our headers, reset menus and preset pickers.
- Our own icon set: consistent 1.5 px stroke, rounded joins, 24 px grid, filled accent state when active.
- Our own naming where Inkscape's is unclear (e.g. "Fill bounded area" instead of "Paint Bucket" may keep both in search keywords; "Live Effects" instead of "Path Effects"). Command palette search must match both our name and common names from other apps (Inkscape, Illustrator, CorelDRAW) via keyword aliases.
- No layout copying: our control bar, dock and status bar structure stays as specified in the master spec.

---

## 3. Tests

- Unit tests for every geometry operation with exact expectations on simple shapes: booleans (areas within 1e-6 mm²), Fracture (piece count and total area equal the union), Split Path (holes stay with their outer), fillet/chamfer (radius measured on output within 0.01 mm), linked offset (distance within 0.01 mm), tiled clones (positions for each symmetry group on a 3×3 grid), rotate copies (angles exact), fill bounded area (area of a region formed by 4 crossing lines equals the expected rectangle), hatch fill (line count and spacing).
- Undo/redo round-trip for every new command.
- Visual regression of each new panel in dark and light themes.
- CI licence check (rule 0.3) must pass.
- The Hinge Box golden test must still pass byte-for-byte.

---

## 4. Order of work (autopilot, same rules as before)

1. Licence CI check + `docs/FEATURE_SOURCES.md`.
2. Node editor upgrades, pen modes, Object/Stroke to Path, path operations incl. Split Path / Fracture / Flatten.
3. Live Effects framework + Corners, Offset, Living Hinge, Hatches, Rotate Copies, Mirror.
4. Clones + Tiled clones + Arrange (grid/polar) + Align upgrades + Transform dialog.
5. Fill bounded area, Measure tool, Eraser modes, Calligraphy, Tweak, Spray.
6. Remaining Live Effects (Pattern Along Path, Bend, Envelope, Roughen, Interpolate, Taper/Power Stroke, Measure Segments, live Boolean).
7. Trace Bitmap parity, Document Properties, snapping bar, canvas rotation/split view, Inkscape-style shortcut set.
8. Update `PROGRESS.md`, commit after each step, never deploy to production or touch the production database without my explicit approval.
