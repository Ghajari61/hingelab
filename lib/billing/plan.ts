import "server-only";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { planOf, type Plan } from "@/lib/plans";

/**
 * The caller's plan, read on the server. Signed-out visitors are on Free. Without Supabase there
 * are no accounts and nothing to buy, so everything is open (same rule as `usePlan`).
 */
export async function currentPlan(): Promise<{ plan: Plan; userId: string | null }> {
  if (!supabaseConfigured()) return { plan: "pro", userId: null };
  const session = await getUser();
  if (!session) return { plan: "free", userId: null };
  const { data } = await session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle();
  return { plan: planOf(data?.plan), userId: session.user.id };
}
