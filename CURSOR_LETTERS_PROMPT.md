# HingeLab — "Letters" Tool Brief for Cursor

Read this together with `CURSOR_PROMPT.md` (the main brief) and `hingelab-prototype.html` (the Hinge Box prototype). **Do not start this tool until Phase 1 of the main brief is finished and all its tests pass.** This tool reuses the hinge engine from `lib/hinge/`.

---

## 1. What we are building

A second product inside HingeLab, enabled in the control-bar product switcher: **Letters**.

The user types a word or name in any language (English, Persian/Farsi, Arabic, any script the font supports), picks a font and a size, and HingeLab produces ready-to-cut SVG files in one of three modes:

| Mode | What it is | Typical product |
|---|---|---|
| **Letter Box** (the main feature) | Hollow 3D letters. A base plate (and optional lid) in the shape of the letter, with a **living-hinge wall strip** that wraps around every outline of the letter. | Letter planters, gift boxes shaped like initials, marquee light-up letters, name boxes |
| **Solid** | Flat cut-out letters (each glyph or the whole word as one piece). | Wall names, cake toppers, signs |
| **Stencil** | Letters cut *out of* a sheet, with automatic bridges so the inner islands (inside A, B, D, O, P, Q, R, 4, 6, 8, 9, ه، ص، ط، ف، ق, etc.) stay attached. | Painting stencils, signs, backlit panels |

All three share the same font engine. Only Letter Box uses the hinge.

The UI language is **English**. The visual design is the same dark "graphics software" shell as the Hinge Box editor (menubar, control bar, tool rail, canvas with rulers, panel dock, status bar).

---

## 2. Libraries (add these)

| Need | Library | Notes |
|---|---|---|
| Read fonts and glyph outlines | **opentype.js** | Glyph paths by glyph ID |
| Text shaping (required for Persian/Arabic and for kerning/ligatures in every script) | **harfbuzzjs** (HarfBuzz compiled to WASM) | Gives the correct contextual glyph forms (initial/medial/final/isolated), ligatures, RTL order and positions. **Never place Persian glyphs one character at a time with opentype.js alone**; the letters would come out disconnected and in isolated forms. |
| Polygon boolean ops and offsets | **clipper2-js** (or `js-angusj-clipper`) | Union, difference, offset with round joins. Work in integer units (1 unit = 0.001 mm). |
| 3D preview for letter boxes | **three.js** (`ExtrudeGeometry`) | Arbitrary letter shapes are too complex for the hand-drawn SVG preview the Hinge Box uses. |

### Fonts
- Bundle only fonts with the **SIL Open Font License** (Google Fonts), in `public/fonts/`. Suggested starter set: rounded and bold faces work best for letter boxes.
  - Latin: **Fredoka** (rounded, best for hinge boxes), **Baloo 2**, **Archivo Black**, **Anton**, **Bebas Neue**, **Pacifico** (script, solid mode)
  - Persian/Arabic: **Vazirmatn** (Black weight), **Lalezar**, **Noto Sans Arabic** (Black), **Noto Naskh Arabic** (Bold)
- Users can also **upload their own .ttf/.otf**. Keep it in the user's storage, never share it, and show a note that they are responsible for the font's license.
- Tag each font with `scripts` it supports and show a warning if the typed text contains characters the font lacks (missing glyph = `.notdef`).

---

## 3. Architecture

```
lib/
  hinge/                # existing — reuse, do not fork
  letters/
    types.ts            # LetterParams, Contour, Zone, LetterModel
    defaults.ts
    fonts.ts            # font registry, loading, glyph coverage check
    shape.ts            # text -> shaped glyph runs (harfbuzz) -> outline polygons (opentype)
    polygon.ts          # flatten, clean, union, offset, orientation, area (Clipper2 wrappers)
    curvature.ts        # arc-length parametrisation, local radius, flat/curve zones
    fillet.ts           # corner rounding to a minimum radius (morphological open/close)
    wall.ts             # contour -> wall strip(s) with tabs, hinge zones, seams
    plates.ts           # base, lid, lid lip, slots, optional marquee light holes
    stencil.ts          # island detection + automatic bridges
    solid.ts            # solid letters, optional dot-welding
    model.ts            # computeLetterModel(params, font) — main entry
    export.ts           # layered SVG (same layer scheme as Hinge Box)
    __tests__/
components/letters/     # LettersEditor, TextPanel, FontPicker, ModePanel, ZoneOverlay, Preview3DLetters
```

