# Pop-up 1.3.0 Windows QA — 2026-10-25

Status: geometry and desktop generation checks passed; full authenticated native-app/local-server E2E remains BLOCKED, not passed.

## Passed
- Installed Windows executable reports FileVersion/ProductVersion 1.3.0; its native window was opened and inspected.
- Built a separate 1.3.0 debug/e2e executable with compile-time HINGELAB_API_BASE=http://127.0.0.1:3457 and isolated app identifier app.hingelab.popupqa. The production signed installer was not rebuilt or changed.
- Local Next server started on loopback port 3457.
- Existing Pop-up geometry/snapshot suite: 39/39 passed.
- New desktop generation suite: 27/27 passed. For EACH preset, calls the actual generateDesign server implementation with Pro plan, verifies a nonempty 3D model, positive sheet dimensions, valid finite SVG, then changes width to 260 mm and verifies successful editable regeneration. Verifies Free returns 403 and no SVG. This is a function-level integration test, not an authenticated HTTP/UI test.
- All 27 exports parsed successfully as XML with SVG roots. None reports an error-level design issue. Warnings remain available in the per-preset JSON reports.
- Files: tmp/popup-130-qa/svg; archive: tmp/popup-130-qa/Pop-up-1.3.0-27-SVG.zip.
- Installer SHA-256 unchanged: c68a52aea21620f019f5cef6e8cda33d2b232a61d774607a136dca6c4046365a.

## Blocker and unverified paths
Local Supabase at 127.0.0.1:55421 is unavailable. Docker engine calls did not return; its backend log says 'backend exited before becoming ready'. Windows service com.docker.service is Stopped. Start-Service failed with 'Cannot open com.docker.service service on computer'. Docker Desktop needs to be started successfully with the necessary Windows privileges before local authentication can be tested.

The local native app opened at its 1.3.0 sign-in screen. An initial launch lacked HINGELAB_E2E_AUTH_URL_FILE; the subsequent launch command was prepared with this variable, but an already-running single instance prevents changing its environment without a fresh launch. No local sign-in, native SVG Save dialog, or click-through of all 27 presets was completed. No production credentials, billing rules or authentication code were changed. The existing production app remained separate.

## Resume
1. Start Docker Desktop and wait for its engine; start the existing local Supabase stack without resetting its database.
2. Start current Next dev server on 127.0.0.1:3457.
3. Launch desktop/src-tauri/target/debug/HingeLab.exe fresh with HINGELAB_E2E_AUTH_URL_FILE and HINGELAB_E2E_BROWSER_FILE pointing into tmp/popup-130-qa.
4. Use a local test account and existing PKCE sign-in, then verify all 27 native preset previews, edits, flat/open animation and actual SVG saves against the exported reference files. Keep test-account state isolated from the user's production session.

No push, main changes, online deployment or installer publication was performed.
