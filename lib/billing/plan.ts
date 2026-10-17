import "server-only";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { planOf, type Plan } from "@/lib/plans";

/**
 * The caller's plan, read on the server. Signed-out visitors are on Free. Without Supabase there
 * are no accounts and nothing to buy, so everything is open (same rule as `usePlan`) - except on a
 * production deployment, where missing configuration must not unlock Pro.
 */
export async function currentPlan(): Promise<{ plan: Plan; userId: string | null }> {
  // `next dev` only (production builds set NODE_ENV=production): a signed-in Pro user for local end-to-end tests.
  if (process.env.NODE_ENV === "development" && process.env.HINGELAB_DEV_USER) return { plan: "pro", userId: process.env.HINGELAB_DEV_USER };
  if (!supabaseConfigured()) return { plan: process.env.VERCEL_ENV === "production" ? "free" : "pro", userId: null };
  const session = await getUser();
  if (!session) return { plan: "free", userId: null };
  const { data } = await session.supabase.from("profiles").select("plan").eq("id", session.user.id).maybeSingle();
  return { plan: planOf(data?.plan), userId: session.user.id };
}
