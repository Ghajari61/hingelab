# Photo fidelity and automatic joinery — 1.17.0

- [x] Variable per-copy polygon coordinates for changing rib cross-sections; bounded arithmetic only.
- [x] Render actual front/side/top/isometric views, compare with all reference photos, accept only a valid revision; retain the valid draft if the review fails.
- [x] Paired nominal tab/slot and complementary half-lap joints derived from actual orthogonal contacts, per-part thickness, total clearance and minimum webs.
- [x] Glue contacts are distinct from mechanical joints; disconnected/unsupported assemblies are reported. No automatic bridging across gaps.
- [x] Editable joint settings, numbered connection report, 3D/cut geometry sharing and connections.json export.
- [x] Full regression: 3,391 passed, 33 existing environment-gated skipped. TypeScript, focused lint and production dependency audit passed (zero vulnerabilities).
- [x] Windows 1.17.0 built; updater signature and secret/server-code scan verified. Built UI tested with mocked AI/account: 9 variable ribs, 63 matching joints, editable clearance, SVG/package, persistence and narrow layout.
- [x] Production deployment and Windows download verified: 1.17.0, 11,921,059 bytes, SHA256 9a6898ea63ec1de429ad5d05e1e16ffffd43196757a71e8f72cd8257a0e567c0. Update endpoint serves 1.17.0.
- [x] Real production reference analysis completed the visual pass. A difficult twisted-ring reconstruction exposed floating inferred supports; the connection report correctly retained 46 separate assemblies instead of claiming a fit.
- [x] Follow-up server correction gives explicit origin/rotation semantics and measured world bounds/normals to the visual reviewer, rejects connectivity regressions, and prominently appends unresolved-assembly warnings. Fifteen focused tests, TypeScript and focused lint passed.

No product templates are introduced. Existing saved geometry keeps auto joinery off until enabled; new analyses start enabled. Kerf remains the shared exporter's responsibility. Software checks do not establish strength, invisible joints or physical assembly. Slanted/bevel joints and moving connections require review. Clearance 0.15 mm is a labeled starting assumption, not a measured material value.

Rollback: revert the feature/release PR and republish the previous stable manifest. No database migration or new provider/credential is involved.
