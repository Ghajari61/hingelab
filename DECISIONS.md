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

## Letters

## Parametric
