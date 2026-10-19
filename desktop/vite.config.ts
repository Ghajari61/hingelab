import { cpSync, createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const repo = resolve(__dirname, "..");

/**
 * The website's files the shared editors load at run time: fonts and HarfBuzz (Letters), Manifold
 * (Parametric), preset and option pictures. Copied into the app; the rest of public/ (installers,
 * help screenshots, the 50 MB photo-depth model) stays on the website.
 */
const PUBLIC_DIRS = ["fonts", "hb", "manifold", "presets", "rail"];

const TYPES: Record<string, string> = { ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".wasm": "application/wasm", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json" };

function sharedPublic(): Plugin {
  return {
    name: "hingelab-shared-public",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = decodeURIComponent((req.url ?? "").split("?")[0]);
        const top = path.split("/")[1];
        if (!PUBLIC_DIRS.includes(top)) return next();
        const file = normalize(join(repo, "public", path));
        if (!file.startsWith(join(repo, "public") + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(opts) {
      const out = opts.dir ?? resolve(__dirname, "dist");
      for (const d of PUBLIC_DIRS) cpSync(join(repo, "public", d), join(out, d), { recursive: true });
    },
  };
}

/**
 * The app's UI: the website's editors (packages/app, components/, lib/) and the Windows shell,
 * bundled with the window. No server code and no secrets: scripts/desktop/scan.mjs checks the output.
 */
export default defineConfig(({ mode }) => ({
  root: __dirname,
  base: "./",
  publicDir: false,
  plugins: [react(), sharedPublic()],
  clearScreen: false,
  server: { port: 5174, strictPort: true, host: "localhost", fs: { allow: [repo] } },
  envPrefix: ["HINGELAB_PUBLIC_"],
  resolve: {
    alias: [
      { find: /^@hingelab\/platform$/, replacement: resolve(repo, "packages/platform/src/index.ts") },
      { find: /^@hingelab\/platform\/(.*)$/, replacement: resolve(repo, "packages/platform/src/$1") },
      { find: /^@hingelab\/app\/(.*)$/, replacement: resolve(repo, "packages/app/src/$1") },
      { find: /^@hingelab\/ui\/(.*)$/, replacement: resolve(repo, "packages/ui/src/$1") },
      { find: /^@\//, replacement: `${repo}/` },
    ],
  },
  // The shared code reads the website's public settings; the app has none (accounts go through Rust).
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
    "process.env": "{}",
  },
  worker: { format: "es" },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: false,
    // three.js and the Parametric engine are their own chunks, loaded when first used.
    chunkSizeWarningLimit: 900,
    // Tauri's CSP has no 'unsafe-eval' and no inline scripts.
    modulePreload: { polyfill: false },
    rollupOptions: {
      onwarn(w, warn) {
        // "use client" marks the website's client components; it means nothing here.
        if (w.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(w);
      },
    },
  },
}));
