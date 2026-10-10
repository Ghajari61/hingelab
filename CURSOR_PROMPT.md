# HingeLab — Build Brief for Cursor

You are building **HingeLab**, a subscription web app for laser-cutter owners (hobbyists and small businesses, worldwide, English UI). It generates ready-to-cut SVG files for **living-hinge boxes**: wooden boxes whose walls bend around rounded corners thanks to a field of laser-cut slits.

A complete, working single-file prototype is attached as `hingelab-prototype.html`. It contains the full geometry engine, the UI design, the 3D preview and the SVG exporter. **Your job is to turn this prototype into a production app** with accounts, cloud-saved projects and paid subscriptions, without changing what the generator outputs.

Work in the phases below, in order. Finish and verify each phase before starting the next. After each phase, stop and summarize what you did and what I need to do (accounts to create, keys to paste, etc.).

---

## 0. Ground rules

1. **The geometry is already correct and tested. Do not rewrite or "improve" the math.** Port it line by line into TypeScript and keep every formula, default and edge case. If something looks wrong, ask me before changing it.
2. The UI language is **English only**. Keep the copy from the prototype.
3. Keep the visual design of the prototype: dark, professional "graphics software" look (inspired by Adobe apps), with a menubar, control bar, tool rail, a canvas with rulers, a right-hand panel dock and a status bar. Same colors, same fonts (Source Sans 3 + Source Code Pro), same layout.
4. Never put secret keys in client code. Use environment variables and server-side routes.
5. Write clean, typed, commented code. Prefer small modules over giant files.

---

## 1. Tech stack (use exactly this)

| Concern | Choice |
|---|---|
| Framework | **Next.js 14+ (App Router) + TypeScript + React** |
| Styling | Plain CSS Modules or a single global CSS file ported from the prototype (no Tailwind needed — the design tokens already exist as CSS variables) |
| Auth + database + file storage | **Supabase** (email/password + Google sign-in, Postgres, Row Level Security) |
| Payments / subscriptions | **Stripe** (Checkout + Customer Portal + webhooks) |
| Hosting | **Vercel** |
| Tests | **Vitest** for the geometry engine |
| Desktop app (later, Phase 6) | **Tauri** wrapping the same web app |

---

## 2. Project structure

```
hingelab/
  app/
    (marketing)/page.tsx          # landing page + pricing
    login/page.tsx
    signup/page.tsx
    app/page.tsx                  # project list ("My boxes")
    app/editor/[id]/page.tsx      # the editor (ported prototype UI)
    api/stripe/checkout/route.ts
    api/stripe/portal/route.ts
    api/stripe/webhook/route.ts
  lib/
    hinge/                        # PURE geometry engine — no React, no DOM
      types.ts                    # Params, Model, Part, Edge, etc.
      defaults.ts                 # DEFAULTS + MATERIALS (copied from prototype)
      core.ts                     # buildCore, roundedPath, plateExtent
      wall.ts                     # tabCount, hingeSegments, slitPaths, strip building
      polygon.ts                  # simplify, offsetRect, polyD, bboxOf
      model.ts                    # computeModel (main entry)
      layout.ts                   # layoutParts (shelf packing on the laser bed)
      export.ts                   # exportSVG (layered SVG for LightBurn/Inkscape)
      index.ts
      __tests__/model.test.ts
    supabase/client.ts
    supabase/server.ts
    stripe.ts
    plans.ts                      # plan limits (free vs pro)
  components/editor/
    MenuBar.tsx  ControlBar.tsx  ToolRail.tsx
    Canvas.tsx   Rulers.tsx      PanelDock.tsx
    Preview3D.tsx  LayersPanel.tsx  AnalysisPanel.tsx
    StatusBar.tsx  NumberField.tsx (with scrub-on-label)
  hooks/
    useHistory.ts                 # undo/redo
    useAutosave.ts                # debounce save to cloud + localStorage
```

---

## 3. Phase 1 — Port the generator (no backend yet)

