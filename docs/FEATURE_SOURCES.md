# Feature sources (clean-room record)

HingeLab Studio borrows **ideas** — what a feature does for the user — from other vector editors. It never borrows their code, assets or text. This file records where each idea came from, so the clean-room process can be shown later (CURSOR_INKSCAPE_PARITY.md §0.5).

## Rules we follow

1. **Behaviour only.** We read public user documentation (the Inkscape Beginners' Guide at <https://inkscape-manuals.readthedocs.io/>, the keyboard reference at <https://inkscape.org/doc/keys.html>, and the Illustrator / CorelDRAW / LightBurn help pages) to learn *what* a feature does. We do not open, read, copy, port, translate or paraphrase any Inkscape source code, including its extensions and live path effects.
2. **Our own implementation.** Every algorithm is written from the behaviour description, our own maths and permissively licensed libraries (Clipper, HarfBuzz, opentype.js). Where a result has to match a known geometric definition (a fillet radius, a wallpaper symmetry group), we implement the textbook definition, not another program's code.
3. **No assets.** No icons, cursors, UI artwork, palette files, templates, fonts or screenshots from Inkscape. Icons are Lucide (MIT) or drawn by us on a 24 px / 1.5 px grid.
4. **No copyleft dependencies.** `node scripts/licenses.mjs` runs before every web build, every desktop build and in CI (`.github/workflows/licences.yml`), and fails on GPL, LGPL, AGPL, SSPL or unknown licences in npm packages and Rust crates. Bitmap tracing uses our own code or permissive libraries, never potrace (GPL).
5. **Names.** "Inkscape" appears only descriptively — the "Inkscape-style shortcuts" set and statements such as "exports open in Inkscape". Our UI uses our own names (for example "Live Effects", "Fill Bounded Area") with other apps' names only as search keywords.

## Ideas and where we read about them

| Feature in HingeLab | Idea from | Public source we read | Status |
|---|---|---|---|
| Node editing: node types (corner, smooth, symmetric, auto-smooth), insert node, join/break nodes, join with segment, delete segment, straighten / curve segment, show all handles, path direction, transform selected nodes | Inkscape Node tool | [Editing Paths with the Node Tool](https://inkscape-manuals.readthedocs.io/en/latest/editing-paths.html), [Node Tool Options](https://inkscape-manuals.readthedocs.io/en/latest/node-operations.html), [About Node Types](https://inkscape-manuals.readthedocs.io/en/latest/node-types.html) | done (keyboard/palette transforms; no on-canvas node transform handles) |
| Pen modes: Bézier, smooth-through-points (Spiro-like), B-spline, paraxial; brush shapes (triangle in/out, ellipse) as filled outlines | Inkscape Pen tool | [The Pen Tool](https://inkscape-manuals.readthedocs.io/en/latest/pen-tool.html) | done (smooth mode is centripetal Catmull–Rom, not Spiro) |
| Pencil smoothing, pressure width, Bézier / smooth / B-spline output | Inkscape Pencil tool | [The Pencil Tool](https://inkscape-manuals.readthedocs.io/en/latest/pencil-tool.html) | done |
| Calligraphy tool (width, thinning, angle, fixation, caps, tremor, mass) | Inkscape Calligraphy tool | [The Calligraphy Tool](https://inkscape-manuals.readthedocs.io/en/latest/calligraphy-tool.html) | done (filled outline unioned with Clipper; width in mm or % of view; six presets; no "trace background" or hatching mode) |
| Tweak tool (push, shrink/grow, roughen, attract/repel, move/rotate/scale objects) | Inkscape Tweak tool | [The Tweak Tool](https://inkscape-manuals.readthedocs.io/en/latest/tweak-tool.html) | done (nine modes: move, move in/out, jitter, scale, rotate, push, shrink/grow, attract/repel, roughen; no colour modes — colours are cut layers here) |
| Spray tool (copies with scatter, scale, rotation, no-overlap) | Inkscape Spray tool | [Keyboard reference](https://inkscape.org/doc/keys.html) (tool list) | done (copies, clones, single path; seeded; no-overlap with minimum gap) |
| Fill Bounded Area ("paint bucket") | Inkscape Paint Bucket tool | [Keyboard reference](https://inkscape.org/doc/keys.html) (tool list) | done (vector regions from path outlines with gap tolerance and grow/shrink, not a bitmap flood fill) |
| Measure tool: segment lengths of crossed paths, convert to dimension | Inkscape Measure tool | [Keyboard reference](https://inkscape.org/doc/keys.html) (tool list) | done (crossings, lengths between them, crossed path pieces, Convert to Item → dimension on a non-output layer) |
| Eraser modes (delete touched objects / cut away) | Inkscape Eraser tool | [Keyboard reference](https://inkscape.org/doc/keys.html) (tool list) | done |
| Text on path, flow into shape | Inkscape Text tool | [Putting Text on a Path](https://inkscape-manuals.readthedocs.io/en/latest/putting-text-on-path.html), [Flowing Text into a Frame](https://inkscape-manuals.readthedocs.io/en/latest/flowing-text-into-frame.html) | planned |
| Object to Path, Stroke to Path | Inkscape Path menu | [Editing Nodes on a Geometrical Shape](https://inkscape-manuals.readthedocs.io/en/latest/objects-to-paths.html) | done |
| Path operations incl. Cut Path, Split Path, Fracture, Flatten | Inkscape Path menu | [Boolean Operations](https://inkscape-manuals.readthedocs.io/en/latest/boolean-operations.html) | done |
| Inset / Outset by a step, linked and dynamic offset | Inkscape Path menu | [Boolean Operations](https://inkscape-manuals.readthedocs.io/en/latest/boolean-operations.html), [Keyboard reference](https://inkscape.org/doc/keys.html) | done (Inset / Outset by the Preferences step; Dynamic Offset adds a live Offset effect; Linked Offset is a clone with a live Offset effect) |
| Remove Duplicate Nodes, Join Nearby Endpoints | Inkscape Path menu / node editing | [Keyboard reference](https://inkscape.org/doc/keys.html), [Node Tool Options](https://inkscape-manuals.readthedocs.io/en/latest/node-operations.html) | done |
| Clones (unlink, select original, relink) | Inkscape clones | [Cloning Objects](https://inkscape-manuals.readthedocs.io/en/latest/cloning-objects.html) | done (clone of groups and of clones; deleting the original turns its clones into paths) |
| Tiled clones with the 17 wallpaper groups | Inkscape Create Tiled Clones; wallpaper groups are standard crystallography | [Cloning Objects](https://inkscape-manuals.readthedocs.io/en/latest/cloning-objects.html); the 17 plane symmetry groups (P1…P6M) from standard geometry texts | done (shift / scale / rotate per row and column, seeded random, trace from an image; colour and opacity tracing not applicable to laser cut lines) |
| Arrange: grid and polar | Inkscape Arrange dialog | [Align and Distribute](https://inkscape-manuals.readthedocs.io/en/latest/align-and-distribute.html) | done |
| Align relative to first/last/biggest/smallest, remove overlaps, exchange positions | Inkscape Align and Distribute | [Align and Distribute](https://inkscape-manuals.readthedocs.io/en/latest/align-and-distribute.html) | done (also aligns selected path nodes with Direct Selection) |
| Transform dialog (move, scale, rotate, skew, matrix, each separately) | Inkscape Transform dialog | [The Selector Tool](https://inkscape-manuals.readthedocs.io/en/latest/selector-tool.html) | done |
| Paste size, paste in place | Inkscape Edit menu | [Copying and Duplicating Objects](https://inkscape-manuals.readthedocs.io/en/latest/copy-and-duplicate.html) | done (Paste Size ×6, Paste in Place, Paste Style = cut layer + Live Effects) |
| Live Effects stack: Corners, Offset, Pattern Along Path, Bend, Envelope, Roughen, Interpolate, Mirror, Rotate Copies, Hatches, Measure Segments, Taper / Power Stroke, live Boolean | Inkscape Live Path Effects | [Live Path Effects](https://inkscape-manuals.readthedocs.io/en/latest/live-path-effects.html) | done (stack framework, Live Effects panel with on-canvas effect handles, 15 effects; linked objects for Pattern Along Path, Interpolate and Live Boolean sync like clones — limits: Corners rounds sharp straight-to-straight corners only; the Bend guide has two nodes; Interpolate blends along straight lines; Power Stroke handles sit on the first subpath; Measure Segments labels are canvas guides, never exported) |
| Living Hinge live effect | HingeLab's own hinge generators | — (ours) | done (reuses the Hinge Box pattern maths unchanged, cut to the shape less a margin; read-only bend estimate) |
| Trace Bitmap options (brightness, edges, colours, scans, centre-line) | Inkscape Trace Bitmap | [Tracing an Image](https://inkscape-manuals.readthedocs.io/en/latest/tracing-an-image.html) | planned |
| Document Properties, grids (rectangular, axonometric, modular, polar), guides | Inkscape Document Properties | [Managing the Workspace](https://inkscape-manuals.readthedocs.io/en/latest/managing-workspace.html) | planned |
| Snap controls bar | Inkscape snapping | [The User Interface](https://inkscape-manuals.readthedocs.io/en/latest/interface.html) | planned |
| Canvas rotation, flip view, split / outline view, zoom presets and history | Inkscape View menu | [Managing the Workspace](https://inkscape-manuals.readthedocs.io/en/latest/managing-workspace.html), [Keyboard reference](https://inkscape.org/doc/keys.html) | planned |
| Select under (Alt+click), touch select (Alt+drag) | Inkscape Selector tool | [The Selector Tool](https://inkscape-manuals.readthedocs.io/en/latest/selector-tool.html) | planned |
| Cut-layer swatch bar at the bottom | Inkscape palette bar | [The Color Palette](https://inkscape-manuals.readthedocs.io/en/latest/palette.html) | planned |
| Inkscape-style shortcut set (key bindings only, mapped onto our commands) | Inkscape keyboard reference | [Keyboard reference](https://inkscape.org/doc/keys.html), [Customizing Keyboard Shortcuts](https://inkscape-manuals.readthedocs.io/en/latest/custom-keyboard-shortcuts.html) | done (earlier phases), extended with each new command |
| XML/structure inspector (read-only) | Inkscape XML editor | [Keyboard reference](https://inkscape.org/doc/keys.html) | planned |

## Third-party code we ship for these features

| Library | Licence | Used for |
|---|---|---|
| clipper-lib | BSL-1.0 (Boost) | Booleans, offsets, fracture, fill bounded area |
| harfbuzzjs, opentype.js | MIT | Text shaping and outlines |
| lucide-react | ISC | Icons |

Removed: `sharp` (pulled in by Next.js and a manifold-3d helper) is replaced by an empty local stub because its prebuilt libvips binaries are LGPL; HingeLab never called it.
