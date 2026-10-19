import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseConfigured } from "./config";
import type { Database } from "./types";

/**
 * The browser client, loaded on first use: supabase-js is about 65 kB gzipped, and the landing page,
 * the editors and guest visitors don't need it before the page is up. Null in guest mode.
 */
export function loadBrowserClient(): Promise<SupabaseClient<Database> | null> {
  if (!supabaseConfigured()) return Promise.resolve(null);
  return import("./client").then((m) => m.getBrowserClient());
}

/** `loadBrowserClient` once the page has painted and gone quiet (at most `wait` ms later): for the session check, which nothing on screen waits for. */
export function loadBrowserClientWhenIdle(wait = 1500): Promise<SupabaseClient<Database> | null> {
  if (!supabaseConfigured()) return Promise.resolve(null);
  return new Promise((done) => {
    const go = () => void loadBrowserClient().then(done, () => done(null));
    if (typeof window !== "undefined" && "requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: wait });
    else setTimeout(go, 200);
  });
}
