import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabaseConfigured } from "./config";
import type { Database } from "./types";

/** A Supabase client acting as the signed-in user (cookies), for server components, actions and routes. */
export async function createClient(): Promise<SupabaseClient<Database> | null> {
  if (!supabaseConfigured()) return null;
  const store = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server components cannot set cookies; the middleware refreshes the session instead.
        }
      },
    },
  });
}

/** The verified user (checked with the Supabase Auth server, not just read from the cookie). */
export async function getUser(): Promise<{ supabase: SupabaseClient<Database>; user: User } | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, user: data.user } : null;
}
