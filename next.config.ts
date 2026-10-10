import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Lets a production build run next to `next dev` (NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // HarfBuzz loads its own .wasm next to its module, so the server must import it from node_modules.
  serverExternalPackages: ["harfbuzzjs"],
  // The Letters export builds the SVG on the server from the bundled fonts.
  outputFileTracingIncludes: {
    "/api/export": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**"],
  },
};

export default nextConfig;
