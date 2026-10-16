# HingeLab architecture

A short map of how a design goes from settings to a cut file. Decisions and their reasons are in `DECISIONS.md` (D1…); what shipped when is in `PROGRESS.md`.

## Stack

- **Next.js 15 (App Router) + React 19**, TypeScript, plain CSS per area (`components/*/…css`). Deployed on Vercel; Supabase for accounts and cloud projects; Stripe (test mode) for Pro.
- **Geometry** is pure TypeScript in `lib/`, so the same code runs in the browser, on the server (export checks) and in Vitest. Booleans and offsets use `clipper-lib` through `lib/letters/polygon.ts` (`unionShapes`, `differenceShapes`, `intersectShapes`, `offsetShapes`); text is shaped with `harfbuzzjs`; 3D uses `three` and `manifold-3d`.
- **Desktop app** (`desktop/`, Tauri) wraps the same web build and talks to `/api/desktop/*`.
- **Workers** exist for the heavy jobs (`components/studio/editor/trace.worker.ts`, `imaging.worker.ts`, `components/parametric/slicer.worker.ts`, `depth.worker.ts`, `components/generators/levels.worker.ts`, `photo.worker.ts`). Generator builds run on the main thread behind `useDeferredValue`.

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

An `image` field with `trace` (Shadow Box's Your picture) also takes SVG files and traces the picture on the device: `components/generators/levelsClient.ts` scales it and hands it to `levels.worker.ts`, which runs `lib/imaging/levels.ts` (outlines at ten brightness levels, or an SVG's filled shapes). Only the outlines (`picPath` format, whole numbers in a 1000-unit box, at most 400 000 characters) and a small grey preview are kept in the settings; the picture itself is never stored or uploaded. The build reads the outlines synchronously, so the server rebuilds the same layers from settings.

