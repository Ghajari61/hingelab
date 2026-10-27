import "server-only";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { effectivePlan, type Plan } from "@/lib/plans";

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
  const { data } = await session.supabase.from("profiles").select("plan, current_period_end").eq("id", session.user.id).maybeSingle();
  return { plan: effectivePlan(data?.plan, data?.current_period_end), userId: session.user.id };
}

/**
 * `currentPlan` for routes the Windows app also calls: a bearer token is the app's session (checked
 * like every desktop call, version first); otherwise the website's cookie session. A refused token
 * answers with the desktop error (401 or 426) so the app signs out or asks for an update.
 */
export async function requestPlan(request: Request): Promise<{ plan: Plan; userId: string | null } | Response> {
  if (!/^bearer\s/i.test(request.headers.get("authorization") ?? "")) return currentPlan();
  const { requireDesktopUser } = await import("@/lib/desktop/http");
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  const { desktopProfile } = await import("@/lib/desktop/session");
  return { plan: (await desktopProfile(who.userId)).plan, userId: who.userId };
}
