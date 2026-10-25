# Windows and web 1.5.0 verification

Includes Letters corner preservation from PR #4 (94a4f84), based on main 5fe9af2, plus a release-review fix: split wall strips only generate base slots for tabs that survive seam clipping.

## Evidence
- Regression first: seven of ten strip-length cases failed with 26 base slots versus 20/24 surviving tabs. All ten pass after retaining the same tab indices for strip tabs and base slots.
- Letters, desktop, issue and export checks before the follow-up fix: 380 passed, 10 skipped.
- TypeScript and targeted lint passed after the fix.
- Packaged desktop UI smoke passed for Pop-up, gallery, Hinge Box, Letters, Boxes, Shadow Box, Clock and Parametric, without page errors or CSP violations. Rust calls are stubbed in this UI smoke.
- Windows production build, independent updater signature verification, secret/server-code scan and local-path scan passed.
- Final manifest/signature checks: 28 passed.
- Installer: 10,439,304 bytes; SHA-256 6eaaaab178373296538a93ca79e26505f3fc3f8bbd58aca026780a8764d55fe8.

## Limits and rollback
Corners defaults to Keep, including when the field is absent in an older project; select Round off to retain the earlier geometry behavior. More corner-preserving strips means more assembly work. Material fit and physical fabrication are not certified.

Azure Authenticode publisher signing remains unconfigured. Clean Windows VM installation and live-account sign-in/update were not repeated. To stop offering this installer restore the previous stable.json and redeploy; retain older downloads. Installed apps need a higher patch release for a corrective update.

Final full suite (two workers): 2824 passed, 33 skipped, zero failures. Native Rust tests: 19 passed.