1. Create the Next.js project with the structure above.
2. Move **all geometry functions** from the `<script>` in `hingelab-prototype.html` into `lib/hinge/`. These are: `buildCore`, `roundedPath`, `tabCount`, `simplify`, `offsetRect`, `polyD`, `hingeSegments`, `makeCols`, `colSegments`, `waveParams`, `reliefRadius`, `slitPaths`, `cutWidth`, `mergesEdgeCuts`, `stadiumD`, `hingeCutPaths`, `wallOutline`, `outlinePath`, `P_slotW`, `bendAnalysis`, `autoFit`, `computeModel`, `bboxOf`, `plateExtent`, `layoutParts`, `layerContent`, `exportSVG`, plus `MATERIALS`, `DEFAULTS`, `EXPORT_LAYERS` and the `migrate` function (old projects with pattern `bone` become `relief`). Put the hinge pattern functions in `lib/hinge/hinge.ts`.
   - Type everything. `Params` must include every key in `DEFAULTS`.
   - The engine must be **pure**: input `Params`, output plain data/strings. No `document`, no `window`.
3. Port the UI into React components that look and behave exactly like the prototype:
   - Menubar (File / Edit / View / Help) with the same items and keyboard shortcuts.
   - Control bar: Shape (Rounded / Pill / Polygon / Cylinder), Lid (Open tray / Fixed lid / Removable lid), Pattern (Straight / Wave / Relief / Serpentine), Product switcher (Hinge Box active, "Letters — soon" disabled).
   - Hinge Pattern panel: the **Cut style** switch (Slots / Single line), the fields, the **Auto-fit pattern to this corner** button, and the **hinge close-up inspector** (true-proportion drawing with spacing, bridge, slit and bar dimensions).
   - Sheet & Layout panel: the **Add a bend test strip** checkbox.
   - Tool rail: Hand, Zoom, Fit, Grid, Save, Open.
   - Canvas: SVG with pan (drag / space-drag / trackpad), wheel zoom around the cursor, rulers that follow pan and zoom, laser-bed rectangle, layer colors.
   - Panel dock: 3D Preview (drag to rotate, "Explode lid" slider), Dimensions, Material, Hinge Pattern, Bend Analysis, Joints & Fit (including the One strip / Two halves switch), Layers (visibility + include-in-export per layer), Sheet & Layout.
   - Number fields: arrow keys step, Shift ×10, **drag the label left/right to scrub the value**, mm/inch display (store everything in mm internally).
   - Status bar: cursor X/Y, zoom, parts count, sheet usage, "Fits the bed" check, units toggle.
   - Undo/redo, rename, help dialogs, toasts.
4. Downloads: the prototype uses `window.claude.use("downloads")` because it ran inside Claude. **Remove that** and use a normal Blob + `<a download>` for SVG and project JSON.
5. Keep localStorage autosave for logged-out users.

### Required tests (Vitest) — the build must not pass without them

**A. Golden parity test (most important).** `golden-svgs.json` holds 198 cases produced by running the prototype. `lib/hinge/__tests__/golden.test.ts` must, for every case, run `computeModel` + `layoutParts` + `exportSVG` on `case.params` and assert the SVG string is **byte-identical** to `case.svg`, and that `L`, `rN`, `hBody`, `layout.width/height` and every number in `analysis` match within 1e-9. If a case fails, fix the port, never the golden file.

**B. Invariant tests.** `lib/hinge/__tests__/model.test.ts` loops over **every combination** of:
- shape: `rect`, `pill`, `poly`, `cyl`
- lid: `open`, `fixed`, `removable`
- split: `1`, `2`
- pattern: `straight`, `wave`, `relief`, `serpentine`
- cutStyle: `slot`, `line`

and asserts for each (192 cases, using `DEFAULTS` for everything else; for `pill` set `R = min(W, D) / 2`):
1. `computeModel` returns no `error`.
2. **Tabs match slots:** the number of bottom tabs on all wall pieces equals the number of slots in the BASE plate. (A bottom tab is a pair of outline vertices with `y > hBody + T * 0.5`.)
3. **Wall length matches the box perimeter:** `sum(edge.len + edge.sweep * rN / (1 + stretch / 100))` equals `model.L` within 1e-6.
4. **No hinge cut touches a tab:** no hinge column `x` is within 0.3 mm of any tab vertex `x`.
5. **Every hinge zone has an odd number of columns and starts and ends with a `closed` column** (for serpentine: starts and ends with a `top` column).
6. The exported SVG contains no `NaN`, has `width`/`height` in `mm`, and has the layer groups `slots`, `hinge`, `outline` (and `labels` when enabled).

