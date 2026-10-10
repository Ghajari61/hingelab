import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getStripe, siteURL, stripeConfigured } from "@/lib/stripe";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/** Opens the Stripe Customer Portal (cancel, change card, switch monthly/yearly). */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  if (!isJSONRequest(request)) return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing is not set up yet." }, { status: 503 });
  const session = await getUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limited = await rateLimit(LIMITS.portal, `user:${session.user.id}`);
  if (!limited.ok) return tooManyRequests(limited);
  const { data: profile } = await session.supabase.from("profiles").select("stripe_customer_id").eq("id", session.user.id).single();
  if (!profile?.stripe_customer_id) return NextResponse.json({ error: "You have no billing account yet. Upgrade to Pro first." }, { status: 404 });
  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${siteURL(request.nextUrl.origin)}/app/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (e) {
    console.error("stripe portal failed", e);
    return NextResponse.json({ error: "Could not open billing. Try again in a minute." }, { status: 502 });
  }
}
