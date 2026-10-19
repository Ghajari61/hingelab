# Redesign changelog (branch `redesign/unified-app`)

## Summary

HingeLab's website and Windows app are one product now. The Windows app shows the website's own editors, built into the installer, with designs made on the computer (also offline); the server checks the plan when a cut file is exported, as on the website. The app keeps what only it can do: sign-in through the browser, the session in Windows Credential Manager, project files from Explorer, the export folder, the signed updater. Free-form Studio, AI Studio and cloud projects open in its website view.

- **Lighter**: landing first-load JS 314 → 134 KB, the editor shell 284 → 154 KB, the landing HTML 182 → 85 KB; slow generator designs build in a worker (the slowest key press 380 → 32 ms).
- **Clearer**: one colour palette for cut, inner cut, hinge, score and engrave on the canvas and in the files; checks that frame their parts; "?" for shortcuts; a three-step first visit; "Export needs Pro" before the click and a preview in the upgrade dialog; phones with the canvas on top.
- **Consistent**: one statement of what each plan allows; counts from the data; "Free-form Studio"; the installer's SHA-256 on the download page.
- **Checked**: WCAG 2.1 AA with axe on every main page and editor; smoke tests for the website and the Windows UI bundle; Authenticode signing ready for Azure Trusted Signing.

Numbers in `PERF.md`, decisions in `DECISIONS.md` (D186, D188-D192), the release checklist in `docs/SMOKE-TEST.md`, signing in `docs/SIGNING.md`.

## Phase 0: audit

- `AUDIT.md` (structure, duplication, branches, bundles, workers, tokens, copy issues) and the baseline in `PERF.md`.
- Tooling: ESLint flat config (`eslint.config.mjs`, `npm run lint`), `npm run typecheck`, the bundle analyzer (`npm run analyze`), the editor latency script (`scripts/perf/latency.mjs`). Lint errors fixed (unescaped quotes in JSX text).
- Decisions D186 (R1-R9) in `DECISIONS.md`.

## Phase 1: one app for web and desktop

- `packages/platform`: one interface for files, export, project files, sign-in and session, updates, links and the router, with a website implementation and a Windows implementation (Rust commands). Every editor's downloads and exports go through it.
- `packages/app`: the entry point to the shared app (the start gallery and every editor), the routes (`/editor/<product>`) and `useSession()`. ESLint keeps the shared folders free of Next.js and Tauri imports.
- `packages/ui/lazy.tsx` replaces `next/dynamic` in the editors.
- Server: `/api/export` accepts the Windows app's token (`requestPlan`), with the same version gate and plan checks as the other desktop routes.
- Windows app: renders the website's editor with geometry on the computer; the native workspace and its 12 Rust commands are gone; new commands `api_request`, `save_file`, `open_file` and `open_external`, each allow-listed. Project files page, error boundary, scoped stylesheet, self-hosted fonts, website view kept for Studio, AI Studio and cloud projects.
- Website: self-hosted interface fonts (no Google Fonts), `/editor/<product>` redirects to the editor.
- Tests: the adapter contract and routes, the token path of `/api/export`, the Rust allow-lists. Decisions in D188.

## Phase 2: lighter and faster

- First-load JS: landing 314 → 134 KB, `/home` 252 → 186 KB, every other page down by about 65 KB; editor shell and Hinge Box 284 → 154 KB; Parametric 229 → 55 KB without three.js.
- Supabase and the font parser load on first use; the landing demo's engine when the demo nears the screen; three.js in its own chunk in Parametric.
- A build worker for slow generator designs (Shadow Box, signs, large puzzles), 150 ms after the last change, keeping the last result on screen.
- SVGO over the preset pictures (7.2 → 4.4 MB); new thumbnails optimised as they are made.
- The Windows program carries no local paths; the build checks it.
- Budgets tightened; numbers in `PERF.md`; decisions in D189.

## Phase 3: visual design and UX

- One palette for the laser operations on the canvas, in the legend and in the files (`packages/ui/src/ops.ts`).
- `packages/ui`: the component library with Button, Input, Popover and Skeleton; the Windows window's screens on the website's tokens.
- Boxes' panel shows the box and its size first and the joints last.
- Checks frame their parts on the canvas (Show); "?" opens the shortcuts; a three-step first-visit tour; a material and kerf reminder at the first export.
- Free plan: "Export needs Pro" and a Pro badge on Export; the upgrade dialog shows the design's cut file.
- Phones: the canvas pinned on top, the settings in a sheet below.
- Motion 150-200 ms ease-out; landing header and hero picture fixes.
- `npm run a11y` (axe, WCAG 2.1 AA): every page and editor passes, contrast included. Decisions in D190.

## Phase 4: copy, consistency and release prep

- Hero: "Design free in your browser. Export with Pro."
- One licensing statement in `lib/plans.ts` for the pricing table, cards, FAQ and Terms; "Save up to 30%".
- Design counts from the data, with a test against typed counts; "Free-form Studio" in the nav.
- Download block: version, size, SHA-256 and a note for non-Windows devices; `stable.json` records the SHA-256.
- Authenticode signing with Azure Trusted Signing (`scripts/desktop/sign.mjs`, skips without secrets), a Windows CI build workflow and `docs/SIGNING.md`.
- Phones: the header fits, and the page no longer scrolls sideways. Decisions in D191.

## Phase 5: verify, report and release

- Landing: gallery pictures as static files, stylesheets inlined, the display font preloaded. HTML 182 → 85 KB gzip; Lighthouse performance 72 → 87, accessibility 96 → 100, LCP 5.4 → 3.7 s.
- New checks: `npm run smoke:web` (14 products, two widths), `npm run desktop:smoke` (the Windows UI bundle under the window's CSP), `npm run a11y`; `docs/SMOKE-TEST.md`.
- `PERF.md` before and after; decisions in D192.
- Released as HingeLab for Windows 1.1.0 with the website.
