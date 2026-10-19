# Signing the Windows app

HingeLab for Windows carries two independent signatures.

| Signature | What it does | Key | Where it is checked |
|---|---|---|---|
| **minisign** (updater) | Proves an update came from HingeLab; the app refuses an update without it. | `~/.hingelab/updater` on the release machine, or the `TAURI_SIGNING_PRIVATE_KEY` secret. Never in the repository. | By the app, against the public key in `desktop/src-tauri/tauri.conf.json`, and by `scripts/desktop/build.mjs` after each build. |
| **Authenticode** (Windows) | Names HingeLab as the publisher in Windows and SmartScreen. | Azure Trusted Signing (a managed certificate; no key file). | By Windows when the installer runs. |

The minisign key and its public key must not change: installed apps only accept updates signed with it.

## Authenticode with Azure Trusted Signing

`bundle.windows.signCommand` in `tauri.conf.json` runs `scripts/desktop/sign.mjs` for the program and the installer. The script signs and timestamps the file with `signtool` and the Trusted Signing dlib when these variables are set, and otherwise prints that signing was skipped and leaves the file unsigned (the build continues):

| Variable | Value |
|---|---|
| `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | An app registration with the *Trusted Signing Certificate Profile Signer* role on the signing account. |
| `AZURE_TRUSTED_SIGNING_ENDPOINT` | The account's region endpoint, for example `https://weu.codesigning.azure.net`. |
| `AZURE_TRUSTED_SIGNING_ACCOUNT` | The Trusted Signing account name. |
| `AZURE_TRUSTED_SIGNING_PROFILE` | The certificate profile (Public Trust). |
| `AZURE_TRUSTED_SIGNING_DLIB` | Path to `Azure.CodeSigning.Dlib.dll` (the CI workflow installs it). |
| `SIGNTOOL` (optional) | Path to `signtool.exe` when it is not on `PATH`. |

The credentials are read by the dlib from the environment; nothing secret is written to the command line or the repository.

### Setting it up

1. In Azure, create a Trusted Signing account and a *Public Trust* certificate profile. Identity validation of the publisher (HingeLab) is required before the profile can sign.
2. Create an app registration, give it a client secret, and assign it the *Trusted Signing Certificate Profile Signer* role on the account.
3. In the GitHub repository's secrets, add the six `AZURE_*` values above plus `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Run the **Desktop release build** workflow (Actions, or push a `desktop-v*` tag). It builds on `windows-latest`, signs, verifies the minisign signature, scans the bundle for secrets and server code, and uploads the installer and its `.sig`.
5. Publish as usual: copy the installer to `public/downloads`, run `node scripts/desktop/release.mjs --url … --notes "…"` (it records the size and SHA-256 in `desktop/releases/stable.json`), deploy.

`npm run desktop:build` prints `Authenticode: Valid` for a signed installer and `NotSigned` otherwise.

## What is not done

- **No self-signed certificate.** Windows does not trust one, so SmartScreen would still warn; it would only add a second, unknown publisher name.
- **No signing key in CI logs or artifacts.** Secrets are passed as environment variables to the build step only.

Until Trusted Signing is set up, the installer is unsigned and Windows SmartScreen asks first-time users to choose *More info › Run anyway*. The download page shows the installer's SHA-256 so it can be checked (`Get-FileHash HingeLab_*_x64-setup.exe`).
