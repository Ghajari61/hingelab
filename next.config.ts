import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a production build run next to `next dev` (NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // HarfBuzz and manifold-3d load their own .wasm next to their modules, so the server must import them from node_modules.
  serverExternalPackages: ["harfbuzzjs", "manifold-3d"],
  // The Letters export builds the SVG on the server from the bundled fonts; Parametric re-slices with manifold.
  outputFileTracingIncludes: {
    "/api/export": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**", "./node_modules/manifold-3d/*.wasm", "./node_modules/manifold-3d/*.js"],
  },
};

export default nextConfig;
