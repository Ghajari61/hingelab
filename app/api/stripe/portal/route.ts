import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { getStripe, siteURL, stripeConfigured } from "@/lib/stripe";

/** Opens the Stripe Customer Portal (cancel, change card, switch monthly/yearly). */
export async function POST(request: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing is not set up yet." }, { status: 503 });
  const session = await getUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
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