An `image` field with `look` (Shadow Box's Photo) is made from an original kept on the device. `components/generators/photoStore.ts` keeps originals in IndexedDB (`hingelab-photos`, the 12 most recent); the settings hold only the made image (a data URL), the original's id, its file name and the image's pixel size. `usePhotoLooks` (used by `GeneratorDock`) remakes the image in `photo.worker.ts` (`photoPipeline.ts`: decode, `lib/imaging/photoLook.ts`, then JPEG, or a grey PNG from `lib/imaging/png.ts`) whenever a `look.keys` setting is committed, and applies the setting and the new image as one undo step. Centre on the subject uses the browser's FaceDetector where it exists, otherwise the subject on a plain background; Print photo writes a PDF on the device (`lib/imaging/pdf.ts`) from the original at up to 300 dpi. Images marked `only3d` (a print that slides into a slot) are drawn in 3D but left out of the cut file.

Shadow Box's enclosure (`lib/generators/shadowbox/enclosure.ts`) only adds parts and holes around the layer stack, which `build.ts` makes as before: a back board, light box rings and a diffuser (`material: "second"`) go under the stack and push its heights up, finger-jointed walls come from the Boxes generator's `fingerPanel` (`boxes/joints.ts`), and feet are upright parts with a slot. Holes for pins, screws and keyholes, and the scored layer numbers, go only in the band every layer shares (the border, or narrower spacer frames). `drillPart` keeps a hole only if the part stays one piece and loses exactly the hole's area. With every enclosure option off the build is unchanged.

## From settings to sheets (`lib/generators/output.ts`, `lib/fit`)

1. `arrangeGenerator` builds the design (once per batch name), applies kerf once (`cutPart`: the part grows by K/2), mirrors for the job if asked, and packs the parts on sheets: by box (`packBoxes`) or by outline (`lib/fit/outlinePack.ts`, quarter turns), each material on its own sheets, with copies, a calibration strip and part labels.
2. `arrangeFit` (`lib/fit/arrange.ts`) does Fit to sheets (largest scale that fits N sheets) or Auto, and lays the packed sheets out together in one layout (`stackSheets`), with the sheet rectangles for the canvas.
3. `genContent` turns the layout into per-layer SVG path data (outline, inner cuts, score, engrave fills, pictures); `Canvas` draws it and `genSVG` writes the single SVG (one Inkscape layer per operation, engraves first). DXF is converted from that SVG (`lib/export/dxf.ts`).
4. The Export dialog (`components/shell/ExportDialog.tsx`, Ctrl+Shift+E, lazy-loaded in every editor) starts from the SVG the editor exports, so plan rules and the Free watermark carry over to every format. `lib/export/scene.ts` reads it back into layers and items (flattened polylines, text and pictures in document mm); `sheets.ts` assigns items to the sheet rectangles of the layout and rebuilds one SVG per sheet (mirror and hairline wrap or restyle the original markup); `pdfVector.ts` writes a vector PDF (a page per sheet, text as Helvetica, JPEG and PNG pictures) and `lbrn2.ts` a LightBurn project (one cut layer per layer colour, paths only, no power or speed); `bundle.ts` picks the files and zips several. `profiles.ts` holds the export settings (machine, bed, format, options), kept on the device, and checks the sheets against the machine's bed. With no option changed the SVG and DXF are the same files as the quick export.

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

## Information architecture

The public pages for this map are in place: `/generators`, `/generators/[slug]`, collections, graphics, materials, kerf, changelog, developers, about, contact, blog, bookmarks and export history. Community posts stay on the existing gallery. No new database tables.

Research for the grouping is in `docs/RESEARCH_ATOMM.md`. This section is the site map and the nav mockup. No product code ships with it. Later phases stop after each one until they are approved.

### Rules that stay

- Free is preview only. Saving and exporting need Pro (`FREE_PROJECT_LIMIT` is 0, `EXPORT_DENIED` in `lib/plans.ts`). There is no credits balance.
- Geometry stays where it is. Golden SVG tests stay byte-for-byte. A later phase may add a thin catalogue adapter. It does not replace `GeneratorDef`, `lib/hinge`, `lib/letters` or `lib/parametric`.
- The Windows app does not get a Studio sidebar item or a Full editor button back. "Studio" below is the website's saved-work area (`/home`, `/projects`) only.
- Accounts, projects and billing already use Supabase and Stripe. New community tables (public gallery posts, cloud bookmarks, invites) wait for a separate approval. Until then those pages use what is already public, or local data behind a flag.
- UI copy stays English and original. Do not put the researched site's name, or the machine brand that owns it, in the interface.
- Show only real counts (preset totals we generate). No fake usage numbers and no fake testimonials.

### Site map

| Group | Label | Now | Later |
| --- | --- | --- | --- |
| Make | Generators | Product menu and `/#products`. Editors stay `/app/editor/local?p=` | Catalogue page; each generator also gets `/generators/<slug>` with a real FAQ |
| Make | Templates | `/templates` | Same route, linked from the new nav |
| Make | Studio | `/home`, `/projects` | Same routes. Desktop sidebar unchanged |
| Community | Gallery | `/gallery` (sample pieces, not user posts) | User posts only after a backend approval |
| Community | Collections | `/#occasions` on the landing page | Seasonal pages in a later phase |
| Community | Graphics | Studio's own motif set inside editors | A small public page of original SVG only |
| Community | Materials | Thickness and kerf inside each editor | A public reference page |
| Learn | Guides | `/help` | Same |
| Learn | Kerf & fit tools | Test & Calibration starter (`calibration` in `lib/generators/catalog.ts`) | A public entry that opens that starter |
| Learn | Changelog | `PROGRESS.md` (repo only) | A public page |
| Learn | For developers | Nothing | A placeholder. No third-party SDK and no embed until asked |

Search, a notifications placeholder and a feedback control are global chrome for the phase that builds the nav. Footer already has Terms and Privacy (`components/site/SiteFooter.tsx`); About, Contact, Blog and social links are added with that nav, as real pages or honest "not yet" links, not fake content.

Account menu today (`components/auth/UserMenu.tsx`): My designs, Cloud projects, Account, Billing, Sign out, plus a Free/Pro chip. Add Bookmarks, Export history, Invite friends and Preferences only as disabled or local placeholders until each one has real data. Do not add a credits row.

### Nav mockup

Desktop, public pages. The editor keeps File / Edit / View / Help and in-editor product switching. This bar does not replace that.

```
[ Mark HingeLab ]  Make ▾   Community ▾   Learn ▾          Search     [ Free|Pro ]  Account ▾

Make ▾            Community ▾         Learn ▾              Account ▾
  Generators        Gallery             Guides               Profile
  Templates         Collections         Kerf & fit tools     My projects
  Studio            Graphics            Changelog            Bookmarks
                    Materials           For developers       Export history
                                                             Plan
                                                             Invite friends
                                                             Preferences
                                                             Sign out
```

Phone: a button opens a drawer. Account sits at the top and expands. The three groups are stacked. Same labels, our type and our purple, not a copy of another site's drawer.

```
[ Mark ] HingeLab                      [ Search ] [ Menu ]

Drawer
  Account ▾
    Profile
    My projects
    Plan
    Sign out
  Make
    Generators
    Templates
    Studio
  Community
    Gallery
    Collections
    Graphics
    Materials
  Learn
    Guides
    Kerf & fit tools
    Changelog
    For developers
```

### Generators: already here, versus still missing

Already in the product (upgrade later, do not rebuild): Hinge Box, Letters, Parametric, Shadow Box (including picture outlines and a light-box enclosure), Boxes (finger joints, trays, frames, stands), Clock, Puzzle, QR, Cake Topper, Key Holder, Sign, Table Numbers, Trophy, and the calibration starter.

Still missing, and only after this document is approved, in this order:

1. Name and logo tunnel (repeat a mark through layers, with bridges and min-width checks).
2. Layered art from a photo on the device, no model API.
3. A gift box whose lid modes are not already covered by Boxes.
4. Living-hinge box extras that Hinge Box does not already do (lid angle in 3D).
5. Kerf test result written back onto the user's material (the gauge itself exists).

Priority 2 and 3 from the brief (layered ornament, earrings, procedural mandala, dither prep, and the rest) wait until priority 1 is approved one generator at a time. If Boxes, Sign, Clock, Topper or Puzzle already covers the job, the work is an upgrade note, not a second generator.