Rules:
- `lib/letters` is **pure** (no DOM). Font bytes are passed in as `ArrayBuffer`; harfbuzz WASM is initialised once and injected.
- All geometry in **millimetres**, y pointing down (SVG convention), exactly like `lib/hinge`.
- Hinge cutting, cut styles (slot/line), patterns (straight/wave/relief/serpentine), bend analysis, auto-fit, stretch, kerf and layer colors **come from `lib/hinge`**. Refactor shared pieces out of `lib/hinge/wall.ts` into reusable functions if needed, but **the Hinge Box golden test must still pass byte-for-byte after the refactor.**

---

## 4. Parameters (`LetterParams`)

```ts
{
  text: string;                 // e.g. "Sam", "سام", "A"
  fontId: string;               // bundled id or uploaded font id
  direction: "auto" | "ltr" | "rtl";   // auto = from HarfBuzz script detection
  sizeMode: "capHeight" | "totalHeight";
  size: number;                 // mm, default 150 (letter boxes are big)
  letterSpacing: number;        // mm added between glyph clusters, default 0
  weld: "word" | "letters";     // one shape per word (union) or one shape per glyph cluster
  mode: "box" | "solid" | "stencil";

  // shape cleanup (all modes)
  thicken: number;              // mm outward offset applied to the outline, default 0
  minFeature: number;           // mm; features thinner than this get a warning, default 2*T + 6 in box mode, 2 in others

  // letter box
  depth: number;                // total box height, mm, default 60
  lid: "open" | "fixed" | "removable";
  minCornerRadius: "auto" | number;   // auto = from bend analysis of the chosen hinge pattern × 1.3
  smallIslands: "flat" | "drop";      // islands below islandArea (dots, accents) become flat solid parts or are removed
  islandArea: number;           // mm², default 400
  marquee: { enabled: boolean; holeDia: number; spacing: number; margin: number };  // light-bulb holes in the lid
  wallMaxLength: number;        // mm; strips longer than this are split, default = bed width - 20

  // solid / stencil
  stencilBridge: number;        // bridge width, mm, default max(2, T)
  bridgesPerIsland: 1 | 2;
  weldDots: boolean;            // solid mode: connect dots/accents to the main body with small bridges
  sheetMargin: number;          // stencil mode: border around the text, mm

  // shared with Hinge Box (same names, same meaning)
  material, T, K, cutStyle, slotW, pattern, slit, bridge, pitch, overrun, stretch,
  tabW, slotClr, lidGap, bedW, bedH, gap, labels, layers
}
```

---

## 5. Pipeline (implement exactly in this order)

### 5.1 Text to outline polygons (`shape.ts`, `polygon.ts`)
1. Shape the text with HarfBuzz: get glyph IDs, clusters, advances and offsets, with the right script and direction. Apply `letterSpacing` between clusters (never inside a cluster, or Persian joins break).
2. Get each glyph's path from opentype.js by glyph ID, scaled so that `size` matches the cap height (`sizeMode = capHeight`, use the font's `sCapHeight`, falling back to the height of "H") or the total ink height.
3. **Flatten** curves adaptively with a chordal tolerance of 0.02 mm. Remove duplicate points and points closer than 0.01 mm.
4. Fix orientation with the nonzero fill rule and **union** with Clipper2:
   - `weld = "word"`: union all glyphs of the word into one set of shapes (connected Persian letters and touching Latin letters become one piece).
   - `weld = "letters"`: union per glyph cluster only.
5. Apply `thicken` as a round-join offset.
6. Result: a list of **shapes**, each = one outer contour (counter-clockwise in math terms / clockwise on screen, keep one convention and document it) plus zero or more hole contours.
7. Classify **islands**: any shape whose area is below `islandArea` (Persian dots, the dot of i/j, accents). In box mode they follow `smallIslands`.

### 5.2 Letter Box geometry

**a) Corner rounding (`fillet.ts`).** A hinge cannot bend to a sharp corner. Round every corner to at least `rMinCorner`:
- `rMinCorner = minCornerRadius` if a number, else `bendAnalysis(...).rMin × 1.3 + T/2` from `lib/hinge` for the current pattern and wall height.
- Round convex corners with a morphological **opening**: offset by `−r`, then `+r` (round joins).
- Round concave corners with a **closing**: offset by `+r`, then `−r`.
- Use `r = rMinCorner`. Then recompute holes and islands. If opening deletes a thin part of a letter (a stroke thinner than `2r`), report it as a warning naming the letter: "The serif on ‘E’ is too thin for a hinge wall. Use a bolder font, increase size, or thicken." Never fail silently.

