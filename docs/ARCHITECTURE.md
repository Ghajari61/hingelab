# HingeLab architecture

A short map of how a design goes from settings to a cut file. Decisions and their reasons are in `DECISIONS.md` (D1…); what shipped when is in `PROGRESS.md`.

## Stack

- **Next.js 15 (App Router) + React 19**, TypeScript, plain CSS per area (`components/*/…css`). Deployed on Vercel; Supabase for accounts and cloud projects; Stripe (test mode) for Pro.
- **Geometry** is pure TypeScript in `lib/`, so the same code runs in the browser, on the server (export checks) and in Vitest. Booleans and offsets use `clipper-lib` through `lib/letters/polygon.ts` (`unionShapes`, `differenceShapes`, `intersectShapes`, `offsetShapes`); text is shaped with `harfbuzzjs`; 3D uses `three` and `manifold-3d`.
- **Desktop app** (`desktop/`, Tauri) wraps the same web build and talks to `/api/desktop/*`.
- **Workers** exist for the heavy jobs (`components/studio/editor/trace.worker.ts`, `imaging.worker.ts`, `components/parametric/slicer.worker.ts`, `depth.worker.ts`). Generator builds run on the main thread behind `useDeferredValue`.

## Products

| Product | Editor | Model |
| --- | --- | --- |
| Hinge Box | `components/editor/EditorApp.tsx` | `lib/hinge` (golden SVG test in `golden-svgs.json`: byte-for-byte) |
| Letters | `components/letters/LettersEditor.tsx` | `lib/letters` |
| Parametric | `components/parametric/ParametricEditor.tsx` | `lib/parametric` (slicing in a worker) |
| Generators (Shadow Box, Boxes, Clock, Sign, Puzzle, QR, Topper, Trophy, Key rack, Table numbers) | `components/generators/GeneratorEditor.tsx` | `lib/generators/<id>` |
| Studio (vector editor) | `components/studio/editor` | `lib/studio` (zustand + immer) |

## The generator contract (`lib/generators/types.ts`)

A generator is data plus pure functions (`GeneratorDef<P>`):

- `defaults()`, `merge(raw)` (fills and cleans any stored or partial value), optional `migrate`.
- `sections`: the fields (`number`, `choice`, `toggle`, `text`, `font`, `image`) with dot-path keys, ranges, `show(p)` and one-sentence help. The shell renders them: choices with `rail: true` become picture cards in the left rail (`GalleryRail`), everything else goes into the right dock (`GeneratorDock`). The same list drives the server's range check (`lib/generators/sanitize.ts`), the help centre (`lib/help/generators.ts`), the desktop catalogue (`lib/desktop/products.ts`) and the AI designer's menu (`lib/ai/menu.ts`).
- `presets`: only what differs from the defaults; thumbnails are generated into `public/presets/<id>/` (`scripts/build-preset-thumbs.mjs`), rail pictures into `public/rail/` (`scripts/build-rail-art.mjs`, with `railPreview` for simpler card settings).
- `build(p, ctx)` → `GenOutput`: flat parts in mm, y down (`outer`, `holes`, open `cuts`, `score`, filled `engrave`, raster `images`), each with a `place` for 3D; stats, assembly steps, notices.
- `check(p, out)` → issues with one-click fixes (`lib/issues`); the shell adds sheet checks.
- Optional `fonts`, `batch` (names list), `scale` (Fit to sheets), `art` (rail line art), `pro`.

Adding a field to a generator is enough for it to appear in the dock, undo/redo, autosave, saved projects, the server check and help.

## From settings to sheets (`lib/generators/output.ts`, `lib/fit`)

1. `arrangeGenerator` builds the design (once per batch name), applies kerf once (`cutPart`: the part grows by K/2), mirrors for the job if asked, and packs the parts on sheets: by box (`packBoxes`) or by outline (`lib/fit/outlinePack.ts`, quarter turns), each material on its own sheets, with copies, a calibration strip and part labels.
2. `arrangeFit` (`lib/fit/arrange.ts`) does Fit to sheets (largest scale that fits N sheets) or Auto, and lays the packed sheets out together in one layout (`stackSheets`), with the sheet rectangles for the canvas.
3. `genContent` turns the layout into per-layer SVG path data (outline, inner cuts, score, engrave fills, pictures); `Canvas` draws it and `genSVG` writes the single SVG (one Inkscape layer per operation, engraves first). DXF is converted from that SVG (`lib/export/dxf.ts`).

## 3D

`lib/generators/scene3d.ts` turns `GenOutput.parts` into slabs where `place` puts them (explode lifts each level), with engraving as a dark skin and pictures as textured skins. `lib/three/QuadView.tsx` renders Top/Front/Left/Perspective on demand (no render loop), with looks (`lib/three/looks.ts`), shading, measuring and a lay-flat view from the sheet layout (`lib/three/flat.ts`).

## State, history and saving

- `hooks/useHistory.ts`: params with undo/redo (`replace(next, record)`); live slider moves are not recorded until commit.
- `hooks/useAutosave.ts`: debounced localStorage per product (guests); `hooks/useCloudAutosave.ts`: Supabase projects (signed in). Saved projects are `{ app, product, version, params }` JSON (`.hingelab.json`).
- `useDeferredValue` keeps typing and sliders responsive while the build catches up.
- Links: `?p=<product>&preset=<id>` opens a built-in preset; there is no share link that carries all settings yet.

## Safety rules that shape the code

- No secrets in client code; AI and billing calls go through `app/api/*` routes.
- Every server export re-runs `merge` and `sanitizeGeneratorParams`; pictures must be image data URLs (`lib/security/svg.ts`).
- Size budgets per chunk (`scripts/perf/budgets.mjs`): the editor shell is near its 150 kB limit, so new shell code must stay small and product code goes in product chunks.
- Licences are checked (`scripts/licenses.mjs`); only permissive dependencies.
