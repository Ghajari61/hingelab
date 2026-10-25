# Windows 1.4.0 release verification

Source: main at 2b78e04, with version and release metadata updated in an isolated checkout. Uncommitted experiments in the development checkout are excluded.

- Production Windows build completed; installer size: 10,433,781 bytes.
- SHA-256: 6250f5c70469c3f31cafc837e2b5e04c77940684f5e8ef3c4584780a21871765.
- Updater signature independently verifies against the existing application public key. Secret/server-code scan passed; no local user paths detected.
- TypeScript passed. Desktop/Pop-up/workflow tests: 140 passed, 10 skipped (local service integration unavailable in this isolated checkout).
- Native Rust tests: 19 passed.
- Packaged UI smoke: Pop-up, gallery, Hinge Box, Letters, Boxes, Shadow Box, Clock and Parametric rendered without page errors or CSP violations. This smoke uses stubbed Rust calls; it is not proof of live sign-in or export service behavior.
- Updated release manifest/signature tests: 28 passed.

Limitations: Azure Authenticode signing is not configured; the independent updater signature is not a Windows publisher certificate. Clean Windows 10/11 VM installation and live-account update/sign-in were not repeated for this packaging release. Physical fabrication remains unverified.

Rollback: restore the previous stable.json from the parent commit and redeploy to stop offering 1.4.0. Existing installations cannot be silently downgraded; ship a higher patch version if needed. The 1.3.0 download is retained.

Full regression: 2788 passed, 33 skipped, one timing-only failure (386 ms vs 250 ms under concurrent test load). All 16 geometry-validation tests passed in an isolated rerun. No geometry correctness assertion failed.
