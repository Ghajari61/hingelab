"use client";

/**
 * The splash on the website: once per browser session, over the app as it loads (no backdrop, and
 * clicks pass through, so it never holds the page up). Skipped for automated browsers unless the
 * address asks for it with ?splash=1, and with ?splash=0.
 */
import { useEffect, useState } from "react";
import { Splash } from "./Splash";

const KEY = "hingelab-splash-shown";

export function WebSplash() {
  const [show, setShow] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("splash");
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === "1"; sessionStorage.setItem(KEY, "1"); } catch { /* storage blocked: show it */ }
    if (q === "0" || (q !== "1" && (seen || navigator.webdriver))) return;
    setShow(true);
    // ready once the page has loaded and drawn its first frame
    const go = () => requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, []);

  if (!show) return null;
  return <Splash ready={ready} onDone={() => setShow(false)} />;
}
