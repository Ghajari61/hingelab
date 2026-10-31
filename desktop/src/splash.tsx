/**
 * The splash window's page: the shared 3D reveal, told by the Rust side when the main window's UI
 * is ready (`app-ready`) and what real start-up step it is on (`splash-progress`). It asks for what
 * it missed while loading (`splash_state`) and calls `splash_done` as its fade begins, so the main
 * window appears beneath it.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Splash } from "@/components/splash/Splash";

function SplashWindow() {
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const offs = [listen("app-ready", () => setReady(true)), listen<string>("splash-progress", (e) => setStatus(e.payload))];
    void invoke<{ ready: boolean; status: string }>("splash_state").then((s) => { if (s.ready) setReady(true); if (s.status) setStatus(s.status); }).catch(() => {});
    return () => { for (const o of offs) void o.then((f) => f()); };
  }, []);
  if (gone) return null;
  return <Splash variant="window" ready={ready} status={status} onExitStart={() => void invoke("splash_done").catch(() => {})} onDone={() => setGone(true)} />;
}

createRoot(document.getElementById("splash")!).render(<StrictMode><SplashWindow /></StrictMode>);
