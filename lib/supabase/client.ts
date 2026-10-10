"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

/** The browser client, shared by every component. Null in guest mode (no Supabase settings). */
export function getBrowserClient(): SupabaseClient<Database> | null {
  if (!supabaseConfigured()) return null;
  browserClient ??= createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  return browserClient;
}
