import { NextResponse } from "next/server";
import { currentPlan } from "@/lib/billing/plan";
import { anyProvider } from "@/lib/ai/providers/config";
import { COSTS, HIGH_QUALITY_EXTRA, STUDIO_DAILY } from "@/lib/ai/studio/credits";
import { hasPro } from "@/lib/plans";

/** What AI Studio can do for this visitor: sign-in, plan, daily credits and whether the cloud tools are set up. */
export async function GET() {
  const { plan, userId } = await currentPlan();
  return NextResponse.json(
    { signedIn: !!userId, plan, daily: STUDIO_DAILY[plan], costs: COSTS, highExtra: HIGH_QUALITY_EXTRA, highQuality: hasPro(plan), cloud: anyProvider(process.env) },
    { headers: { "cache-control": "no-store" } },
  );
}
