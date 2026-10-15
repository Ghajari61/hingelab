import "server-only";
import { FOUNDER_CAP } from "@/lib/plans";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/config";

/**
 * Seats still unsold. Null when the database function is missing or Supabase is not configured —
 * the card stays up, without a made-up count, and checkout refuses to sell a seat it cannot count.
 */
export async function founderSeatsLeft(): Promise<number | null> {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  try {
    const admin = createAdminClient();
    const rpc = await admin.rpc("founder_seats_left");
    if (!rpc.error && typeof rpc.data === "number" && Number.isFinite(rpc.data)) {
      return Math.max(0, Math.min(FOUNDER_CAP, rpc.data));
    }
    const counted = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("founder", true);
    if (counted.error || counted.count == null) return null;
    return Math.max(0, FOUNDER_CAP - counted.count);
  } catch {
    return null;
  }
}