**b) Wall centerlines.** For each outer contour, the wall's outer face is flush with the base plate edge, so its centerline is the contour offset **inward by T/2**. For each hole contour, the wall's outer face is flush with the hole edge (the wall sits in the material around the hole), so its centerline is the hole offset **into the material by T/2** (that is, the hole grows by T/2). Check: after offsetting, every centerline must still be a single simple closed loop; if not, report the stroke as too thin.

**c) Curvature zones (`curvature.ts`).** Parametrise each centerline by arc length `s`. Estimate the local radius at every vertex with a circle through the points at `s − 1.5 mm`, `s`, `s + 1.5 mm`. Classify:
- **flat** where the radius > 400 mm (or the turning over 3 mm is under 0.5°)
- **curve** elsewhere.
Then clean up: merge curve zones separated by flats shorter than `tabW + 6` mm (too short for a tab, so make them hinge too), and extend every curve zone by `overrun` on both sides, clamped to keep 1.5 mm away from tabs. Hinge direction does not matter (the lattice bends both ways), so concave and convex curves are treated the same.

**d) Bend check.** For every curve zone, record its **tightest neutral radius** (the centerline radius). Compare with `bendAnalysis(...).rMin`. Verdict per zone: ok (≥ 1.25 × rMin), tight (≥ rMin), crack (< rMin). The Analysis panel lists the worst zone per letter; the canvas tints zones green / amber / red on the base plate. **Auto-fit** (from `lib/hinge`) runs against the tightest radius of all zones.

**e) Seams and splitting.** Every contour is one wall strip. Put its seam in the middle of its **longest flat zone** (or, if there is no flat zone, at the point of largest radius). If the strip length exceeds `wallMaxLength`, split it at additional seams placed in the middle of other flat zones, longest first; if no flat zone is available, split in the middle of the widest-radius part of a curve zone and add a 10 mm flat "splice" there (no hinge) with a note to glue a backing strip.

**f) Tabs and slots.** Tabs go only on flat zones (using `tabCount` logic from `lib/hinge`, seam zones get an even count). Bottom tabs always; top tabs only with a fixed lid. For each tab at arc length `s`, the plate slot is a rectangle centred on the centerline point at `s`, its long side along the tangent, size `(tabW + slotClr − K) × (T + slotClr − K)`, exactly as in the Hinge Box.

**g) Unroll to strips (`wall.ts`).** A strip's x coordinate equals arc length along the centerline, with curve zones shortened by `stretch` exactly like `lib/hinge` does. Height = wall height between plates (`depth − 2T` with a lid, `depth − T` without). Generate hinge columns over the curve zones with `makeCols`, cut paths with `hingeCutPaths`, and the outline with `wallOutline` (so slot-mode edge notches work the same way). Label each strip with the letter and contour, e.g. `S · outer`, `A · hole 1`, and with seam marks `S1 ▸` / `◂ S1` engraved near both ends so the user knows which ends meet.

**h) Plates (`plates.ts`).**
- **Base:** the filleted letter shape (outer contour + holes), outer offset `+K/2`, holes offset `−K/2`, with all bottom-tab slots.
- **Lid** (fixed): same shape with top-tab slots. **Removable**: lid without slots plus a **lip** plate = shape offset inward by `T + lidGap` (outer contour) and outward by `T + lidGap` around holes. Skip lip parts that vanish and say so.
- **Marquee option:** circular holes of `holeDia` on the lid, placed along the **medial axis** of the stroke (approximate with: offset the shape inward by half the local stroke width, or use Clipper offsets inward in steps until it collapses and take the last valid loop), spaced by `spacing`, at least `margin` from any edge. Holes go on the slots/inner-cuts layer.
- **Small islands** (`smallIslands = "flat"`): output each as a solid part with a note "Glue on top" and a count, cut as many layers as `round(depth / T)` only if the user ticks "stack to full height".

### 5.3 Solid mode
- Each shape = one part, outline on the outline layer, holes on the inner-cuts layer (holes cut first).
- `weldDots`: connect each island to the nearest main shape with a bridge of width `stencilBridge` along the shortest segment between them (Clipper union of the bridge rectangle).

