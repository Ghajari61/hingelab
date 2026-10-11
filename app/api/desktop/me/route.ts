import { desktopError, desktopJSON, RELEASES, requireDesktopUser } from "@/lib/desktop/http";
import { minimumVersion } from "@/lib/desktop/releases";
import { desktopProfile } from "@/lib/desktop/session";
import type { DesktopAccount } from "@/lib/desktop/types";
import { formatVersion } from "@/lib/desktop/version";

/** The signed-in desktop user, their plan as the server sees it, and what it unlocks. */
export async function GET(request: Request) {
  const who = await requireDesktopUser(request);
  if (who instanceof Response) return who;
  try {
    const p = await desktopProfile(who.userId);
    const pro = p.plan === "pro";
    const body: DesktopAccount = {
      user: { id: who.userId, email: p.email, name: p.name },
      plan: p.plan,
      status: p.status,
      periodEnd: p.periodEnd,
      entitlements: { cleanExport: pro, proShapes: pro, proGenerators: pro },
      minimumVersion: formatVersion(minimumVersion(RELEASES)),
    };
    return desktopJSON(body);
  } catch (e) {
    console.error("desktop me failed", e);
    return desktopError("server_error", "Could not load your account. Try again.", 500);
  }
}
