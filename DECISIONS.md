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
