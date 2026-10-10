# Progress

**Next step:** Parametric P6 (the last phase): save parametric projects to Supabase (params in `projects` with product = 'parametric', imported model files and photo depth maps in Storage), plan limits (Free = library shapes and the parallel method with ≤ 30 parts, watermarked exports; Pro = everything), a cut-time estimate from material speed presets, tests, and the "stop_and_show" screenshots of the pricing gates in Stripe test mode. Then the final PROGRESS summary.

Order of the run: main brief Phases 1–5 (Phase 6 Tauri is out of scope) → Letters L2, L4, L5 (L1 and L3 were done earlier) → Parametric P1–P6.

How to check a phase: `npx supabase start` (local stack, see SETUP.md), `npm test`, `npx tsc --noEmit`, `npm run build`. Screenshots: `npm run dev -- -p 3456`, then `node scripts/shots/<phase>.mjs`.

| Phase | Status | Tests |
|---|---|---|
| Main 1 — Port the generator | done (earlier sessions) | 552 / 552 |
| Main 2 — Accounts | done | 561 / 561 |
| Main 3 — Cloud projects | done | 573 / 573 |
| Main 4 — Subscriptions | done (Stripe test mode, no keys yet) | 586 / 586 |
| Main 5 — Landing page | done (not deployed) | 588 / 588 |
| Main 6 — Desktop app | out of scope for this run | |
| Letters L1 — solid | done (earlier sessions) | |
| Letters L2 — stencil | done | 597 / 597 |
| Letters L3 — letter box | done (earlier sessions) | |
| Letters L4 — polish | done | 611 / 611 |
| Letters L5 — plan limits | done | 619 / 619 |
| Parametric P1 — core slicing | done | 632 / 632 |
| Parametric P2 — parallel fins complete | done | 640 / 640 |
| Parametric P3 — stacked + waffle | done | 645 / 645 |
| Parametric P4 — radial + along a curve | done | 652 / 652 |
| Parametric P5 — photo to relief + quality | done | 658 / 658 |
| Parametric P6 | | |

---

## Parametric P5 — Photo to relief + quality

**Built**
- Photo source (Source → Photo): the photo is resized to 518 px on its long side and run through Depth-Anything-V2-Small (Apache-2.0, int8 ONNX, 27 MB) in a browser worker with onnxruntime-web, on WebGPU when available, otherwise WASM (D50). The status line shows the model download and inference; the Source panel shows the photo and its depth map side by side.
- `lib/parametric/source/relief.ts` (D51): depth map → relief solid. A watertight heightfield over a grid (Detail 8–256 cells), flat back on the wall, an automatic subject mask ("Cut away") or the whole rectangle ("Keep"), and controls for width, max depth, base, smoothing, contrast and invert. The relief goes through the same preparation as an imported model, so all five methods can slice it.
- Deviation and fidelity (`lib/parametric/quality.ts`, D52): 2000 seeded surface samples, exact distance to the nearest part solid, max and mean deviation and a fidelity score in Analysis, computed in the slicer worker after each slice. "Deviation" in the 3D view shows the samples as a heat map (blue on a part → red one spacing away) with a legend.
- Slice Inspector polish (D53): previous/next buttons, arrow keys, Home/End, and the part's area, cut length and sheet number.
- The depth map and two previews are kept in IndexedDB, so the photo source survives a reload; a project whose photo is not on this device falls back to the library model with a message.
- Setup: `npm run fetch:depth-model`, optional `NEXT_PUBLIC_DEPTH_MODEL_URL` (SETUP.md, `.env.example`), licences in `public/models/LICENSES.md`.

**Tests:** 658 / 658, including the Hinge Box golden test. New `relief-quality.test.ts` (6 cases): the relief mesh is watertight (manifold, genus 0) for three option sets, and sampling its top surface matches the depth map within one grid step; a ragged mask and the automatic mask stay watertight; depth-map pack/unpack round trip and damaged-file error; photo → parallel fins end-to-end with deviation stats; exact point-to-prism distances, and on a sphere every in-gap sample is within the gap (s − T) with a mean under half a gap, the same on every run. `tsc` clean, `next build` OK.