### 5.4 Stencil mode
- One sheet = text bounding box + `sheetMargin`, with the text shapes as holes.
- **Islands** are the letter holes (counters): material that would fall out. For each, add `bridgesPerIsland` bridges: cast rays from the counter's centroid in 16 directions, find the shortest crossing of the letter stroke from the counter boundary to the outer boundary, subtract a rectangle of width `stencilBridge` along that segment from the letter shape (Clipper difference). With 2 bridges, pick the second at least 120° away from the first.
- Persian dots are holes in the sheet (not islands), so they need nothing.

### 5.5 Layout and export
- Use the existing `layoutParts` (shelf packing) for v1; strips first, then plates, then small parts. True nesting is a later feature.
- Export with the same layer scheme as Hinge Box: inner cuts (C03 green) → hinge (C01 blue) → outline (C02 red); labels on C00 black.

---

## 6. UI

Product switcher → **Letters** becomes active. The editor keeps the same shell. Panels:

1. **Text:** a text box (right-to-left aware, `dir="auto"`), font picker with live previews of the typed text, "Upload font…", size (cap height / total height), letter spacing, weld word/letters, direction.
2. **Mode:** Letter Box / Solid / Stencil.
3. **Box** (box mode only): depth, lid type, minimum corner radius (Auto + number), small islands (flat parts / drop), marquee holes, maximum wall length.
4. **Material**, **Hinge Pattern** (with Auto-fit and the close-up inspector), **Joints & Fit**, **Layers**, **Sheet & Layout**: shared with Hinge Box.
5. **Analysis:** per letter, the perimeter, strip count, hinge zone count, tightest radius vs estimated limit, thin-stroke warnings, missing-glyph warnings.

Canvas: shows the laser-bed layout like Hinge Box. A toggle **"Show zones"** draws the filleted letter with green/amber/red hinge zones and the seam positions, which is the best way for the user to understand what will bend where.

3D preview: three.js extrusion of the filleted shape with walls, base and lid (exploded lid slider), with the hinge zones tinted.

---

## 7. Tests (Vitest) — required before the UI

Build `lib/letters` with tests first, then a hidden debug page `/app/letters-debug` that renders intermediate steps (raw outline, filleted outline, centerlines, zones, strips), then the real UI.

Test fixtures: bundle **Fredoka** and **Vazirmatn** in `lib/letters/__tests__/fonts/`.

For each text in `["O", "A", "S", "B", "e", "8", "Sam", "HingeLab", "س", "سام", "ایران", "۱۲۳"]` × mode box × lid `open`/`fixed`/`removable` × cutStyle `slot`/`line`, assert:
1. No exception; every contour produces at least one strip.
2. **Length:** the sum of a contour's strip lengths equals its centerline length, with curve zones divided by `1 + stretch/100`, within 1e-6 mm.
3. **Tabs = slots** per contour, and every slot centre lies on the centerline within 1e-6 mm.
4. **No hinge column within 1.5 mm of a tab** and no tab inside a curve zone.
5. **Fillet works:** sampling the filleted outline, no local radius is below `rMinCorner − 0.05 mm`.
6. **Every strip stays in one piece:** rasterise each strip at 12 px/mm with cuts drawn at their real width (as in the Hinge Box verification) and assert exactly one connected component and no islands larger than 0.05 mm².
7. Plates are simple polygons (no self-intersections); holes lie inside the outer contour.
8. **Persian shaping:** for "سام", HarfBuzz returns contextual (non-isolated) glyph forms, and with `weld = "word"` the result is one main shape plus the dot islands. Text order is right-to-left on the canvas.
9. **Stencil:** for "ABOPQR8", rasterise the sheet and assert that every region of remaining material is connected to the sheet border (zero floating islands).
10. **Solid with weldDots:** "iji" and "بیت" produce exactly one part per word.
11. Export SVG: no `NaN`, mm units, correct layer groups.
12. The Hinge Box golden test from Phase 1 still passes byte-for-byte.

---

## 8. Phases for this tool

- **L1:** fonts + shaping + outlines + solid mode + export (+ tests 1, 8, 10, 11). Stop and show me "Sam" and "سام" as solid letters.
- **L2:** stencil mode with bridges (+ test 9). Stop.
- **L3:** letter box: fillet, centerlines, zones, bend check, strips, plates, tabs/slots (+ tests 2–7, 12). Stop and show me "S" and "ب" as letter boxes with the zone overlay.
- **L4:** marquee holes, small islands, wall splitting, three.js preview, Analysis panel polish.
- **L5:** plan limits: Letters is a **Pro** feature (free users can preview but export only a single-letter box with a watermark).

Start with **L1**. First propose the file-by-file plan for L1 and wait for my "go".
