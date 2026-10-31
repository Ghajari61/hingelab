# Start-up splash

A 3D reveal of the HingeLab title among laser-cut pieces, played while the app starts, on a transparent background.

## What it is

The title is extruded from real Cinzel Bold outlines: "Hinge" in brushed champagne gold, and "Lab" in graphite with gold edges. Around it:

- A walnut box with interlocking finger joints that assembles from an exploded view.
- A bronze mandala panel.
- A technical drawing that draws itself in midnight blue.
- A dovetail joint and finger-joint pieces.
- A fine gold laser beam cutting the mandala.
- Gold dust in the air.

There are no images or downloads. The wood grain and glow are drawn on canvases, reflections come from three.js's RoomEnvironment, and the title outlines are generated ahead of time.

| Time | Phase |
|---|---|
| 0–0.6 s | Particles and drawing lines appear, and the title rises out of depth. |
| 0.6–1.8 s | The panels slide in and the fingers interlock. The outlines turn into wood, the mandala turns into view and the laser cuts. |
| 1.8–2.6 s | A soft gold light sweeps across the title and everything settles. |
| 2.6–3.0 s | Fade and scale down, only once the app is ready. |

It never delays the app:

- **Starts at once:** it plays while the app loads.
- **App ready early:** the remaining reveal plays faster instead of being cut.
- **App still starting after 2.6 s:** it holds quietly. It shows the app's real start-up step ("Checking your sign-in", "Opening your workspace"); there are no made-up percentages.

## Files

| File | What |
|---|---|
| `components/splash/scene.ts` | The three.js scene and timeline: `createSplashScene(canvas, { onExitStart, onDone, onHold, still })` returns `{ ready(), dispose() }`. |
| `components/splash/Splash.tsx` | The React component: WebGL or the CSS fallback, reduced motion, and the hold status. |
| `components/splash/splash.css` | Layout (transparent, no backdrop), the CSS fallback and the status line. |
| `components/splash/title.generated.ts` | The "Hinge" and "Lab" outlines. Rebuild with `npx vite-node -c vitest.config.ts scripts/build-splash-title.ts`. |
| `components/splash/WebSplash.tsx` | The website: once per browser session, over `/app/*` and the Studio pages (`/home`, `/templates`, the Studio editor). |
| `app/app/layout.tsx`, `app/(studio)/layout.tsx` | Where the website mounts it. |
| `desktop/splash.html`, `desktop/src/splash.tsx` | The desktop splash window's page. |
| `desktop/src-tauri/src/splash.rs` | The splash window and its commands (`app_ready`, `splash_progress`, `splash_state`, `splash_done`). |
| `desktop/src-tauri/capabilities/splash.json` | The splash window's only permissions: listen to events, `splash_state` and `splash_done`. |
| `desktop/src/App.tsx` | Reports the real start-up steps, and `app_ready` once its first screen is drawn. |
| `desktop/vite.config.ts` | Builds `splash.html` as a second page. |

## Desktop start-up

1. Rust opens the splash window first: 820 × 480, transparent, undecorated, always on top, not in the taskbar. The main window loads hidden.
2. The main UI sends `splash_progress` steps, then `app_ready` after its first screen has been drawn.
3. The splash finishes its reveal. As its fade begins it calls `splash_done`: the main window shows and takes focus, and the splash window closes after the 450 ms fade.

Safety nets:

- If the splash window cannot be made, the main window shows when its page loads, as before.
- If the splash does not finish within 4 s of `app_ready`, the main window shows anyway.
- If the UI never reports ready (a start-up error), the main window shows after 25 s.
- `splash_state` gives the splash anything it missed while loading.
- The window-state plugin ignores the splash window.

## Fallbacks and accessibility

- **No WebGL:** the title is drawn in CSS (gold and graphite, with the same font), rising and catching a light sweep.
- **Reduce motion:** the finished composition fades in, then fades out once the app is ready.
- **Pointer:** on the website the layer takes no pointer input, so the page underneath stays usable.
- **Clean-up:** every geometry, material, texture, the environment map and the renderer are disposed when the splash closes, and the ResizeObserver and animation frame are released.

## How to test

- **Website:** open `/home?splash=1` (it shows once per session; `?splash=0` turns it off). Automated browsers skip it unless `?splash=1` is set.
- **Inspect a frame:** `?splash=1&splash-debug&splash-t=1.2` freezes the timeline at 1.2 s, and `window.__hlSplash` shows the state.
- **Desktop bundle:** `npm run desktop:ui:build`, then `node scripts/desktop/bundle-smoke.mjs`. It checks that the splash page runs under the window's CSP and hands over with `splash_done`.
- **Desktop app:** `npm run desktop:dev`. The splash shows over the desktop, and the main window appears as it fades.
- **Not verified here:** transparency itself needs a real desktop. Windows (WebView2) supports it; on Linux it needs a compositor.
