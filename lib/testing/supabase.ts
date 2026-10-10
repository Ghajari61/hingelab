/**
 * Helpers for integration tests against the local Supabase stack (`npx supabase start`).
 * Every helper is a no-op target when the stack is not reachable, so `npm test` still runs offline.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True when the local stack answers. Only local URLs count, so tests never touch a hosted project. */
export async function localSupabaseUp(): Promise<boolean> {
  if (!URL || !ANON || !SERVICE || !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URL)) return false;
  try {
    const res = await fetch(`${URL}/auth/v1/health`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

export function adminClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Creates a confirmed user with a random email and returns a client signed in as that user. */
export async function newUser(tag: string): Promise<{ client: SupabaseClient<Database>; id: string; email: string }> {
  const email = `test-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hingelab.test`;
  const password = "test-password-123";
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const client = createClient<Database>(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, id: data.user.id, email };
}

export async function deleteUser(id: string) {
  await adminClient().auth.admin.deleteUser(id);
}
