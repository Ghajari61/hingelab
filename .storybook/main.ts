import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  viteFinal: async (c) => {
    c.resolve = c.resolve ?? {};
    c.resolve.alias = { ...(c.resolve.alias as Record<string, string> | undefined), "@": root };
    return c;
  },
};

export default config;
