# Photo to Product implementation

- [x] Validated 1–5-photo specification and deterministic paw / heart-box / tag recipes.
- [x] Server analysis using existing provider configuration, authentication and AI allowance.
- [x] Photo upload and editing panel, assumptions, measurements, cancellation and regeneration.
- [x] Register web/Windows generator; preserve shared 3D, SVG, nesting, save and undo.
- [x] Export package with per-part SVGs, assembly, assumptions and editable project.
- [x] 19 feature tests, 39 registration/release tests, 2 native allowlist tests, TypeScript and production audit passed. UI bundle smoke covers joint mocked analysis and export; full regression and live provider verification tracked below.
- [ ] Review, Windows build, website deploy and public-download verification.

Use existing production providers and account rules. No new API key or authentication scheme. Uploaded reference copies stay in project parameters (bounded normalized JPEGs); analysis is an explicit server request. No database migration is required.

Release 1.15.0: Windows installer built, updater signature verified; production dependency audit found zero vulnerabilities. The QR desktop test now finds the product by id rather than a menu index. Browser testing uses explicitly mocked model responses; real provider verification will follow deployment with the signed-in account.
