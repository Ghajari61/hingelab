// Lint for the web app, the shared packages and the desktop UI (see DECISIONS.md R5).
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  {
    ignores: [
      ".next*/**", "node_modules/**", "desktop/dist/**", "desktop/src-tauri/**", "storybook-static/**", "public/**",
      "tmp/**", "vendor/**", "samples/**", "**/*.generated.ts", "next-env.d.ts", "dist/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Rules with many existing hits start as warnings (DECISIONS.md R5); new code keeps them clean.
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-unused-expressions": "warn",
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "warn",
      "@next/next/no-html-link-for-pages": "off",
      "prefer-const": "warn",
    },
  },
  {
    // Node scripts written as CommonJS.
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // The shared app and platform packages never reach for a host directly.
    files: ["packages/app/**", "packages/ui/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["next/*", "@tauri-apps/*"], message: "Shared code goes through @hingelab/platform." }] }],
    },
  },
];