**C. Error paths:** radius larger than half the width, cylinder too small for its tab flats, kerf ≥ thickness, slit spacing ≤ kerf + 0.3, serpentine on a wall that is too short — each must return the same human-readable error message as the prototype.

**D. Auto-fit:** for `DEFAULTS` with `R = 12` and with `R = 40, W = 200, D = 140`, `autoFit` returns `ok: true` and its `a.rMin * 1.3 <= rN`.

**Phase 1 is done when:** `npm run test` passes, and the editor at `/app/editor/local` looks and works like the prototype.

---

## 4. Phase 2 — Accounts (Supabase Auth)

1. Supabase project with email/password and **Sign in with Google**.
2. Pages: `/login`, `/signup`, password reset. Style them in the same dark design.
3. Protect `/app/*` with middleware; logged-out users go to `/login`.
4. Top-right of the menubar: user avatar menu → "My boxes", "Billing", "Sign out".

---

## 5. Phase 3 — Cloud projects (the user's own cloud space)

Goal: a user logs in on **any computer** and sees all their boxes.

### Database (Supabase Postgres)

```sql
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  stripe_customer_id text,
  plan text not null default 'free',          -- 'free' | 'pro'
  plan_status text,                           -- stripe subscription status
  current_period_end timestamptz,
  created_at timestamptz default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null default 'Untitled box',
  product text not null default 'hinge-box',  -- future: 'letters', ...
  params jsonb not null,                      -- the full Params object
  thumbnail_svg text,                         -- small preview for the list
  engine_version int not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles enable row level security;
alter table projects enable row level security;
create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own projects" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

Add a trigger that creates a `profiles` row when a user signs up.

### Behavior
- **My boxes** page (`/app`): grid of project cards with thumbnail, name, last edited, and actions Open / Duplicate / Rename / Delete. "New box" button.
- Editor autosaves `params` to Supabase 1.5 s after the last change (debounced), and shows "Saved to cloud" / "Saving…" / "Offline — saved locally" in the status bar.
- Also keep a localStorage copy so nothing is lost offline; when back online, the newer copy wins (compare `updated_at`).
- **Local save stays available:** File → Save project (downloads `.hingelab.json`), File → Open project (imports a `.hingelab.json` into a new cloud project).
- Store `engine_version` so future geometry changes can migrate old projects.

---

## 6. Phase 4 — Subscriptions (Stripe)

### Plans (put these in `lib/plans.ts` so I can change them later)

| | Free | Pro |
|---|---|---|
| Price | $0 | **$9/month or $79/year** |
| Generator + preview | ✅ | ✅ |
| SVG export | ✅ with a small "Made with HingeLab" engrave mark | ✅ clean |
| Cloud projects | up to 3 | unlimited |
| All shapes and patterns | Rounded + Straight only | all |
| Future tools (Letters, …) | — | ✅ |

### Implementation
1. `POST /api/stripe/checkout` creates a Checkout Session (subscription mode) for the logged-in user, creating the Stripe customer if needed and saving `stripe_customer_id`.
2. `POST /api/stripe/portal` opens the Stripe Customer Portal (cancel, change card, switch monthly/yearly).
3. `POST /api/stripe/webhook` verifies the signature and handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` → updates `profiles.plan`, `plan_status`, `current_period_end`.
4. **Enforce limits on the server** (API routes / RLS), not only in the UI. Locked features in the UI show a small lock icon and an "Upgrade to Pro" dialog.
5. Use Stripe **test mode** until I say otherwise. Give me the exact list of environment variables to set in Vercel.

---

## 7. Phase 5 — Landing page and launch

1. Marketing page at `/`: hero with a live mini version of the generator (or an animated 3D box), "How it works" in 3 steps, examples gallery, pricing table, FAQ (kerf, materials, LightBurn compatibility), footer with Terms / Privacy.
2. SEO metadata, Open Graph image, favicon.
3. Deploy to Vercel with a custom domain. Set up Supabase and Stripe production keys only when I confirm.

---

## 8. Phase 6 — Windows desktop app (do not start until I ask)

1. Wrap the same Next.js app with **Tauri** to produce a Windows `.exe` installer.
2. The desktop app requires login (same Supabase account) and uses the same cloud projects.
3. Add native "Save as…" dialogs for SVG and project files.
4. Do not sell inside any app store; billing stays on the website.

---

## 9. Reference: what the generator does (for your understanding)

