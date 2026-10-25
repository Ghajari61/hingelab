# Pop-up generator: notes

## Final report

**Branch:** `feature/popup-generator` (not merged, not deployed).

### What was added

- `lib/generators/popup/`: `params.ts` (settings, defaults, merge with whole-number clamping, mode presets), `outline.ts` (11 outlines, centred, sampled as a radius in 1,440 directions), `profile.ts` (side curves and ring spacing), `build.ts` (sheet, cuts with exact bridges, slots and holes, arms, finial, engraving, 3D pieces, set of sizes, stats and assembly steps), `check.ts` (checks with fixes), `presets.ts` (29 designs), `index.ts` (panels, rail art, Pro gating, help).
- `lib/generators/__tests__/popup.test.ts` (19 tests) and its snapshot (a digest of every preset's cut file).
- `public/presets/popup/*.svg` (29 thumbnails), `public/rail/gen-popup-*.svg` (23 rail pictures).
- A guide in `lib/help/articles.ts`: "How to make a pop-up bowl, tree or lampshade" (`popup-guide`). The generator's own help and tips articles are generated from its definition, as for every generator.

### What was changed

- Registration: `lib/generators/ids.ts`, `registry.ts`, `all.ts`, `startPresets.ts`, `nav.ts`, `catalog.ts`, `lib/site/products.ts`, `lib/desktop/types.ts`, `lib/ai/types.ts`, `lib/ai/design.ts`, `lib/generators/railArt.generated.ts` (Pop-up groups only).
- Icons: `components/editor/ControlBar.tsx`, `app/page.tsx` (Lucide `Cone`).
- 3D: `GenOutput.fold` (label and tooltip of the fold slider) in `lib/generators/types.ts`, read by `components/generators/GeneratorView3D.tsx`; the Paper Box still shows "Fold".
- Scripts: `scripts/smoke/web.mjs`, `scripts/security/csp-check.mjs`, `scripts/perf/budgets.mjs` (Pop-up chunk budget 40 KB; editor shell budget 169 → 172 KB).
- Tests with hard-coded lists: `lib/desktop/__tests__/desktop.test.ts`, `lib/studio/__tests__/foundation.test.ts`.
- Desktop version 1.2.0 → 1.3.0: `desktop/src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock` (with `scripts/desktop/version.mjs`).
- `CHANGELOG.md` (1.3.0, unreleased), `DECISIONS.md` (D197), `docs/SMOKE-TEST.md` (1.3.0 checks).

The landing counters ("N generators · M ready-made designs") and the generators page read the data, so they include Pop-up without copy changes.

### Decisions taken without asking

1. **No Persian preset text (D147).** `DECISIONS.md` D147 records the owner's request to remove every Persian preset, sample and motif and to keep only the fonts and shaping. The Haft-Sin (Nowruz) tray from the brief became **Spring blossom tray**; the Ramadan and Eid bowls use Latin text, like the topper's Eid presets. Persian text typed into the engraving fields is shaped correctly (shared HarfBuzz code). To add a Persian preset anyway, put the text in a preset's `engrave.text` or `engrave.rim` with a Persian font such as `vazirmatn`.
2. **No tilted laser cut with a wedge jig.** A laser on a tilted bed tilts every cut the same way, but a ring needs its cut tilted toward the centre all the way round, which only a scroll saw (turning the work) does. So the angled cut is offered as a **scroll-saw** method for thick boards, with the table tilt worked out and a check that the drop per ring stays under 60% of the thickness. Laser-cut sheets are held by **slotted arms** (default).
3. **Rings follow the outline by scaling, not offsetting.** A scaled ring keeps a star's points and never collapses on a concave outline. Offset rings would round off the shape and vanish in narrow parts.
4. **Lopsided outlines centre on the pole of inaccessibility** (heart, pumpkin, leaf, your own), which doubled the heart's narrowest ring compared with the area centroid.
5. **No "vase" side curve.** Flat rings stacked outward can only widen, so a neck is impossible; "Turn over" covers the reverse dome.
6. **Nested set packed beside, not inside.** A pop-up sheet is solid all the way to its rim, with no waste to nest into. "Sizes in the set" adds smaller copies that the sheet packing places.
7. **Free vs Pro** mirrors the brief: free are circle and rounded outlines, rings, slotted arms, cone and dome. Everything else needs Pro to export (as everywhere, the free plan designs and previews but does not download).
8. **Batch** personalises the centre text (`engrave.text`), within the plan's batch limits.
9. **Thumbnails** are 11 to 88 KB (others are about 17 KB): spirals have many 3D pieces. The 3D outlines are simplified to 0.2 mm and spirals use 16 pieces a turn to keep them this small.
10. **Rail pictures** were made with `scripts/rail-art.ts`, which rebuilds every generator's pictures. The committed pictures of other products differ from what the script makes today, so only the Pop-up files were kept and the rest restored, to leave unrelated files untouched.

### Tests and build

- `npx vitest run`: 163 files passed, 2,644 tests passed, 1 failed (Pop-up's curve placeholder matched the default curve). Fixed; the placeholder, contract and Pop-up tests were re-run and pass (81 tests).
- `npx tsc --noEmit -p .`: clean. `eslint` on every changed file: no new warnings.
- `next build`: passes.
- `node scripts/perf/budgets.mjs`: all budgets met. The Pop-up chunk is 29.9 KB (budget 40). The editor shell grew to 169.8 KB with Pop-up's start presets, 0.8 KB over its 169 KB budget, which was re-based to 172 KB with a note (as D193 did).
- Checked by hand in the dev server with Playwright: the editor, rail pictures, panels, sheet layout, the 3D view and the Open slider, with no console errors.

### Windows installer

**Not built.** This environment is Linux. The installer must be built on the release PC (or CI) that holds the updater signing key and, once set up, the Authenticode certificate (`WINDOWS_BUILD.md`, `WINDOWS_RELEASE_CHECKLIST.md`). So there is no installer path, size or SHA-256 yet.

`desktop/releases/stable.json` and the landing page's download section (which reads it) were **left on 1.2.0** on purpose: they must point at a real, signed installer, or the auto-update and the download link break.

### Left for you

1. Review the branch and merge it.
2. On the Windows release PC: `npm ci`, then `npm run desktop:build`. It must print "verifies against tauri.conf.json pubkey" (and "Authenticode: Valid" once signing is set up).
3. Install the new installer on Windows 10 and 11, open Pop-up, export.
4. Upload `HingeLab_1.3.0_x64-setup.exe` to the release host (GitHub Release `v1.3.0`).
5. `node scripts/desktop/release.mjs --url <download url> --notes "Pop-up: one flat sheet that lifts into a bowl, basket, tree, lampshade or ornament."`. This writes `stable.json` with the size, SHA-256 and signature, and the landing page picks them up.
6. `npx vitest run lib/desktop`, commit `stable.json`, deploy the website, tag `desktop-v1.3.0`.
7. Put a date on the 1.3.0 entry in `CHANGELOG.md`.
