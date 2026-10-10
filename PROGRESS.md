# Progress

**Next step:** Main brief Phase 3 — Cloud projects (projects table, My boxes page, cloud autosave).

Order of the run: main brief Phases 1–5 (Phase 6 Tauri is out of scope) → Letters L2, L4, L5 (L1 and L3 were done earlier) → Parametric P1–P6.

How to check a phase: `npx supabase start` (local stack, see SETUP.md), `npm test`, `npx tsc --noEmit`, `npm run build`. Screenshots: `npm run dev -- -p 3456`, then `node scripts/shots/<phase>.mjs`.

| Phase | Status | Tests |
|---|---|---|
| Main 1 — Port the generator | done (earlier sessions) | 552 / 552 |
| Main 2 — Accounts | done | 561 / 561 |
| Main 3 — Cloud projects | next | |
| Main 4 — Subscriptions | | |
| Main 5 — Landing page | | |
| Main 6 — Desktop app | out of scope for this run | |
| Letters L1 — solid | done (earlier sessions) | |
| Letters L2 — stencil | | |
| Letters L3 — letter box | done (earlier sessions) | |
| Letters L4 — polish | | |
| Letters L5 — plan limits | | |
| Parametric P1–P6 | | |

---

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
