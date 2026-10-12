import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** The desktop app's UI: a static bundle loaded by the Tauri window (no server code, no secrets). */
export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: { port: 5174, strictPort: true, host: "localhost" },
  envPrefix: ["HINGELAB_PUBLIC_"],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    // The 3D view (three.js) is its own chunk of about 600 kB, loaded when 3D is first opened.
    chunkSizeWarningLimit: 700,
    // Tauri's CSP has no 'unsafe-eval' and no inline scripts.
    modulePreload: { polyfill: false },
  },
});
