# Building HingeLab for Windows

How to build, run and test the Windows app (`desktop/`). Architecture: `DESKTOP_ARCHITECTURE.md`. Publishing a release: `WINDOWS_RELEASE_CHECKLIST.md`.

## Tools (once per machine)

1. Node.js 20 or later and `npm install` in the repository root (installs the Tauri CLI and JS packages).
2. Rust (stable, MSVC): `winget install Rustlang.Rustup`, then `rustup default stable`. New terminals have `cargo` on the path; in an already open PowerShell run `$env:Path = "$env:USERPROFILE\.cargo\bin;" + $env:Path`.
3. Microsoft C++ Build Tools ("Desktop development with C++"), which Rust's MSVC target needs.
4. WebView2 Runtime: built into Windows 11 and current Windows 10. The installer downloads it on PCs that lack it (`webviewInstallMode: downloadBootstrapper`).
5. NSIS is downloaded by the Tauri CLI the first time it bundles.

## Develop

```powershell
npm run desktop:dev        # Vite on :5174 + the app in debug mode, against https://hingelab.vercel.app
```

To work against a local website instead, run `npm run dev` (or a production build on 3457) and build the app with `HINGELAB_API_BASE` set. The base is fixed at compile time and must be `https`; plain `http` is accepted only for `127.0.0.1` in debug builds or builds with the `e2e` feature:

```powershell
$env:HINGELAB_API_BASE = "http://127.0.0.1:3457"
cd desktop; npx tauri dev
```

UI only (no Rust): `npm run desktop:ui:dev`; type-check with `npx tsc --noEmit -p .` (the desktop UI is part of the root project).

## Release build

```powershell
npm run desktop:build
```

`scripts/desktop/build.mjs`:

1. reads the updater signing key from `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, or on the release PC from `%USERPROFILE%\.hingelab\updater\hingelab-updater.key` and `.password` (outside the repository, never printed);
2. clears `HINGELAB_API_BASE` so a release always talks to `https://hingelab.vercel.app`;
3. runs `tauri build` (UI build, Rust release build with LTO, NSIS installer, updater signature);
4. verifies the installer's signature against the public key in `tauri.conf.json` with an independent implementation (`scripts/desktop/minisign.mjs`);
5. prints the installer path, size, SHA-256 and Authenticode status;
6. scans `desktop/dist`, `HingeLab.exe` and the installer for secrets and server code (`scripts/desktop/scan.mjs`) and fails if anything is found.

Output:

- `desktop/src-tauri/target/release/bundle/nsis/HingeLab_<version>_x64-setup.exe`: the installer (per-user install, no admin rights needed; about 2 MB).
- `…_x64-setup.exe.sig`: the updater signature (minisign, records the version).
- `desktop/src-tauri/target/release/HingeLab.exe`: the app itself.

Set the version first with `node scripts/desktop/version.mjs 1.0.1` (updates `tauri.conf.json` and `Cargo.toml`).

## Tests

```powershell
npx vitest run lib/desktop                       # server side, manifests, signature checks
cd desktop/src-tauri; cargo test                 # Rust core
```

End-to-end with the real app (local Supabase stack running, see `SETUP.md`):

```powershell
$env:NEXT_DIST_DIR = ".next-build"; npx next build
$env:HINGELAB_API_BASE = "http://127.0.0.1:3457"
cd desktop; npx tauri build --debug --features e2e --no-bundle; cd ..
Remove-Item Env:HINGELAB_API_BASE
node scripts/desktop/e2e.mjs                     # starts and stops the local server itself
node scripts/desktop/update-e2e.mjs              # builds, installs and updates a separate test app
```

`e2e.mjs` drives the app through WebView2's DevTools port and signs in through Playwright's browser; the `e2e` feature makes the app write the sign-in URL to a file instead of opening the default browser, and keeps its session in a separate Credential Manager entry (`session-e2e`). `update-e2e.mjs` uses a throwaway signing key made for the run, installs "HingeLab Update Test" for the current user, and uninstalls it at the end. Screenshots: `docs/screenshots/desktop-*.png`.

## Troubleshooting

- `cargo` not found: open a new terminal or add `%USERPROFILE%\.cargo\bin` to the path.
- `link.exe` not found: install the C++ Build Tools.
- The app window stays blank in `desktop:dev`: Vite must be on port 5174 (`strictPort`).
- "No updater signing key": set the two environment variables or create the key (see `DESKTOP_UPDATE_SYSTEM.md`, "Keys").
- Build fails with "secret / server-code scan FAILED": something that must not ship reached the bundle. Read the listed file and remove the import; do not weaken the scan.
