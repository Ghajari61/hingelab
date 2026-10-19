import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import { contentSecurityPolicy, securityHeaders } from "./lib/security/headers";

const site = {
  dev: process.env.NODE_ENV !== "production",
  https: !!process.env.VERCEL,
  preview: process.env.VERCEL_ENV === "preview",
  supabaseURL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  depthModelURL: process.env.NEXT_PUBLIC_DEPTH_MODEL_URL,
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets a production build run next to `next dev` (NEXT_DIST_DIR=.next-build npm run build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // HarfBuzz and manifold-3d load their own .wasm next to their modules, so the server must import them from node_modules.
  // resvg is a native module (the AI designer renders its drawings to look at them).
  serverExternalPackages: ["harfbuzzjs", "manifold-3d", "@resvg/resvg-js"],
  // The Letters export builds the SVG on the server from the bundled fonts; Parametric re-slices with manifold.
  // The AI designer outlines text with the same fonts and renders with resvg.
  outputFileTracingIncludes: {
    "/api/export": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**", "./node_modules/manifold-3d/*.wasm", "./node_modules/manifold-3d/*.js"],
    "/api/ai/design": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**", "./node_modules/@resvg/**"],
    "/api/desktop/ai": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**", "./node_modules/@resvg/**"],
    "/api/desktop/generate": ["./public/fonts/*.ttf", "./public/fonts/*.otf", "./node_modules/harfbuzzjs/dist/**", "./node_modules/manifold-3d/*.wasm", "./node_modules/manifold-3d/*.js"],
    "/api/ai/examples": ["./node_modules/@resvg/**"],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(site) },
      { source: "/((?!api/).*)", headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy(site) }] },
    ];
  },
};

// `npm run analyze` writes per-route bundle reports to .next/analyze (ANALYZE=1).
const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "1", openAnalyzer: false });

export default withAnalyzer(nextConfig);