- **Shapes** are built as a convex "core" polygon offset by a corner radius `R` (Minkowski sum). Rounded rectangle, pill (`R = D/2`), regular polygon (3–12 sides, size = across flats), and cylinder (a regular N-gon with short flat "tab zones" of length `tabW + 4`, so the round wall has places to anchor tabs).
- **Wall strip**: one long strip (or two halves) whose length equals the perimeter of the wall centerline: `Σ edge lengths + Σ arc sweeps × (R − T/2)`. Seams sit in the middle of a flat side, and seam sides never get a centered tab.
- **Tabs and slots**: tabs on the wall's top/bottom edges (top only with a fixed lid) fit slots in the base/lid plates. Slots sit on the wall centerline, inset `T/2` from the plate edge.
- **Hinge**: columns of cuts over each corner arc plus an "overrun" into the flat sides (clamped so cuts never reach a tab). Each zone has an odd number of columns so it starts and ends with a "closed" column. Lattice patterns alternate "closed" columns (bridges at both edges) and "open" columns (cuts reach the edges), which is what lets the edge band bend. Four patterns:
  - **Straight**: the classic lattice.
  - **Wave**: every cut follows one global sine `x + A·sin(2π·y/λ)` with `A = 0.3·pitch`, `λ = max(4·pitch, 8)`, so neighbouring cuts are parallel copies and the torsion bars keep a constant width.
  - **Relief**: Straight plus a small round hole (radius `clamp(0.22·(pitch − kerf), 0.25, 0.6)`) at every cut end that is inside the material, to spread stress.
  - **Serpentine**: one cut per column, alternating from the top edge and from the bottom edge, leaving a bridge at the far edge. Very flexible; the wall stretches, so it should be glued.
- **Cut style** (default `slot`, `slotW` 0.8 mm):
  - `slot`: every interior cut is a closed, round-ended slot (stadium) whose path is inset by `kerf/2`, so the strip of wood removed is exactly `slotW` wide. Cuts that reach the top or bottom edge are **merged into the wall outline as round-ended notches** (outline layer), so each wall has one clean outer contour. Relief slots get round holes of radius `max(reliefRadius, 1.6 × slot radius)` at both ends (dog-bone shape). Wave keeps its edge cuts as wavy slots that run past the edge into the waste.
  - `line`: every cut is a single laser line (only the kerf is removed); edge cuts overshoot the edge by 0.4 mm.
  - Torsion bar width is `pitch − cutWidth`, where `cutWidth` is `slotW` in slot mode and `kerf` in line mode.
- **Stretch**: each hinge zone's length is divided by `1 + stretch/100` (default 0) to compensate for cuts opening as the wall bends.
- **Bend test strip** (optional part): one corner's hinge zone with 15 mm of flat on each side, same height as the wall.
- **Auto-fit**: searches spacing, bridge and slit length for the stiffest lattice whose estimated minimum radius × 1.3 still fits the corner.
- **Kerf compensation**: part outlines offset outward by `kerf/2`; slots shrink by `kerf`; hinge slits are single lines (not compensated).
- **Removable lid**: lid plate + a "lip" plate inset by `T + lidGap` that sits inside the wall.
- **Bend analysis**: an estimated minimum bend radius from torsion-bar strain: `rMin = pitch × barWidth / (1.2 × γ × barLength)`, where `γ` is a per-material allowable shear strain. Verdict: OK if the needed neutral radius ≥ 1.25 × rMin, Tight if ≥ rMin, otherwise "Likely to crack". Show it as an estimate, never as a guarantee.
- **Export layers** (LightBurn palette): `slots` green `#00E000` (C03, cut first), `hinge` blue `#0000FF` (C01), `outline` red `#FF0000` (C02, cut last), `labels` black `#000000` (C00, engrave). Stroke width 0.1 mm, document size in mm, Inkscape layer attributes included.

---

## 10. Roadmap after launch (do not build yet)

- **Letters tool**: type text in any language (Latin, Persian/Arabic, etc.), choose a font, output either solid cut-out letters or stencil letters with automatic bridges for enclosed counters (A, B, D, O, P, Q, R…).
- Hinge-only panel generator (pattern for the user's own designs).
- DXF export.
- Machine/material presets saved per user.

---

**Start with Phase 1.** First read `hingelab-prototype.html` completely, then propose the file-by-file plan for Phase 1 and wait for my "go".
