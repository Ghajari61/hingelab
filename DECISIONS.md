# Decisions log

Decisions taken without the owner during the autopilot run. Each entry: what, why, alternatives.

## Run-wide

### D1. Commit locally, never push during the autopilot run
- **What:** every finished phase is committed on `main` locally. Nothing is pushed.
- **Why:** the GitHub repo `Ghajari61/hingelab` is connected to the Vercel project `hingelab`, so any push to `main` triggers a production deploy. The run rules forbid production deploys.
- **Alternatives:** push to a feature branch (Vercel would still build a public preview URL); disconnect the Vercel git integration (changes the owner's account settings).
- **Owner action:** see SETUP.md, "Publish the work".

### D2. Polygon library: keep `clipper-lib`, not `clipper2-js`
- **What:** all 2D boolean/offset work (Letters and Parametric) uses `clipper-lib` 6.4.2 through `lib/letters/polygon.ts` (1 unit = 0.001 mm).
- **Why:** during Letters L1, `clipper2-js` 1.2.4 `InflatePaths` produced wrong coordinates even for a 10×10 square inset by 1 mm. `clipper-lib` is the mature pure-JS port of Clipper 1 and is synchronous (no WASM init).
- **Alternatives:** `js-angusj-clipper` (WASM Clipper 1, async init, bundling issues in Next.js); patching `clipper2-js`.

### D3. Phase 1 of the main brief was already finished before this run
- **What:** the run starts by re-verifying Phase 1 (tests, type check) instead of rebuilding it.
- **Why:** Phase 1 (Hinge Box port, golden test, editor at `/app/editor/local`) and Letters L1 + L3 were completed and approved in earlier sessions. All 552 tests pass.

## Main brief

### D4. Guest mode when Supabase is not configured
- **What:** without `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` the app runs as today (guest editor, localStorage). Protected pages redirect to `/app/editor/local` and the sign-in pages say accounts are not set up.
- **Why:** the live site has no Supabase keys yet; it must keep working when this code is published before the owner finishes SETUP.md.
- **Alternatives:** hard-fail without keys (breaks the live editor).

### D5. `/app/editor/local` stays public (guest editor)
- **What:** the middleware protects `/app` and `/app/*` except `/app/editor/local` and the hidden debug pages.
- **Why:** the brief says "Protect /app/* … logged-out users go to /login" but also "Keep localStorage autosave for logged-out users" (Phase 1), and the home page sends visitors to the editor. A public guest editor satisfies both. Signed-in users get cloud projects at `/app/editor/<uuid>`.
- **Alternatives:** move the guest editor outside `/app` (breaks existing links to the live editor).

### D6. Profiles are read-only for their owner
- **What:** RLS policy `own profile` is `for select` only. The profile row is created by a `security definer` trigger; plan columns are written only by the Stripe webhook with the service-role key.
- **Why:** the brief's `for all using (auth.uid() = id)` lets any user run `update profiles set plan = 'pro'` from the browser. Covered by `profiles.integration.test.ts`.
- **Alternatives:** column-level grants (more moving parts, same result).

### D7. Local Supabase on ports 55420–55429
- **What:** `supabase/config.toml` uses API 55421, DB 55422, Studio 55423, Mailpit 55424 (instead of 5432x).
- **Why:** another local Supabase project (`pixifinance`) already runs on the default ports on this machine; stopping it would affect other work.

### D8. Integration tests against the local stack, skipped when it is down
- **What:** `*.integration.test.ts` files sign real users into the local Supabase (URL must be `127.0.0.1`/`localhost`, so a hosted project is never touched). When the stack is not running they are skipped, so `npm test` still works offline.
- **Why:** RLS and triggers can only be verified against Postgres.

### D9. Sign-in details
- Password minimum 8 characters (Supabase default is 6). Email confirmation is off in the local stack (instant sign-up); on the hosted project it should be on (SETUP.md).
- `next` redirect targets are restricted to same-site paths (`safeNext`) to prevent open redirects.
- Sign-out is a POST route so link prefetching cannot sign users out.
- The "Continue with Google" button is always shown; if the provider is not enabled the form says "Google sign-in is not set up yet".

### D10. Cloud autosave: local copy first, cloud after 1.5 s, server clock for `updated_at`
- **What:** every edit writes `hingelab-project-<id>` in localStorage (`{params, editedAt, dirty}`) at once; the cloud save runs 1.5 s after the last change (`SaveScheduler`), retries every 30 s and on the `online` event. On open, the local copy wins only if it is `dirty` and edited after the cloud row's `updated_at` (set by a trigger with the server clock).
- **Why:** the brief's "newer copy wins (compare updated_at)" without trusting two client clocks for the cloud side.
- **Alternatives:** version counters (needs conflict UI), realtime sync (out of scope).

### D11. Switching product inside a cloud project starts a new cloud project
- **What:** in `/app/editor/<id>` the product switch (Hinge Box ↔ Letters) creates a new project of the other product and opens it. In the guest editor it switches as before.
- **Why:** each project row has one `product`; changing it in place would lose the other product's settings.

### D12. Thumbnails are shown as `<img src="data:…">`
- **What:** `thumbnail_svg` (outline + inner cuts of the laid-out sheet, coordinates rounded, ≤ 60 kB) is rendered through an image tag, never injected as markup.
- **Why:** the column is user-writable through the API; an `<img>` cannot run script, so a crafted SVG cannot attack the page.

### D13. File → Open project in a cloud project imports the file as a new cloud project
- As the brief says. Old project files without a `product` field are Hinge Box projects.

### D14. Free users can preview Pro shapes and patterns; export and cloud save are what is locked
- **What:** locked options show a lock icon but still switch the design, so the 3D preview and analysis work. Export (and Copy SVG) opens the "Upgrade to Pro" dialog; the cloud save is refused by the database and the status bar says "Not saved — Pro feature" (no retry loop until the next edit).
- **Why:** the plan table gives Free "Generator + preview"; trying a feature is the best argument for buying it. The limits that matter are enforced on the server (D15), so preview cannot leak a file.
- **Alternatives:** block the click entirely (simpler, but users never see what they would buy).

### D15. Where the limits are enforced
- **Projects / shapes / patterns:** a `before insert or update` trigger on `projects` (`20261010000300_plan_limits.sql`) reads the owner's plan. Free: at most 3 projects; a hinge-box row must be `rect` + `straight` (checked when params change, so renaming an old project still works); parametric rows are refused (to be relaxed in Parametric P6). Errors surface as readable messages.
- **Export:** when accounts exist, the editor asks `POST /api/export` for the SVG. The server reads the plan, refuses Pro shapes/patterns for Free (403) and adds the mark. The geometry and the Pro output are byte-identical to `exportSVG` (tested against the golden output).
- **Why:** the brief requires server-side enforcement; client-only locks can be bypassed from DevTools.
- **Limitation:** the Free export is built on the server, but the Free user still sees the full drawing on the canvas, so a determined user could screenshot or rebuild it. That is accepted for a laser-cutting tool.

### D16. The Free mark is a separate engrave layer in an 8 mm strip below the parts
- **What:** `addWatermark` grows the document by 8 mm and adds `<g id="watermark">` (black, C00, engrave) with the text "Made with HingeLab", right-aligned under the parts. Parts and their layers are untouched.
- **Why:** "a small engrave mark" must never cut or overlap a part; an engrave-only layer costs a few seconds of laser time and is easy to see in LightBurn.
- **Alternatives:** text inside a part (could land on a hinge or slot); a cut line (wastes material).

### D17. Without Supabase every feature is open
- **What:** `usePlan()` and `currentPlan()` return Pro when Supabase is not configured (guest mode, D4).
- **Why:** with no accounts there is nothing to buy, and the live site must keep exporting exactly what it does today until the owner sets up accounts and billing.

### D18. Billing details
- **Plan from status:** `active`, `trialing` and `past_due` keep Pro (Stripe retries the card during `past_due`); anything else is Free. `invoice.payment_failed` only sets `plan_status = past_due`.
- **Out-of-order events:** for `customer.subscription.created/updated` the handler re-reads the subscription from Stripe instead of trusting the event snapshot, so a late older event cannot undo a newer change.
- **Webhook errors** return 500 so Stripe retries; bad signatures return 400.
- **Live keys refused:** `getStripe()` throws on `sk_live_…` unless `STRIPE_ALLOW_LIVE=true`; `scripts/stripe-setup.mjs` runs only with test keys.
- **Checkout:** the Stripe customer is created on first checkout and saved with the service-role key; `client_reference_id` links the session to the user. Promotion codes are allowed.
- **Period end:** Stripe API 2026-09-30 moved `current_period_end` to subscription items; the handler reads the latest item end.

### D19. Landing page design: the real output on a laser bed
- **What:** the hero is a live mini generator (shape, width, height) showing the assembled 3D box and the actual cut sheet on a dark honeycomb "laser bed". On first load the lines are traced once in cut order (slots, hinge, outline). The gallery shows four boxes built by the engine (`lib/site/samples.ts`), with a Pro tag on Pro shapes/patterns. Display type is Archivo (wide), body stays Source Sans 3 like the editor.
- **Why:** the brief offers "a live mini version of the generator (or an animated 3D box)"; the generator is the product's most specific thing, and drawing the true LightBurn colors shows exactly what users get. One motion moment only, disabled under reduced motion.
- **Alternatives:** stock photos of boxes (none exist yet; would be invented), a static illustration.

### D20. `/` is the landing page; the guest editor stays at `/app/editor/local`
- **What:** `/` no longer redirects to the editor. Every "Open the editor" button links to `/app/editor/local`. The public pages use normal document scrolling (the editor keeps its fixed shell).
- **Legal pages:** `/terms` and `/privacy` are plain-language drafts that describe what the code actually does (local storage, Supabase, Stripe, Vercel, no tracking). The contact address comes from `NEXT_PUBLIC_CONTACT_EMAIL`; no company details were invented. SETUP.md asks the owner to review them.
- **SEO:** metadata with `metadataBase` from `NEXT_PUBLIC_SITE_URL`, canonical URLs, Open Graph/Twitter tags, a generated OG image (real cut sheet), `icon.svg`, `robots.txt` (private app areas disallowed) and `sitemap.xml`.

## Letters

### D21. Stencil bridges: where they go and what counts as a counter
- **What:** the text is welded into one outline, then each counter (hole) of each letter gets bridges. A bridge runs from a deep point inside the counter (pole of a 24 × 24 grid) along one of 16 rays to the outer edge of the stroke, choosing the shortest crossing that exits into the sheet (not into another counter). With 2 bridges per counter, the second must be at least 120° from the first. Each bridge is a rectangle `bridge width` wide, overshooting 0.3 mm on both ends so it overlaps cleanly.
- **Scrap threshold:** counters smaller than (2 × bridge width)² mm² are treated as scrap and left as holes. Fonts have tiny sliver counters (e.g. at the waist of Fredoka's "8") that cannot hold a bridge and would leave loose pixels.
- **Retry:** after cutting, the sheet must be a single piece. If more pieces remain (a bridge that did not fully sever a slanted stroke), every bridge is lengthened by one bridge width at both ends, up to 4 attempts; anything still loose produces a warning in Analysis instead of failing silently. The test also proves it independently by rasterising and flood-filling the sheet.
- **Bridge width default:** `max(2, material thickness)`, editable in the Stencil panel together with the sheet margin (default 20 mm).
- **Alternatives:** medial-axis bridges (more accurate but heavy for a browser), horizontal-only bridges like classic stencils (fail on rotated or Persian shapes).

### D22. Removed an obsolete test assertion
- **What:** `letters.test.ts` checked that `mode: "stencil"` returns "not available yet". L2 makes stencil available, so that assertion was removed; the test now checks only that empty text returns an error. This is a change of behaviour, not a weakened test: stencil is covered by the new test 9 (`stencil.test.ts`, 9 cases, including a raster flood-fill check that no part of the sheet is floating).

### D23. Marquee light holes follow the strokes
- **What:** hole centres lie in the region where a hole keeps `margin` clear of the wall's inner face (the outer wall face inset by T + margin + hole radius). Walking along that region's edges, a centre is kept when it is at least `spacing` from every kept centre. In a thin stroke the region is a sliver, so the bulbs run down the middle of the stroke; in a fat stroke they follow its outline. Spacing is never less than the hole diameter + 2 mm, so a web is always left between holes.
- **Where:** through the lid (and the lid lip of a removable lid, so light passes); through the base of an open tray. Hole paths run K/2 inside the nominal radius, like every other kerf-compensated cut.
- **Too small:** a letter with no room for a single hole gets a warning naming it.
- **Alternatives:** a hex grid clipped to the letter (misses thin strokes entirely), or a true medial axis (heavier, and the edge walk gives the same result on strokes).

### D24. Small pieces can be cut as stacks
- **What:** "Stack to full height" (off by default) cuts each flat small piece `round(depth / T)` times, named `… · dot k/n`, so the stack can be glued to stand as tall as the box. With "Leave out" it does nothing.
- **Why:** the brief asks for it; off by default because it multiplies the part count.

### D25. three.js preview: built in `lib`, rendered in a lazy client component
- **What:** `lib/letters/scene3d.ts` builds a `THREE.Group` with no renderer: plates by `ExtrudeGeometry` from the real cut shapes (light holes included), walls as T-thick bands along the wall centerlines with vertex colours (wood on flats, wood blended 55% with the bend verdict colour on curves), small pieces stacked on the lid. `LetterPreview3D` renders it with `OrbitControls`, only when something changes (no animation loop), and is loaded with `next/dynamic` so three.js is not in the editor's first bundle. Solid and Stencil show the flat parts T thick. A "Lift lid" slider separates the lid.
- **Not in `lib/letters/index.ts`:** the scene module is imported directly so server code that uses the letters library (export route) never pulls in three.js.
- **Alternatives:** the Hinge Box's hand-drawn SVG projection (cannot draw arbitrary letter shapes with holes), `@react-three/fiber` (a second dependency for one small view).

### D26. Analysis panel polish
- Each letter shows its tightest radius next to the hinge limit and its light-hole count; the box lists the longest strip or panel and the total light holes. Warnings ("To check") and notes are separate lists. Stencil counts are labelled as letter cut-outs and stencil bridges.

### D27. Letters on the Free plan, and where it is enforced
- **Rule:** Free users can use every Letters mode and setting with the live canvas and 3D preview. Export works only for a **Letter Box of one letter** (one visible character after removing spaces, counted as grapheme clusters so "é" or a Persian letter with marks is one), and carries the "Made with HingeLab" mark. Everything else opens "Upgrade to Pro". Solid and Stencil show a lock for Free users.
- **Server:** with accounts, Letters export goes through `POST /api/export` with `product: "letters"`. The server reads the plan, applies the rule (403 otherwise), builds the SVG itself with HarfBuzz and the bundled font from `public/fonts` (traced into the function via `outputFileTracingIncludes`; `harfbuzzjs` is a server-external package), and adds the mark. The output is byte-identical to the editor's own export (tested for Latin, Persian, box, solid and stencil).
- **Uploaded fonts:** the request carries the font as base64 (up to 3 MB, so the request stays under Vercel's 4.5 MB body limit). The server uses it for that one file and does not store it; the font picker note and the privacy page now say so. For a Pro user with a larger font, the editor exports locally (accepted: the same limitation as D15, the client already has the geometry); a Free user gets a message to use a smaller file.
- **Cloud save is not limited** for Letters (unlike Pro Hinge Box shapes, D14): the brief limits only export, and a new Letters project starts as "Sam" in Solid, so refusing saves would stop Free users from opening Letters in the cloud at all. Letters projects still count toward the 3-project limit.
- **Alternatives:** building the file in the browser and only stamping it on the server (bypassable), or refusing uploaded fonts on the server (Pro users would lose their own fonts).

## Parametric

### D28. Parametric P1: library shapes are generated, not downloaded
- **What:** the six library shapes (sphere, torus, wave panel, ripple, vase, and "abstract-head-cc0") are built by code in `lib/parametric/source/library.ts`. The head is a face relief over a 160 x 220 mm oval with a 3 mm flat back: a dome plus smooth bumps for brows, eye sockets, nose, cheeks, lips and chin. `public/library/LICENSES.md` records it as procedurally generated and released under CC0.
- **Why:** no network downloads during the run, no licence risk, tiny bundle, and the meshes are closed by construction.
- **Alternatives:** shipping a CC0 head scan (needs a vetted source and several MB).

### D29. Parametric P1: where each model sits relative to the wall
- **What:** imported meshes and the solid library shapes (sphere, torus, vase) are centred on the origin, as the brief says, so the wall plane z = 0 cuts them in half. The relief library shapes (head, wave panel, ripple) are centred in X and Y only and keep their flat back on z = 0.
- **Why:** the "sphere parallel" test expects half-discs from a centred sphere, while a relief centred in Z would lose half its depth behind the wall.
- **Alternatives:** centring everything (the head would be cut through the cheeks), or pushing everything to z >= 0 (breaks the sphere test).

### D30. Parametric P1: the wall cut is done per section in 2D
- **What:** instead of `trimByPlane` on the 3D solid, each section is intersected with the half-plane w >= 0 in Clipper.
- **Why:** it gives the same result for parallel fins (the section of the trimmed solid equals the trimmed section) and works the same way for the fallback sections of open meshes, which manifold cannot trim.

### D31. Parametric P1: section clean-up details
- **Pinned wall points:** Ramer-Douglas-Peucker and Chaikin keep every point on the wall line (w = 0) fixed and work on the runs between them. Otherwise RDP drops the corner where the profile meets the wall, which tilted the wall edge by up to 0.08 mm.
- **Opening (minimum feature):** erode by minFeature/2, grow back by minFeature/2 + 0.01 mm, then clip to the input, so straight edges come back exactly; Clipper's integer rounding otherwise left the wall edge 0.002 mm off.
- **Union rule:** nonzero for manifold sections (oriented), even-odd for fallback loops.
- **Fallback sections:** segment endpoints are joined on a 1e-4 mm grid; open chains shorter than 1 mm are dropped; longer ones are closed with a straight edge and reported as NON_MANIFOLD_SECTION.
- **Sphere test:** checks every fin vertex higher than minFeature/2 + 0.5 mm above the wall. The opening rounds the two corners where the disc meets the wall with radius minFeature/2, so those few vertices are not on the circle by design. The test also checks area (at least 97 % of the half-disc) and that the wall edge is exactly at 0.

### D32. Parametric P1: parts, short fins and floating pieces
- **Ids:** fins are F01..Fn by plane; a plane whose section has several pieces gives F07-a, F07-b, ... (largest first).
- **Short fins:** pieces lower than `minFinHeight` are left out and reported with a new warning code SHORT_FIN_DROPPED (the brief has no code for this).
- **Floating pieces:** P1 has no bridges (they come in P2), so pieces that do not touch the wall are kept as their own parts and reported with a new code FLOATING_PIECE, rather than misusing BRIDGE_ADDED.
- **Part-local frame:** x along the wall (U), y out of the wall (W); outers are counter-clockwise in that frame, which is our positive orientation. The placement matrix has columns U, W, N, offset x N.

### D33. Parametric P1: loading manifold-3d in the browser
- **What:** `scripts/copy-harfbuzz.js` became `scripts/copy-wasm.js` and also copies `manifold.js` and `manifold.wasm` to `public/manifold` (git-ignored). The slicing worker (`components/parametric/slicer.worker.ts`, a module worker) imports it with `webpackIgnore` and keeps the prepared mesh between runs.
- **Why:** same reason as HarfBuzz: the Emscripten module finds its .wasm next to itself, which webpack would rewrite.

### D34. Parametric P1: simplification and units
- Meshes over 300,000 triangles are simplified with meshoptimizer after normalising, so the reported error is in mm (target error 5 % of the diagonal as the cap; the triangle budget is the real target).
- Units "auto" with a diagonal outside 5-5000 sets `askUnits` in the worker result; the editor will show the one-line prompt in P2. GLB import is wired through `GLTFLoader.parseAsync` but has no automated test (building a GLB in Node needs browser APIs); STL and OBJ are tested.

### D35. Parametric P2: slat backboard
- **What:** "Slats" makes the backboard a plain rectangle (the plate outline's bounding box), and every fin row is extended across the whole board by a strip `slatDepth` mm high (new parameter, default 10 mm), so each row reads as one slat with the model's profile rising out of it. With "Fill the whole board with slats" on, planes outside the model become plain slats S01, S02, ... at the same spacing. `slatWidth` stays in the data model but is always T: slats are cut on edge from the sheet.
- **Why:** the brief names a slat mode but does not define it; this is the usual parametric-wall look and it reuses the fin, tab and slot code unchanged.
- **Alternatives:** separate horizontal slats on the board face (needs a second joint type), or slats as wide boards cut flat (thicker material than the fins).

### D36. Parametric P2: tabs, slots and the backboard
- Tabs are T wide in depth (tab depth defaults to the backboard thickness, which is T, since the board is cut from the same sheet), `tabWidth` long, about every 60 mm along each wall edge: two or more per edge, one when the edge is shorter than 2.5 tab widths, none when even one does not fit. Pieces without a tab get the new warning code NO_TAB and are listed for gluing in the assembly guide.
- Slots are drawn at nominal size (T + slot play) x (tab width + slot play); kerf is applied once, on the cut paths (outline +K/2, inner cuts -K/2), so a slot measures T + play - K after compensation. Tests check this on a 100 x 100 plate and in the exported SVG.
- The plate is the model's footprint on the wall (manifold `trimByPlane` + `project`; a staircase of the fins for open meshes) grown by the margin, plus a 4 mm border round every slot. Several separate footprints are joined by their convex hull so the board stays one part, B1.
- With backboard "None", fins get no tabs and no warning.

### D37. Parametric P2: island bridges
- A piece that does not touch the wall gets a vertical strip (width max(min feature, 4 mm)) from its lowest point straight down to the wall, clipped to the convex hull of the section plus the island's own shadow on the wall. Including the shadow means a section that floats entirely (for example a fin through the brim of a hat) still reaches the wall. Pieces a bridge cannot connect stay FLOATING_PIECE.

### D38. Parametric P2: labels and the engrave layer
- Labels are drawn with a small built-in single-stroke font (0-9, A-Z, "-", "." and space) at 4, 3 or 2.5 mm, whichever fits inside the part, with an arrow pointing to the wall edge. A label that fits at none of the sizes is skipped and counted under the new code LABEL_SKIPPED; the assembly guide still lists every part. The backboard is engraved with each fin id beside its first slot and "B1 TOP" with an arrow.
- Engrave paths go into the shared labels layer (C00, the Hinge Box labels colour) in the SVG, cut after the inner cuts and before the outline. "Score" style uses the same layer for now: the difference is a power setting in LightBurn.
- On the editor canvas engrave paths are drawn through the existing hairline channel of `Canvas` so no new layer type was needed.
- **Hidden face:** engraving is on the face the laser sees. For "auto-hidden-face" the label is placed near the wall edge, where the neighbouring fins hide it; true back-face engraving would need flipping parts on the sheet, which would mirror the outlines for the user.

### D39. Parametric P2: nesting v1
- Bounding-box MaxRects (best short side fit) over as many sheets as needed. Parts may turn 0 or 90 degrees, or to the angle that shrinks their box by more than 10 % (slim diagonal parts); grain "along width" allows only 0, "along height" only 90.
- Parts are packed in id order (so F01-F12 end up together) unless packing by size saves more than 5 % of the material. A part larger than the sheet goes alone on an oversize sheet marked in the SVG comment and on the canvas, with PART_TOO_BIG. More than 40 sheets adds TOO_MANY_SHEETS.
- **Alternatives:** true-shape nesting (better yield on fins with large empty areas); the API takes outlines and returns placements, so it can be swapped in later.

### D40. Parametric P2: formula sources
- Formulas are parsed with mathjs and compiled by walking the parse tree into closures over an allow-list (arithmetic, comparisons, the ternary, and sin ... clamp, noise2/noise3, smoothstep). Assignments, function definitions, property access, strings, matrices and unknown names are rejected with a message for the panel; nothing from mathjs runs when the formula is evaluated.
- A surface z = f(x, y) is sampled on the domain (centred on the origin) and lifted so its lowest point is `base` mm off the wall (default 5 mm), so negative values never cut into the backboard. The lift is reported to the test, which checks the fin tops follow 10 sin(x/20) + lift within chord tolerance + 0.05 mm.
- A turned shape r = f(h) is centred like the solid library shapes (D29).

### D41. Parametric P2: the editor
- Same shell as Hinge Box and Letters: menu bar, control bar (Method: Parallel fins; the other methods are shown as "soon"), tool rail, a centre area with "3D" and "Sheets" tabs, the dock, and the status bar. The "Export" button in the menu bar exports the ZIP; single sheets and the assembly guide are in the File menu and in Layers & Export.
- The worker re-slices 250 ms after the last change and the previous result stays on screen, with a progress strip under the tabs. Clicking a part in 3D, moving the Slice Inspector slider, or "Show" on a warning selects parts: they turn blue in 3D and get a blue outline on the sheets.
- Guest autosave key `hingelab-parametric-v1`. The imported model file is kept in IndexedDB (one model, the last imported); a saved project that points to a model this browser does not have falls back to the library head with a toast.
- Imported models whose size in "auto" units is implausible for millimetres show a one-line "It was made in mm / cm / m / inches" prompt in the Source panel (promised in D34).
- **Cloud projects:** Parametric is not saved to the cloud until P6, so choosing Parametric inside a cloud project opens the guest editor (`/app/editor/local`) with Parametric selected.

### D42. Parametric P2: export files
- One SVG per sheet (`sheet-01.svg` ...), width and height in mm, Inkscape layer groups in cut order slots (C03) then labels (C00) then outline (C02), each respecting the layer's export switch. The ZIP holds every sheet, `assembly-guide.svg` and `project.hingelab.json`; the imported mesh file is not included (it can be large and the user already has it).
- The assembly guide has an exploded isometric line drawing (drawn from the part placements, not a WebGL screenshot, so it also works on the server later), the backboard at full size with the part id in every slot, and numbered steps generated from the result (insertion order and direction, slats, parts to glue, fixing to the wall).

### D43. Parametric P3: stacked layers
- Layers are sections at the centre of every T-thick slab, from the bottom of the model: h_i = min + (i + 1/2)·T, as long as h_i is inside the model. Axis Y gives horizontal layers (a topographic model); axis Z gives layers parallel to the wall (a relief built up from the back). Layer ids L01...; when one layer falls apart into several pieces they are L07-a, L07-b, ... (largest first).
- **Dowels** are placed greedily from the bottom: a chain grows upward while the layers still share room for a dowel (every layer eroded by dowel radius + 2 mm, intersected). When the shared room runs out, the chain is closed and a new one starts (DOWEL_CHAIN_SPLIT). Positions inside a chain are spread as far apart as possible (up to `dowelCount`, at least 2·r + 4 mm apart), so they are concentric through every layer of the chain. Layers with no room at all are reported as NO_DOWEL (new code). Holes are cut at dowel Ø + slot play. Alternatives considered: one global dowel set (fails on any overhang) and a dowel per adjacent pair only (no alignment over the whole stack).
- **Registration marks:** the outline of the layer above is engraved on each layer, clipped 0.5 mm inside the piece (only the part of the next outline that actually lies on this layer).
- **Hollowing** removes only what the layers above and below both cover, offset inwards by the wall thickness `shell`, so no hole ever shows on the outside. A ring (dowel radius + 3 mm) is kept round every dowel and a spoke from each ring to the nearest outline, so no island comes loose. The first and last layer are never hollowed.
- **Labels** go on the covered (hidden) area of a layer first, where the next layer will hide them; then anywhere on the piece.

### D44. Parametric P3: waffle
- Two families of parallel planes along two of X/Y/Z (`familyAxes`, default X and Z: a standing egg-crate). Both families use the same frame rule: W runs along the common line, U = W × N, so a crossing is a vertical line x = const in each rib's own drawing.
- At every crossing the overlap [t0, t1] of the two ribs along the common line is split at its midpoint m. With "A from below", rib A gets a slot from its lower edge up to m and rib B from m to its upper edge (and the reverse for "A from above"). The slot runs 1 mm past the rib's edge so it opens cleanly, and is T + lap play wide. Crossings shorter than 2·T are left unjoined (CROSSING_TOO_SHORT); rib pieces that cross nothing are reported as NO_JOINT (new code).
- The partner's id is engraved beside every slot (rotated along it), and the rib's own id where it still fits. Ids: A01..., B01...; pieces A03-a, A03-b.
- `baseRibs` is kept in the params but not used yet (no extra base frame).

### D45. Parametric P3: section clean-up keeps corners
- Found while checking the stacked mountain: the smoothing step ran Chaikin on the already simplified outline, whose long straight edges let one pass cut 40-50 mm off a rectangle's corners. Edges are now split to at most 2 mm before smoothing, so a pass cuts at most 0.5 mm off a corner and only facet noise is smoothed.
- The minimum-feature opening now uses miter joins instead of round ones, so it no longer rounds every convex corner by half the minimum feature (a box rib is a true rectangle). Thin features are still removed exactly as before.
- Both are tested: a 200 x 150 rectangle survives smoothing 0 / 0.5 / 1 with less than 4 mm² lost, and the box waffle ribs are exact notched rectangles.
- Label search speed-up (same placements): before the sampled "rectangle inside" check, a candidate centre must lie in the intersection of the shape shifted by the label's four corners. Hollowed layers (thin rings) went from about 3.2 s to 0.3 s for a 33-layer sphere, which also removed an intermittent test timeout.

### D46. Parametric P3: methods write their own guide steps; regression snapshots
- Every method returns its assembly steps (`SliceResult.guide`); the guide SVG only adds "Cut all N sheets" in front. The subtitle names the method.
- The brief's "regression" item is covered by file snapshots of the part outlines (rounded to 0.01 mm) for the analytic cases: sphere parallel, sphere stacked, box waffle (`lib/parametric/__tests__/__snapshots__/*.json`). They were first written in P3; they are not a golden for the Hinge Box.

### D47. Parametric P4: radial fins and hubs
- **Axis as a letter.** The brief lists `axisDirection: [x, y, z]`; the params use `axis: "X" | "Y" | "Z"` plus an optional `axisPoint` (null = centre of the model's bounds). Every case in the brief (wall clock, lamp shade) is axis-aligned, and a letter gives a stable frame for each fin: Z → e1 = X, e2 = Y; Y → e1 = X, e2 = −Z; X → e1 = Y, e2 = Z. Fin at angle θ: u = cos θ·e1 + sin θ·e2, w = axis, n = u × axis. An arbitrary direction can be added later by rotating the model instead (Source → Turn).
- **Angles.** A full turn (span ≥ 360°) spaces the fins evenly without repeating the end; a part turn includes both ends.
- **Fins are half-planes.** The section through the axis is clipped to x ≥ innerRadius, so fins θ and θ + 180° are separate parts. Ids R01..., pieces R03-a....
- **Hubs.** With hubs, each fin gets an inner strip hubWidth wide along the hub (so a fin whose model section starts further out still reaches its slots) and a tab T deep into each hub ring. Hub rings (H01 at the low end of the axis, H02 at the high end) are annuli from innerRadius to innerRadius + hubWidth, with one radial slot (T + play wide) per fin and a tick engraved by R01's slot. Pieces that end up without a tab are reported (FLOATING_PIECE).
- **Collisions at the hub.** Neighbouring fins need an arc of at least T + 1 mm at the hub radius: innerRadius × step ≥ T + 1. Otherwise FINS_COLLIDE_AT_HUB with `data {maxCount, minRadius}`, maxCount = floor(span·r / (T + 1)) (+1 for a part turn). The brief's case (T 3, r 20, 360°) gives 31. The Method panel offers both fixes as buttons.
- **Radial-profile formula.** `height = f(theta, s)` with theta in radians round the centre and s = r − r0, for r0 ≤ r ≤ r1 (`domain.x = [r0, r1]`), heights clamped to at least `base`. It is both a closed polar solid on the wall (so every method can slice it) and, with "Fin shape from: Radial formula", an exact fin outline drawn directly without slicing (the model is then not used and is hidden in 3D). If the source is not a radial-profile formula, choosing "Radial formula" switches the source to the default radial profile and the axis to Z. A test checks that the direct and sliced outlines agree within 1 % of the area.

### D48. Parametric P4: fins along a curve
- **Guides.** Ellipse (given as width × height, like every other size in the app) and circle. The brief's "imported SVG path" and "spline drawn in the editor" are not built in this run; the curve code works from an arc-length table, so another closed curve only needs a point-and-normal function.
- **Placement.** Fins are spaced equally by arc length (count, or "auto" from `spacingAtGuide`). Each fin stands on the guide along the analytic outward normal (ry cos φ, rx sin φ); its frame is U = normal, W = Z twisted by τ about U, N = U × W. The test checks the normal within 0.01°.
- **Formulas.** finLength(t), finHeight(t, s, L) and twist(t) are formula strings using t (0..1 round the guide), s (mm along the fin) and L (its length). The outer boundary is none, an ellipse, or a polar formula r(phi) that clips the fins (ray from the guide point along the normal). A formula that gives no number anywhere is an error, not silently skipped.
- **Twist.** A twisted fin meets the plate at an angle, so its slot is widened to (T + play) / cos τ; the guide tells the user to push the fins in at the slot's angle.
- **Collisions.** Neighbouring footprints closer than T + 0.5 mm are trimmed back to where they are far enough apart; if they already touch at the guide they are reported (FINS_COLLIDE with the t range). Fins shorter than max(min feature, tab width + 2) are dropped (SHORT_FIN_DROPPED).
- **Back plate.** The outline is the outer boundary when there is one, otherwise the convex hull of the fins plus `backMargin`. Its slots are stored in fin order, so the guide drawing names each one. Centre feature: clock-insert hole (Ø + 0.2 mm press fit; 30, 37, 50, 60 mm offered), opening (the guide curve), or mirror (the guide shrunk by 3 mm). The plate's local y runs up the wall, so the assembly guide draws it flipped to show the front.
- **Leaf clock preset.** "Load the leaf clock" sets: oval guide 120 × 76, 56 fins, length 200 clipped by a pointed lens outline r(phi) = 1 / ((|cos phi|/165)^1.25 + (|sin phi|/100)^1.25)^0.8 (330 × 200 mm), height 4 + (14 + 10 cos²(2πt))·|sin(πs/L)|^0.7, twist 12 sin(2πt)°, 60 mm clock insert. The first outline tried (a polar peanut) did not read as a leaf. `abs()` in the height keeps the 0.7 power defined where sin(πs/L) rounds to a tiny negative number at s = L.

### D49. Parametric P4: viewer and result
- `SliceResult` now carries `method` and `usesModel`. When the parts come straight from formulas (along a curve, radial formula) the source model is hidden in 3D and its warnings are not shown, and `bounds` are the parts' bounds.
- Explode: radial and along-a-curve fins move outward along their own length; hubs and plates keep the per-family rule. Their plane rectangles in 3D are drawn only round the fin, not across the whole model.
- The Slice Inspector hides the "Plane ... along X" row for these fins (it means nothing for a fin turned round an axis).
- The ellipse test recovers the fin's start point from its outline, which sits on the 0.001 mm Clipper grid, so it slides that point along the fin onto the ellipse and requires the shift to be under 0.001 mm. The slot positions are still checked within 1e-6 mm, from the unrounded tab coordinates.

### D50. Parametric P5: depth model and where it runs
- **Model.** Depth-Anything-V2-Small, the int8 quantized ONNX from onnx-community (27 MB, Apache-2.0). Base and Large are CC-BY-NC, so they are never offered (noted in `public/models/LICENSES.md`). The quantized file was chosen over fp32 (99 MB) for download size; on the test portrait the depth map is clean and the whole photo → fins run takes about 4 s on WASM.
- **Runtime.** onnxruntime-web 1.30 in a module worker (`components/parametric/depth.worker.ts`), loaded from `/ort` with `webpackIgnore` (the same pattern as manifold) because bundling ORT's wasm loader through webpack is fragile. WebGPU when the browser gives an adapter, otherwise WASM (single thread unless the page is cross-origin isolated, which this app is not).
- **Model file.** Not committed (git-ignored, `npm run fetch:depth-model`). The worker tries `NEXT_PUBLIC_DEPTH_MODEL_URL`, then `/models/...`, then Hugging Face, with download progress in the status line. Alternatives: commit it (27 MB in git, rejected) or always load from Hugging Face (rejected: a third-party request for every user, kept only as the fallback).
- **Pre/post-processing** in `lib/parametric/source/relief.ts`, so it is unit-tested: long side 518, both sides multiples of 14, ImageNet mean/std, NCHW; the output (relative inverse depth, larger = nearer) is normalised by its 1st–99th percentiles.
- **Storage.** The photo itself is not kept: IndexedDB stores the packed depth map (a small binary with a magic number) plus two small previews (photo and depth). The project JSON stores only the file name and the relief settings, like an imported 3D file. A project whose photo is not on this device falls back to the library model with a message.

### D51. Parametric P5: relief from the depth map
- **Mesh.** A cell-mask heightfield: a grid over the depth map (8–256 cells on the long side, "Detail"), a top surface over the inside cells, a flat back at z = 0 on the wall, and walls along the mask boundary. It is watertight by construction and goes through the same `prepareMesh` as an imported model, so every method can slice it.
- **Heights.** max(0.5, base + v · max depth), v the processed depth (invert, Gaussian smoothing in depth-map pixels, gamma). The field labels are "Smoothing" and "Contrast" (gamma) because those are the words a maker uses.
- **Subject mask.** "Cut away" keeps cells nearer than the 35th depth percentile, then the largest 4-connected region, with holes filled and single-corner pinches removed in a loop (a pinch would make the surface non-manifold, a hole would make it genus 1). "Keep" uses the whole rectangle. The brief's hand-painted mask brush is not built in this run; the automatic mask plus "Keep" covers portraits and objects on a plain background.
- **Size.** The relief is sized by its width in mm (200 by default) rather than by pixels, so the photo's resolution does not change the sculpture's size.
- **Honesty.** The Source panel says that depth from one photo is an estimate and that a 3D scan or model gives better faces.

### D52. Parametric P5: deviation and fidelity
- **Sampling.** 2000 points spread over the source surface by area, from a seeded generator (mulberry32), so the score is the same on every run. Triangles flat on the wall (the relief's back, a model's cut face) are skipped: no part should cover them. For parallel fins only points in front of the wall (z ≥ 0) count, because the sculpture only shows the front half of the model.
- **Distance.** From each point to the nearest part, each part treated as its real solid (outline extruded to thickness T at its placement), with a cheap lower bound to skip far parts. No BVH library (three-mesh-bvh) was added: parts are planar, so point-to-prism distance is exact and fast enough (the 42-part portrait slices, deviation included, in about 220 ms).
- **Fidelity** = clamp(1 − mean / (2 · spacing), 0, 1), where spacing is the method's own gap: fin spacing for parallel, T for stacked, the average of the two spacings for waffle, the arc gap at the mean radius for radial, the spacing at the guide for along a curve. 100 % means every surface point lies on a part; a mean deviation of one full gap gives 50 %.
- **Heat map.** Coloured points (blue = on a part, red = a full spacing away), drawn in 3D with a legend, toggled by "Deviation". Points rather than a coloured mesh because the samples are the measurement and need no extra geometry.
- Computed in the slicer worker after each slice and only when the parts come from a model (not formula-only methods).

### D53. Parametric P5: Slice Inspector polish
- Previous/next buttons, arrow keys, Home and End step through the parts (the inspector is focusable); the part's material area, its own cut length and its sheet number are listed. The browser scripts for P2 and P3 now read the part label from the new navigation row (`.pe-inspect-nav span`); what they check is unchanged.
