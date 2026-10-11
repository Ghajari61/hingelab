# HingeLab for Windows: the update system

The app updates itself with the **official Tauri updater** (`tauri-plugin-updater` 2.13). The server only says *where* a newer installer is; the app installs it only if its signature verifies against the public key built into the app. A wrong, tampered, replayed or malformed answer cannot install anything.

## How an update happens

1. About four seconds after start (if "Check for updates automatically" is on in Settings), or when the user clicks **Check for updates**, the app asks
   `https://hingelab.vercel.app/api/desktop/update/windows/x86_64/<current version>` over HTTPS (certificate checks on; the updater refuses `http` endpoints).
2. The route (`app/api/desktop/update/[target]/[arch]/[version]/route.ts`) reads `desktop/releases/stable.json`, which is reviewed in Git and deployed with the website. It answers **204** when nothing newer exists, or `{ version, notes, pub_date, url, signature, size }`. It never offers the same or an older version.
3. The app shows the update dialog: installed and new version, release notes, download size and date, **Update now** / **Later**. Later only hides the dialog; the sidebar keeps an "Update available" pill. Nothing installs without the user's click (except the forced case below, which still needs the click).
4. Update now downloads with a progress bar. The plugin then verifies the file:
   - the minisign signature (Ed25519 over the BLAKE2b-512 hash of the file) against the public key in `tauri.conf.json`;
   - the signed trusted comment, including `version:<x.y.z>`, which must equal the version the server announced (`requireSignedVersion: true`), so an attacker can't pair a higher version number with an older genuine installer;
   - the key id.
   Any failure stops here: "The update could not be verified, so it was not installed. Your current version is unchanged." **Try again** asks the server again.
5. A verified installer runs in passive mode (progress window, no questions), per user, and the app restarts on the new version.

## Mandatory updates

The server can require a minimum version: `minimumVersion` in `stable.json`, raised (never lowered) by the Vercel variable `DESKTOP_MIN_VERSION`. Every API call from an older app gets **426** `update_required`; the app then shows "Update HingeLab to continue" with **Update now** (the same verified flow) and **Website**. If no installable update is offered (for example the release isn't published yet) the user gets the website link instead of a loop. After updating, the version is no longer below the minimum and the update route returns 204, so there is no update loop.

## What the server checks (`lib/desktop/releases.ts`)

`manifestError` refuses a manifest unless:

- the channel is `stable`, versions are strict `x.y.z`, and `minimumVersion` ≤ `latest.version`;
- each platform URL is `https`, has no user, password or port, ends in `.exe`, and is on an allowed host (`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `hingelab.vercel.app`, `*.public.blob.vercel-storage.com`);
- each signature is a well-formed minisign signature whose trusted comment says `version:<latest.version>`;
- size is a positive integer below 500 MB and notes are at most 5000 characters.

A Vitest test (`desktop.test.ts`, "the committed release manifest is valid") fails the build if `stable.json` breaks any of these.

These checks are defence in depth: even if the manifest or the route were compromised, the app would still refuse anything not signed with our key for the announced version, and would not downgrade.

## Keys

- **Private key**: made once with `npx tauri signer generate -w %USERPROFILE%\.hingelab\updater\hingelab-updater.key` (password protected). It lives **only** outside the repository (folder ACL limited to the owner) and, for CI, in the secret store as `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. It is never committed (`.gitignore` blocks `*.key`, `*.password`), never printed, never uploaded anywhere public, and never in the app: the build scan fails if the key or its password appears in a build.
- **Public key**: `plugins.updater.pubkey` in `desktop/src-tauri/tauri.conf.json`. Public by design.
- **Back up the private key and password** in a password manager or offline storage. If it is lost, installed apps can no longer be updated automatically; users would need to download a new installer (with a new public key) from the website.
- **If the private key leaks**: remove `latest` from `stable.json` and deploy (stops all offers), make a new key pair, ship a release with the new public key as a manual download, raise `minimumVersion` to it, and announce it. Releases signed with the leaked key can only reach users if the manifest offers them, which we control.

## Publishing a release

See `WINDOWS_RELEASE_CHECKLIST.md`. In short: `node scripts/desktop/version.mjs <v>`, `npm run desktop:build`, upload the installer to an allowed host, `node scripts/desktop/release.mjs --url <https url> --notes "…"` (re-verifies the signature and the signed version, checks the uploaded file is byte-identical, refuses non-newer versions), `npx vitest run lib/desktop`, commit, deploy.

## Tests

- `lib/desktop/__tests__/desktop.test.ts`: only newer, well-formed releases are offered; bad URLs, hosts, schemes, credentials, extensions, sizes, signatures and signed versions are refused; minimum version from the environment only raises.
- `lib/desktop/__tests__/minisign.test.ts`: valid accepted; tampered file, other key, corrupted signature and edited trusted comment rejected.
- `scripts/desktop/update-e2e.mjs` with real NSIS installers and a throwaway key: install 1.0.0; no update (204); malformed answer; downgrade and same version ignored; tampered installer rejected; signature from another key rejected; a genuine 1.0.1 installer announced as 1.0.2 rejected; Later installs nothing; a signed 1.0.1 installs, the app restarts on 1.0.1, and no update is offered afterwards. All 10 steps pass (11 October 2026).
