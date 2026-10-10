import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "path";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    // .env.local gives the integration tests the local Supabase stack; they skip themselves when it is down.
    env: loadEnv("test", process.cwd(), ""),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js marker package; inside Vitest the server modules may be imported directly.
      "server-only": path.resolve(__dirname, "lib/testing/empty.ts"),
    },
  },
});
