import type { Preview } from "@storybook/react-vite";
import { useEffect } from "react";
import { ToastProvider } from "../components/ui";
import "../styles/tokens.css";

const preview: Preview = {
  globalTypes: {
    theme: { description: "Theme", toolbar: { title: "Theme", items: ["dark", "darker", "light"], dynamicTitle: true } },
    accent: { description: "Accent", toolbar: { title: "Accent", items: ["blue", "violet", "teal", "orange"], dynamicTitle: true } },
  },
  initialGlobals: { theme: "dark", accent: "blue" },
  decorators: [
    (Story, ctx) => {
      const { theme, accent } = ctx.globals as { theme: string; accent: string };
      useEffect(() => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.dataset.accent = accent;
      }, [theme, accent]);
      return (
        <ToastProvider>
          <div style={{ background: "var(--surface-panel)", color: "var(--text-primary)", fontFamily: "var(--font-ui)", fontSize: 13, padding: 24, minHeight: "100vh" }}>
            <Story />
          </div>
        </ToastProvider>
      );
    },
  ],
  parameters: { layout: "fullscreen", a11y: { test: "error" } },
};

export default preview;