**Browser run** `scripts/shots/parametric-p5.mjs`: the test portrait (`scripts/shots/fixtures/portrait.jpg`, an AI-generated image, no rights issue) → depth on WASM → 42 fins on 2 sheets in about 4 s; fidelity 94 %; heat map and legend; inspector buttons and keys; max depth change re-slices; the photo source survives a reload. `parametric-p2.mjs`, `parametric-p3.mjs` and `parametric-p4.mjs` still pass.

**Screenshots (stop_and_show: "A portrait photo turned into a fin sculpture")**
- `docs/screenshots/parametric-5-portrait-fins-3d.png` — the portrait as parallel fins on a backboard, with the photo and depth map in the Source panel.
- `docs/screenshots/parametric-5-portrait-fins-exploded.png` — the fins pulled apart.
- `docs/screenshots/parametric-5-deviation-heatmap.png` — the deviation heat map and legend.
- `docs/screenshots/parametric-5-portrait-sheets.png` — the cut sheets.

**Known limitations**
- Depth from one photo is relative and approximate: faces come out softer than from a 3D scan, and hair or dark clothing can read as far away (the back of the hair in the test portrait becomes a few thin fins).
- No hand-painted mask brush (the brief's optional "brush"); "Cut away" and "Keep" only.
- The model file is not in git; deployments load it from Hugging Face unless `NEXT_PUBLIC_DEPTH_MODEL_URL` is set.
- The first photo downloads 27 MB; later photos on the same page reuse the loaded model.

---

## Parametric P4 — Radial + Along a curve

**Built**
- `lib/parametric/methods/radial.ts` (D47): fins as half-planes round an X, Y or Z axis (count, angle range, hub radius), hub rings at one or both ends with a radial slot per fin and an orientation tick, an inner strip and tabs on every fin, FINS_COLLIDE_AT_HUB with the largest fin count and the smallest hub radius that fit.
- Radial-profile formula source `z = f(theta, s)` (`source/formula.ts`): a closed polar solid for slicing, or exact fin outlines drawn straight from the formula ("Fin shape from: Radial formula").
- `lib/parametric/methods/curveNormal.ts` (D48): fins square to an oval or circle, spaced by arc length; length, height and twist as formulas of t, s and L; an outer outline (oval or polar formula) that clips them; a back plate with one slot per tab (widened for twist) and a centre feature (clock insert 30/37/50/60 mm + 0.2 press fit, opening, or mirror); FINS_COLLIDE for fins that touch.
- The "Leaf clock" preset: a 330 × 200 mm pointed-leaf plate, 56 twisting fins round a 120 × 76 oval and a 60 mm clock insert, from formulas only (no 3D file).
- Editor: Radial and Along a curve are live in the Method control. Method panel per method (axis, hub rings, fin source, count, angles, hub radius/width, buttons to fix a crowded hub; guide shape and size, count or auto spacing, the three formulas, outline, back plate, centre feature, clock insert, "Load the leaf clock"); "Radial z = f(θ, s)" in Source. The model is hidden in 3D when it is not used, radial and curve fins explode outward along their length, and the assembly guide draws the curve back plate front-on with every slot named (D49).

**Tests:** 652 / 652, including the Hinge Box golden test. New `radial-curve.test.ts` (7 cases): "cylinder radial" (r 80 × 120 cylinder, 24 fins round Y, 2 hubs: every fin a 60 × 120 rectangle plus strip and tabs, 15° apart, every tab in exactly one slot of each hub), "hub collision" (80 fins at r 20, T 3 → "at most 31 fins"), radial-profile direct vs. sliced (outlines agree within 1 %), "ellipse curveNormal" (120 × 70, 48 fins: square to the ellipse within 0.01°, no footprints closer than T, slots on the footprints within 1e-6 mm, clock hole 60.2 mm), crowded guide reported + the leaf clock (every fin ends on the leaf outline within 2 mm, plate = outline), exports (sheets, guide, ZIP) for both methods, and regression snapshots (cylinder radial, ellipse curve normal). `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p4.mjs`: radial vase 26 parts on 2 sheets, radial-formula sunburst 26 parts on 1 sheet, leaf clock 57 parts on 1 sheet without touching fins, guide saved; `parametric-p2.mjs` and `parametric-p3.mjs` still pass.

**Screenshots:** `parametric-4-leaf-clock-3d.png` (the stop-and-show item), `parametric-4-leaf-clock-exploded.png`, `parametric-4-leaf-clock-sheets.png`, `parametric-4-leaf-clock-guide.png`, `parametric-4-radial-vase-3d.png`, `parametric-4-radial-sunburst-3d.png`.

**Known limitations:** the radial axis is X, Y or Z (turn the model for other directions). Guide curves are ovals and circles only (no SVG path or drawn spline yet). Fin length cannot come from a mesh yet (formulas only). Twisted fins lean past the plate edge near the leaf tips by up to height × sin(twist).

---

## Parametric P3 — Stacked + Waffle

**Built**
- `lib/parametric/methods/stacked.ts` (D43): layers T thick along Y (topographic) or Z (relief from the back); dowel holes through every layer of a chain, with chains split where no common position exists; the outline of the next layer engraved on each layer; optional hollowing with a shell, rings round the dowels and spokes; labels on the hidden area first.
- `lib/parametric/methods/waffle.ts` (D44): two rib families (X × Z standing grid or X × Y wall grid) with half-lap slots split at the middle of every overlap, lap direction choice, the partner id engraved beside every slot, `crossings` in the result.
- Shared pieces moved to `methods/common.ts` (ids, slicing a plane family, clean-up warnings); every method writes its own assembly steps (D46).
- Section clean-up fix (D45): smoothing no longer cuts big corners off long straight edges, and the minimum-feature opening keeps convex corners sharp.
- Editor: Stacked layers and Waffle are live in the Method control; the Method panel shows per-method controls (stack axis, dowels / registration / hollow, dowel count, wall; rib families, lap side, spacing A / B), Joints & Fit shows dowel Ø or lap play as needed, the inspector names layers and ribs, and the 3D planes and explode work for every frame (each family spreads about its own middle).

**Tests:** 645 / 645, including the Hinge Box golden test. New `stacked-waffle.test.ts` (5 cases): "sphere stacked" (r = 100, T = 3: 67 layers, every outline vertex within 0.15 mm of √(100² − h²), one dowel chain, holes concentric through all layers within 1e-6 mm in model space, hole Ø = dowel + play, registration marks present, invariants 1–2), stacked hollow (same parts, under 60 % of the area, invariants hold), "box waffle" (200 × 100 × 150 box, spacing 50: 4 + 3 ribs, 12 crossings, each rib a notched rectangle of area w·h − slots·(T + c)·50, at every crossing the two ribs' material along the crossing line is disjoint and fills the overlap within 1e-6 mm, kerfed slots = T + c − K), square corners survive clean-up, and regression snapshots of the part outlines (sphere parallel, sphere stacked, box waffle). `tsc` clean, `next build` OK. Browser runs: `scripts/shots/parametric-p3.mjs` (mountain stacked out of the wall: 34 parts on 2 sheets, layer L01 with dowels; vase waffle: 18 parts on 2 sheets, guide saved) and `parametric-p2.mjs` again (all checks pass after the clean-up change).

**Screenshots:** `parametric-3-stacked-mountain-3d.png`, `parametric-3-stacked-mountain-sheets.png`, `parametric-3-waffle-vase-3d.png`, `parametric-3-waffle-vase-sheets.png`, `parametric-3-waffle-guide.png`.

**Known limitations:** dowel chains are greedy from the bottom (not globally optimal). Waffle `baseRibs` is not implemented. Small rib pieces that cross nothing are only reported (NO_JOINT), not tied in. Hollowing is never applied to the first and last layer.

---

## Parametric P2 — Parallel fins complete

**Built**
- Tabs and slots (`joints.ts`), the backboard as a plate or a slat board (`backboard.ts`; D35, D36), bridges for floating pieces (D37), stroke-font labels with a wall arrow and the backboard's fin ids (`label.ts`; D38), kerf applied once at the end, bounding-box nesting over several sheets with grain and oversize handling (`nest.ts`; D39), formula sources z = f(x, y) and r = f(h) with a safe expression compiler (`source/formula.ts`; D40).
- Export (`export.ts`; D42): one layered SVG per sheet, the assembly guide (exploded isometric drawing, the backboard at full size with every slot labelled, numbered steps), and a ZIP with all sheets, the guide and the project file.
- The Parametric editor (`components/parametric/ParametricEditor.tsx`, `ParametricDock.tsx`, `ParametricControlBar.tsx`, `Viewport3D.tsx`; D41): Parametric is the third product tab. "3D" tab with model / planes / parts toggles, explode slider and click-to-select; "Sheets" tab with all sheets on the shared canvas (rulers, pan, zoom, layers). Dock: Source (library, 3D file with units and up axis, formula; size and rotation), Method, Material and sheet, Joints & Fit, Quality, Slice Inspector, Analysis (stats and warnings grouped by code with "Show"), Layers & Export. Undo/redo, autosave, open/save project, the imported model kept in IndexedDB, the units prompt for implausible sizes.

**Tests:** 640 / 640, including the Hinge Box golden test. New `fins.test.ts` (8 cases): "formula heightfield" (z = 10·sin(x/20) on 200 × 100 mm, fins along Y follow it within chord tolerance + 0.05 mm), invariant 3 (every tab maps through the placements to exactly one centred slot of nominal size, plate and slats), invariant 4 (parts inside the sheet margins, at least the part gap apart, oversize parts reported), invariant 5 (kerf once: a 100 × 100 plate with a hole and a slot, and the slots in the exported sheet SVG measure T + play − K), invariant 6 (SVG in mm, finite, layer groups in cut order, unique ids; the ZIP holds every file), bridges, formula rejection, grain. The P1 tests now run through tabs, backboard, kerf and nesting too. `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p2.mjs`: head with slats 26 parts on 2 sheets, inspector, ZIP and guide downloads, formula surface 31 parts, a broken formula reported, a model in metres asks for units and scales to 300 mm.

**Screenshots:** `parametric-2-face-slats-3d.png`, `parametric-2-sheets.png`, `parametric-2-assembly-guide.png`.

**Known limitations:** nesting is by bounding box (fins with large empty areas waste material). Engraving is on the visible face; "hidden face" places labels near the wall edge (D38). Parametric projects are guest-only (browser storage) until P6. No transform gizmo in 3D (numbers in the Source panel instead) and no "Lay flat on face" or photo source yet (P5). GLB import still has no automated test.

---

## Parametric P1 — Core slicing

**Built**
- `lib/parametric/`: types and defaults; `source/library.ts` (six procedural shapes, including the abstract head, D28); `source/mesh.ts` (STL/OBJ/GLB parsing with the three loaders, vertex welding at 1e-4 of the diagonal, degenerate-triangle removal, open-edge count, units incl. "auto", Z-up to Y-up, centring (D29), rotation, scale, target size, meshoptimizer simplification over 300k triangles); `slice/planes.ts`, `slice/section.ts` (manifold-3d slicing, plus a fallback triangle–plane stitcher for open meshes), `slice/clean.ts` (union, wall cut in 2D (D30), RDP + Chaikin with the wall points pinned, minimum-feature opening, small islands; D31); `methods/parallel.ts` (fins F01…Fn, short fins and floating pieces reported; D32); `engine.ts` (`loadSource`, `computeParametric` with manifold injected).
- Slicing worker `components/parametric/slicer.worker.ts` with a small client (`slicerProtocol.ts`); manifold-3d is copied to `public/manifold` by `scripts/copy-wasm.js` (renamed from `copy-harfbuzz.js`; D33).
- Hidden debug page `/app/parametric-debug`: three.js view of the model, the planes and the fins extruded to T at their placement; source picker, STL/OBJ/GLB import, axis, spacing, phase, smoothing, scale; the selected plane's section; every fin outline; the warning report.

**Tests:** 632 / 632, including the Hinge Box golden test. New `parallel.test.ts` (6 cases): "sphere parallel" (radius 100, subdivision 6, spacing 10, K 0, smoothing 0: 20 half-disc fins, every vertex on radius √(100² − d²) within 0.15 mm, wall edge exactly at 0), the same with the fallback section method, invariants 1–2 (simple polygons, holes inside outers, exactly one connected component at 10 px/mm) for the sphere and the head, an open mesh reported as NON_MANIFOLD and sliced with the fallback, short fins reported, every library mesh closed and outward. New `mesh.test.ts` (7 cases): binary STL, OBJ, welding, auto units, normalising, open-edge warning, simplification. `tsc` clean, `next build` OK. Browser run `scripts/shots/parametric-p1.mjs`: head 21 fins (manifold, 79 ms), sphere 20 fins at spacing 10 (35 ms), an imported STL box sliced and centred.

**Screenshots:** `parametric-1-head-fins.png`, `parametric-1-head-fin-outlines.png`, `parametric-1-sphere-fins.png`.

**Known limitations:** no backboard, tabs, bridges, labels or sheet layout yet (P2). Only the parallel method; other methods fall back to it with METHOD_NOT_READY. The "ask for units" prompt and GLB import have no UI test yet (D34).


## Letters L5 — Plan limits

**Built**
- Free plan: every Letters mode can be previewed (canvas, 3D, Analysis); export works only for a Letter Box of a single letter, with the "Made with HingeLab" mark. Exporting anything else opens Upgrade to Pro; Solid and Stencil show a lock (D27).
- Enforced on the server: `/api/export` now builds Letters SVGs too (`lib/billing/exportLetters.ts`, `lib/billing/letterFonts.ts`), with HarfBuzz and the bundled fonts on the server, uploaded fonts sent with the request (up to 3 MB, not stored).
- Pricing table row: Letters for Free is "Preview, and one-letter boxes". The font upload note and the privacy page mention that an export sends the uploaded font to build the file.

**Tests:** 619 / 619, including the Hinge Box golden test. New `exportLetters.test.ts` (8 cases: character counting incl. Persian, combining marks and emoji; the Free/Pro rule; Free single-letter export = editor export + mark; Pro export byte-identical to the editor for box, solid, stencil and Persian; 403/422 cases; request parsing; server font loading from `public/fonts` and from a base64 upload, with oversize/empty/not-a-font refused). `tsc` clean, `next build` OK; the export function's trace includes the fonts and the HarfBuzz WASM. Browser run `scripts/shots/letters-l5.mjs` against local Supabase: Free locks, upgrade dialog, server 403 for a word and for Solid, single-letter box download with the mark, then Pro exports the word cleanly and the server builds a stencil. A production `next start` returned the same results.

**Screenshots:** `letters-5-free-preview.png`, `letters-5-upgrade-dialog.png`, `letters-5-free-single-letter.png`.

**Known limitations:** a Free user still sees the full drawing on the canvas (same as D15). Pro users with an uploaded font over 3 MB export in the browser instead of on the server.

## Letters L4 — Polish

**Built**
- Marquee light holes (`lib/letters/marquee.ts`): round bulb holes along each letter's strokes, clear of the walls by the margin, at least the spacing apart, through the lid and lid lip (or the base of an open tray). Settings in the Box panel: hole diameter, spacing, margin (D23).
- Small pieces: "Stack to full height" cuts each flat dot or accent `round(depth / T)` times to glue into a stack (D24). Cut flat / Leave out were already there.
- Wall splitting at the maximum wall length (seams on flats, or a 10 mm glued splice on a curve) was already built in L3; unchanged.
- 3D preview with three.js (`lib/letters/scene3d.ts`, `components/letters/LetterPreview3D.tsx`): plates, walls with the hinge zones tinted green / amber / red, light holes, small pieces; drag to orbit, scroll to zoom, "Lift lid" slider; Solid and Stencil show as flat sheets. Loaded lazily (D25).
- Analysis: tightest radius against the hinge limit per letter, light holes, longest strip, warnings and notes in separate lists (D26).

**Tests:** 611 / 611, including the Hinge Box golden test. New: `marquee.test.ts` (9 cases: holes in lid and lip only, clear of walls and counters by T + margin + r, spacing kept, open tray uses the base, flat panels, turned-off settings change nothing byte-for-byte, warning when no hole fits, stacked dots count and naming) and `scene3d.test.ts` (5 cases: closed box is exactly `depth` tall, open tray T + wall height, lifted lid, zone tinting, light holes in the lid mesh, flat Solid/Stencil). `tsc` clean, `next build` OK. Browser run `scripts/shots/letters-l4.mjs` passes (WebGL canvas present, Analysis reports the holes).

**Screenshots:** `letters-4-box-3d.png`, `letters-4-preview-sam.png`, `letters-4-preview-lid-lifted.png`, `letters-4-preview-marquee.png`, `letters-4-marquee-sheet.png`, `letters-4-analysis.png`, `letters-4-preview-persian.png`.

**Known limitations:** the 3D walls are drawn on the wall centerline without the hinge slits themselves (they are tinted instead), and tabs and slots are not modelled. Marquee holes are not placed around engraved labels; turn Labels off or move them if they overlap.

## Letters L2 — Stencil

**Built**
- Stencil mode in `lib/letters/stencil.ts`: the text is cut out of one sheet (text bounds + margin). Every counter (A, B, O, P, Q, R, 8, Persian ف, ه …) gets 1 or 2 bridges across its thinnest stroke so the centre stays attached (D21). Kerf, label and export work like Solid.
- UI: the Stencil mode button is enabled; the Stencil panel has bridges per centre (One / Two), bridge width and sheet margin. Analysis reports how many bridges hold how many centres, and warns if a centre could not be bridged. The debug page has a Stencil option.

**Tests:** 597 / 597, including the Hinge Box golden test. New test 9 (`stencil.test.ts`, 9 cases): "ABOPQR8" with defaults, two bridges, small size + kerf, welded with negative spacing, and Persian "هشت ۸ ۰ ف"; each sheet is rasterised and flood-filled from the border to prove nothing floats. It also checks the bridge count, the 120° spread, a sheet with no counters ("HI"), and the export paths. `tsc` clean, `next build` OK. Browser run `scripts/shots/letters-l2.mjs` passes.

**Screenshots:** `letters-2-stencil-abopqr8.png`, `letters-2-stencil-two-bridges.png`, `letters-2-stencil-persian.png`, `letters-2-stencil-debug.png`.

**Known limitations:** bridges are straight and placed by a ray search, not by a medial axis, so on very irregular display fonts a bridge can sit a little off the visually thinnest point. Very small counters (under (2 × bridge width)²) are left as plain holes.

## Main 5 — Landing page

**Built**
- `/`: hero with a live mini generator (shape, width, height → 3D box and the real cut sheet on a laser bed, traced once in cut order; D19), How it works (3 steps and the layer colors), a gallery of four engine-built boxes, pricing table from `lib/plans.ts`, FAQ (kerf, materials, LightBurn, account, Pro, cancelling), footer with Terms and Privacy.
- `/terms` and `/privacy`: plain-language drafts matching what the app does (D20).
- SEO: title template, description, canonical URLs, Open Graph and Twitter tags, generated Open Graph image (`app/opengraph-image.tsx`), favicon (`app/icon.svg`), `robots.txt`, `sitemap.xml`. Site URL from `NEXT_PUBLIC_SITE_URL`.
- Not deployed (run rule 5). SETUP.md "Before launch" lists the domain, legal review and preview check.

**Tests:** 588 / 588 (new: gallery boxes build, and the hero generator builds for every shape across the whole slider range — 4 × 23 × 13 combinations). Browser run `scripts/shots/phase5.mjs`: headline, live update after changing shape and height, gallery, pricing, FAQ, SEO tags, OG image renders as PNG, robots and sitemap, no horizontal scroll on a 390 px phone; all passing. `tsc` clean, `next build` OK (landing, terms, privacy, robots, sitemap, OG image all static).

**Screenshots:** `main-5-hero-cutting.png` (laser trace mid-way), `main-5-hero.png`, `main-5-hero-cylinder.png`, `main-5-landing-full.png`, `main-5-landing-mobile.png`, `main-5-terms.png`, `main-5-og-image.png`.

**Known limitations:** the gallery shows engine renders, not photos of real cut boxes; replace or add photos once you have them. The Open Graph image uses the default sans font (no network fetch at build time).

## Main 4 — Subscriptions (Stripe)

**Built**
- `lib/plans.ts`: prices ($9/month, $79/year), Free limits (3 cloud projects, Rounded + Straight), the plan table rows, `hingeLocks`, `planForStatus`, and `addWatermark` (8 mm strip with a "Made with HingeLab" engrave layer, D16).
- Server-side limits (D15): migration `20261010000300_plan_limits.sql` (project count, Pro shapes/patterns, parametric for Free) and `POST /api/export`, which builds the SVG on the server with the caller's plan (403 for Pro features on Free, mark for Free).
- Stripe: `lib/stripe.ts` (refuses live keys unless `STRIPE_ALLOW_LIVE=true`), `POST /api/stripe/checkout` (creates the customer, subscription Checkout), `POST /api/stripe/portal`, `POST /api/stripe/webhook` (signature check, `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed`; logic in `lib/billing/events.ts`, D18).
- Editor: lock icons on Pro shapes and patterns, preview allowed (D14), "Upgrade to Pro" dialog on export, export and Copy SVG through `/api/export` when accounts exist, cloud save status "Not saved — Pro feature".
- Billing page `/app/billing`: current plan, renewal date or payment-failed notice, Free vs Pro cards, Upgrade monthly/yearly, Manage billing, checkout success/cancel notices, "Billing is not set up" state. My boxes shows "N of 3 cloud projects" with an upgrade link.
- `scripts/stripe-setup.mjs` creates the test product and prices (test keys only). SETUP.md has the Stripe checklist and the full Vercel variable list; `.env.example` updated.

**Tests:** 586 / 586 (new: 10 billing unit tests — plan rules, Pro export byte-identical to the engine, Free mark layer and size, Free refusal, webhook events parsed through real signature verification, out-of-order safety, bad signature; 2 integration tests against local Supabase — Free limits in the database and the webhook store upgrading a user; 1 scheduler test for refused saves). Browser run `scripts/shots/phase4.mjs` against a dev server with dummy test values: locks, preview, upgrade dialog, server 403, Free export with mark, 4th project refused, checkout error handled, bad-signature webhook 400, Pro clean export, signed `invoice.payment_failed` → past_due, signed `customer.subscription.deleted` → Free; all passing. `tsc` clean, `next build` OK.

**Screenshots:** `main-4-editor-free-locks.png`, `main-4-upgrade-dialog.png`, `main-4-project-limit.png`, `main-4-billing-free.png`, `main-4-billing-pro.png`, `main-4-editor-pro.png`.

**Known limitations:** a real Checkout and Customer Portal were not run (no Stripe account yet; SETUP.md steps 1–6 take about 10 minutes). Letters is still open to Free until Letters L5. Parametric is refused for Free until P6 defines its free tier.

## Main 3 — Cloud projects

**Built**
- Migration `20261010000200_projects.sql`: `projects` table as in the brief (plus checks on product, name length, params type, thumbnail size), RLS `own projects`, index, `updated_at` trigger (server clock).
- `lib/projects`: product ids and defaults, `.hingelab.json` parsing (old files = Hinge Box), `repo.ts` (list/get/create/save/rename/duplicate/delete through the user's client, so RLS applies), `sync.ts` (newer-copy-wins choice and the 1.5 s `SaveScheduler` with offline retry), `thumbnail.ts`.
- Server actions `app/app/actions.ts` (create, import, duplicate, rename, delete).
- **My boxes** `/app`: grid of cards with thumbnail, name, product, last edited; Open / Duplicate / Rename / Delete; New box, New letters, Open project file….
- Editor `/app/editor/<uuid>` loads the project server-side (404 for other users' ids); Hinge Box and Letters editors autosave to the cloud with status "Saving…" / "Saved to cloud" / "Offline — saved locally" (`hooks/useCloudAutosave.ts`, D10); File → New and Open project create cloud projects (D13); product switch starts a new project (D11). `/app/editor/local` keeps the guest editor with localStorage.
- `engine_version` stored per project (`ENGINE_VERSION = 1`).

**Tests:** 573 / 573 (new: 10 unit tests for sync/scheduler/file parsing/thumbnail with fake timers, 2 integration tests: full project lifecycle and cross-user privacy incl. forged `user_id`). Browser run `scripts/shots/phase3.mjs`: create → edit → saved to cloud → offline → back online → reload → second computer → rename → duplicate → delete, all passing. `tsc` clean, `next build` OK.

**Screenshots:** `main-3-my-boxes-empty.png`, `main-3-editor-saved-to-cloud.png`, `main-3-editor-offline.png`, `main-3-my-boxes.png`, `main-3-my-boxes-duplicated.png`.

**Known limitations:** no realtime merge between two tabs editing the same project at once (last save wins). Uploaded Letters fonts stay on the device they were uploaded on (IndexedDB), so a Letters project that uses one shows the default font elsewhere.

## Main 2 — Accounts (Supabase Auth)

**Built**
- Supabase clients: `lib/supabase/{config,client,server,admin,types}.ts`. Guest mode when the keys are missing (DECISIONS D4).
- `middleware.ts`: refreshes the session cookie and guards `/app/*` (except the guest editor `/app/editor/local` and debug pages, D5). Route rules are pure functions in `lib/auth/routes.ts`; `next` targets are same-site only.
- Pages `/login`, `/signup`, `/reset-password`, `/update-password` in the dark design (`components/auth/AuthForm.tsx`, `app/site.css`); email/password and "Continue with Google"; `/auth/callback` (OAuth code, email confirmation, password recovery) and `/auth/signout` (POST).
- Menubar account menu (avatar → My boxes, Billing, Sign out; "Sign in" for guests).
- Migration `20261010000100_profiles.sql`: `profiles` table, read-only RLS for the owner (D6), sign-up trigger.
- Local Supabase stack config (`supabase/config.toml`, ports 5542x, D7). `.env.example`, SETUP.md.

**Tests:** 561 / 561 (new: 7 route/validation tests, 2 integration tests against the local stack: profile created on sign-up, RLS hides other profiles and blocks self-upgrade). `tsc` clean, `next build` OK.

**Screenshots:** `docs/screenshots/main-2-login-redirect.png`, `main-2-signup-validation.png`, `main-2-editor-account-menu.png`.

**Known limitations:** Google sign-in needs the owner's Google OAuth client (SETUP.md). `/app` and `/app/billing` are placeholders until Phases 3 and 4.

## Main 1 — Port the generator (done before this run)

**Built:** `lib/hinge` (pure geometry engine ported line by line from the prototype), the editor at `/app/editor/local` (menubar, control bar, tool rail, canvas with rulers, panel dock, 3D preview, status bar), undo/redo, localStorage autosave, SVG and project downloads. The home page redirects to the editor until the landing page exists.

**Tests:** 552 / 552 pass, including the 198-case golden test (byte-for-byte) and the 192-case invariant test.

**Known limitations:** none specific to the Hinge Box.
