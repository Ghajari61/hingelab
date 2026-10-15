import { desktopError, desktopJSON, RELEASES, requireDesktopUser } from "@/lib/desktop/http";
import { minimumVersion } from "@/lib/desktop/releases";
import { desktopProfile } from "@/lib/desktop/session";
import type { DesktopAccount } from "@/lib/desktop/types";
import { formatVersion } from "@/lib/desktop/version";
import { hasPro } from "@/lib/plans";

/** The signed-in desktop user, their plan as the server sees it, and what it unlocks. */
export async function GET(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  try {
    const p = await desktopProfile(who.userId);
    const paid = hasPro(p.plan);
    const body: DesktopAccount = {
      user: { id: who.userId, email: p.email, name: p.name },
      // 1.0.31 treats only plan "pro" as paid. Business and Lifetime stay "pro" here so that app keeps their features.
      plan: paid ? "pro" : "free",
      tier: p.plan,
      status: p.status,
      periodEnd: p.periodEnd,
      entitlements: { cleanExport: paid, proShapes: paid, proGenerators: paid },
      minimumVersion: formatVersion(minimumVersion(RELEASES)),
    };
    return desktopJSON(body);
  } catch (e) {
    console.error("desktop me failed", e);
    return desktopError("server_error", "Could not load your account. Try again.", 500);
  }
}
