# Windows release checklist

Use this list for every HingeLab for Windows release. Build details: `WINDOWS_BUILD.md`. Update system: `DESKTOP_UPDATE_SYSTEM.md`.

## One-time setup (owner)

- [ ] **Database**: the migration `20261012000100_desktop_sessions.sql` is on the hosted project (`npx supabase migration list --linked`; push with `npx supabase db push --linked`). Without it sign-in from the app fails.
- [ ] **Website deployed** with the desktop routes (`/desktop/authorize`, `/api/desktop/*`). Check: `https://hingelab.vercel.app/api/desktop/update/windows/x86_64/1.0.0` answers 204, `/api/desktop/me` answers 400 without the client header.
- [ ] **Updater key** made and backed up (see `DESKTOP_UPDATE_SYSTEM.md`, "Keys"). The public key in `tauri.conf.json` must match it; `npm run desktop:build` verifies this on every build.
- [ ] **Code-signing certificate** (below). Until then installers are unsigned and Windows SmartScreen warns.
- [ ] **Where installers live**: GitHub Releases of the repository (recommended) or Vercel Blob (public store). Both hosts are on the update allowlist. Add another host only by editing `UPDATE_HOSTS` in `lib/desktop/releases.ts` (reviewed, tested).
- [ ] **Download page**: link the latest installer from the website (for example the Help page) for first installs.

## Code signing (Authenticode) and SmartScreen

The updater signature (minisign) protects updates. **Authenticode** is separate: it tells Windows who published the installer. Without it, Windows SmartScreen shows "Windows protected your PC" on download until the file builds reputation, and some antivirus tools are stricter.

Options, best first:

1. **Azure Trusted Signing** (Microsoft, about $10/month; individuals and companies with 3+ years of history in supported countries). Gives immediate SmartScreen reputation for the verified identity. Set it up in Azure, then sign with `signtool` and the Trusted Signing dlib, or use Tauri's `bundle.windows.signCommand`, for example:
   `"signCommand": "trusted-signing-cli -e https://<region>.codesigning.azure.net -a <account> -c <profile> %1"` with Azure credentials in environment variables on the build machine.
2. **EV or OV certificate** from a CA (DigiCert, Sectigo, SSL.com…). Since 2023 the private key must be on a hardware token or cloud HSM. Configure `bundle.windows.certificateThumbprint`, `digestAlgorithm: "sha256"` and `timestampUrl` (for example `http://timestamp.digicert.com`), or a `signCommand` for cloud HSMs.

Rules:

- Do **not** create a self-signed certificate and call it production signing; it gives no SmartScreen trust.
- Never commit `.pfx`/`.p12` files or passwords (`.gitignore` blocks them). Keep them in the token, HSM or CI secret store.
- Always timestamp signatures, so they stay valid after the certificate expires.
- Sign before the updater signature is made (Tauri does both in `tauri build` when signing is configured), so the `.sig` covers the signed file.
- Check: `Get-AuthenticodeSignature .\HingeLab_<v>_x64-setup.exe` shows `Valid`. `npm run desktop:build` prints the status.

Until the app is signed, tell users (the Help page in the app already does): on "Windows protected your PC", click **More info** → **Run anyway**, after checking the file came from the HingeLab website. Published SHA-256 sums help them check.

## Every release

1. [ ] Changes merged; `npx vitest run`, `npx tsc --noEmit -p .`, `next build` and the perf budgets pass.
2. [ ] `cargo test` in `desktop/src-tauri` passes.
3. [ ] `node scripts/desktop/e2e.mjs` and `node scripts/desktop/update-e2e.mjs` pass (see `WINDOWS_BUILD.md`).
4. [ ] Server changes that the new app needs are **deployed first** (old apps must keep working, or raise the minimum version deliberately).
5. [ ] `node scripts/desktop/version.mjs <x.y.z>` (newer than the current `latest`).
6. [ ] `npm run desktop:build` on the release PC (or CI with the secrets). It must print "verifies against tauri.conf.json pubkey", "Authenticode: Valid" (once signing is set up) and "scan: clean".
7. [ ] Install the new installer on a clean Windows 10 and a Windows 11 PC (or VM): sign in, build a design, export, sign out, uninstall.
8. [ ] Upload `HingeLab_<v>_x64-setup.exe` to the release host (GitHub Release `v<x.y.z>`), and publish its SHA-256.
9. [ ] `node scripts/desktop/release.mjs --url <https download url> --notes "<what changed>"` (add `--minimum <v>` only for a forced update). It refuses an installer that doesn't verify, a signature made for another version, a download that differs from the local file, and a version that isn't newer.
10. [ ] `npx vitest run lib/desktop` (checks `stable.json`), commit `desktop/releases/stable.json` and the version bump, deploy the website.
11. [ ] Check `https://hingelab.vercel.app/api/desktop/update/windows/x86_64/<previous version>` returns the new version, and that an installed previous version offers and installs the update.
12. [ ] Tag the commit `desktop-v<x.y.z>`.

## Rolling back

- Stop offering a bad release: set `latest` back to the previous release (or `null`) in `stable.json` and deploy. Apps that already updated keep the bad version; ship a fixed, **higher** version (downgrades are never offered).
- Block a broken old version from the service: set `DESKTOP_MIN_VERSION` in Vercel (takes effect on the next deployment) once a fixed version is offered.
