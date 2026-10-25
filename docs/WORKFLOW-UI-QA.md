# Workflow UI verification — 2026-10-25

Branch: feature/popup-generator. Local-only work; no push, deployment or Windows installer release.

## Delivered
- Seven workflow navigation steps shared by Hinge Box, Letters, Parametric and generators.
- Simple/Advanced visibility, hidden modified-setting notice, persisted collapsible/resizable settings panel, keyboard resize and reduced-motion-aware navigation.
- Pinned export controls wrap on narrow panels. First-run tour uses a body portal to avoid desktop sidebar clipping.
- Projects search, product and storage filters, explicit Account/This device labels and existing generator autosave cards. Rename/delete dialogs have labels, Escape, focus containment and focus restoration.
- Existing workflow-related uncommitted groundwork was integrated; unrelated parametric/template edits were preserved.

## Verified
- Focused tests: 4 passed (preference compatibility, resize bounds, section classification, robust local draft discovery). Both new behaviors had a failing test before implementation.
- scripts/smoke/workflow.mjs: Pop-up, Hinge Box, Letters, Parametric and Shadow Box; step focus, Simple/Advanced, collapse/expand, keyboard resizing. Responsive checks at 375, 768 and 1024 px passed after fixing narrow export toolbar overflow.
- Isolated local-account browser test: local draft listing, search, no-result state, storage filter and Clear filters passed.
- Axe on the new workflow/header/export controls: zero violations in light and dark themes. This is scoped accessibility verification, not a whole-product certification.
- Saved width restored on page load; first-run tour is within the viewport, parented to body and dismissible.
- TypeScript and targeted lint passed. Local Next production build and Windows frontend build passed. No native installer was rebuilt.
- Full Vitest run: 2807 passed, 2 failed, 7 skipped. Geometry validation timing failed at 427 ms vs its 250 ms threshold while builds competed for resources; the complete geometry-validation file passed in an isolated rerun. One desktop AI integration test still fails: expected 400 for invalid input, received 503 from the server's AI configuration check. UI work does not modify that API or test. Do not describe the entire suite as green.

## Evidence
Screenshots: docs/screenshots/workflow-light.png, workflow-dark.png, workflow-projects.png, workflow-onboarding.png.
Logs and additional responsive screenshots: tmp/workflow-qa, tmp/workflow-vitest.log, tmp/workflow-recheck.log, tmp/workflow-build-final.log, tmp/workflow-desktop-final.log.

## Limits
Local cards expose the existing latest generator autosave; they are not multiple named local projects, version history, asset migration or new cloud storage. No geometry/AI/image-processing features from the larger proposal were added. Physical fabrication and exhaustive parameter combinations are outside this UI verification.
