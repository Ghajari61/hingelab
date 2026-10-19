import "./harden";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setPlatform } from "@hingelab/platform";
import { tauriPlatform } from "@hingelab/platform/tauri";
import { App } from "./App";
import "@/styles/fonts";
import "@/styles/tokens.css";
import "@/app/globals.css";
import "@/app/site.css";
import "@/components/shell/shell.css";
import "./styles.css";

setPlatform(tauriPlatform());

async function start() {
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) (await import("./devMock")).installDevMock();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
void start();
