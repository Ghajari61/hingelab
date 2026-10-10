# Progress

**Next step:** Parametric P2 (tabs, backboard plate and slats, island bridges, labels, nesting v1, per-sheet export + ZIP, the Parametric editor UI with 3D and Sheets tabs, Parametric in the product tabs), per `CURSOR_PARAMETRIC_PROMPT.json` (then P3–P6).

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
| Parametric P2–P6 | | |

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
