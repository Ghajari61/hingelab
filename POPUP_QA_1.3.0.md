# Pop-up 1.3.0 Windows QA — 2026-10-25

Status: local authenticated generation and native SVG export passed for all 27 presets. The earlier Docker blocker is resolved. This is software QA, not physical cutting certification.

## Environment and scope
- Branch: feature/popup-generator. No push, main changes, online deployment or publication.
- Installed release reports 1.3.0. It points at the production server; local testing therefore uses a separate 1.3.0 debug/e2e executable built with HINGELAB_API_BASE=http://127.0.0.1:3457 and isolated identifier app.hingelab.popupqa.
- Test binary: desktop/src-tauri/target/debug/HingeLab.exe. Local Next server: 127.0.0.1:3457. Existing local Supabase: 127.0.0.1:55421.
- A local-only test account received a temporary Pro plan. Production credentials and billing were untouched.
- Native PKCE callback and token exchange succeeded. The authorization code was issued by a local test fixture; browser login/consent screens were not manually exercised.

## Passed checks
- Existing geometry/snapshot suite: 39/39 passed in the preceding QA run.
- Desktop generation suite: 27/27 passed in the preceding QA run. Each preset generated finite SVG and a nonempty 3D model; edited-width regeneration passed, and Free access returned 403 without SVG.
- This run: authenticated HTTP POST /api/desktop/generate returned 200 with SVG and 3D objects for every one of the 27 presets.
- This run: searched/selected every preset inside the native Windows editor and used its Export SVG button. Exactly 27 default-preset SVG files were verified on disk. Hexagon Fruit Basket was retried after the first click sequence produced no file.
- All 27 native files parsed as SVG XML, contained paths, and had no NaN/Infinity values. Their ordered path d attributes matched the corresponding authenticated HTTP exports exactly (27/27). This comparison verifies path geometry, not physical manufacturability.
- Representative native 3D check: four views rendered; Open pop-up changed between 0 and 1; Explode changed to 0.7 and back. These controls were visually checked on Hexagon Fruit Basket. Model data exists for all 27; a separate exhaustive visual 3D inspection of each preset was not performed.
- Hexagon Fruit Basket width changed from 240 to 260 mm. Native SVG export produced a distinct, valid 260 mm file.
- Saved the 260 mm project through the Windows file picker, changed the working width to 200 mm, then reopened the saved project. Width correctly returned to 260 mm and the preview regenerated.
- Production installer SHA-256 is unchanged: c68a52aea21620f019f5cef6e8cda33d2b232a61d774607a136dca6c4046365a.

## Evidence
- Native files: tmp/popup-130-qa/native-svg (27 preset exports plus one edited 260 mm export).
- Downloadable archive: tmp/popup-130-qa/Pop-up-1.3.0-Windows-Exports.zip (28 SVGs).
- HTTP files: tmp/popup-130-qa/http-svg.
- Machine-readable records: tmp/popup-130-qa/http-results.json, native-results.json, geometry-comparison.json.
- Editable saved project: tmp/popup-130-qa/hexagon-edited-260.oclc.
- Native screenshot: docs/screenshots/popup-1.3.0-local-qa.png.
- Earlier function-level exports remain separately in tmp/popup-130-qa/svg.

## Limitations / follow-up observations
- No actual laser cut, material flexure, load, lamp heat, or assembly fit was tested. Existing design warnings still apply; SVG validity does not certify physical performance.
- Signed production installer was not rebuilt for localhost; these native functional checks apply to the isolated local-test build, not a production-server E2E run.
- First-run tour was partly obscured by the expanded desktop sidebar at the tested window size. Skip dismissed it and the editor was usable. This cosmetic onboarding issue remains; no source fix is claimed.
- No claim of exhaustive combinations of all parameter ranges or third-party laser software imports.

The local server and isolated test app are left running for inspection. Production app session was not modified.
