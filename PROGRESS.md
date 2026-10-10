# Progress

**Next step:** Letters L2 — stencil mode and its test 9, per `CURSOR_LETTERS_PROMPT.md` (then L4, L5, then Parametric P1–P6).

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
| Letters L2 — stencil | | |
| Letters L3 — letter box | done (earlier sessions) | |
| Letters L4 — polish | | |
| Letters L5 — plan limits | | |
| Parametric P1–P6 | | |

---

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
