import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe, priceId, siteURL, stripeConfigured } from "@/lib/stripe";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/**
 * Starts a Stripe Checkout for Pro (monthly or yearly) for the signed-in user. Only the interval
 * comes from the request; the price, customer and user id are decided here.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  if (!isJSONRequest(request)) return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing is not set up yet." }, { status: 503 });
  const session = await getUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limited = await rateLimit(LIMITS.checkout, `user:${session.user.id}`);
  if (!limited.ok) return tooManyRequests(limited);

  const body = (await request.json().catch(() => ({}))) as { interval?: string };
  const interval = body.interval === "year" ? "year" : "month";
  const { user } = session;
  const admin = createAdminClient();
  const stripe = getStripe();

  const { data: profile } = await admin.from("profiles").select("stripe_customer_id, plan").eq("id", user.id).single();
  if (profile?.plan === "pro") return NextResponse.json({ error: "You are already on Pro. Use Manage billing to change your plan." }, { status: 409 });

  try {
    let customer = profile?.stripe_customer_id ?? null;
    if (!customer) {
      const created = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customer = created.id;
      const { error } = await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
      if (error) throw error;
    }

    const base = siteURL(request.nextUrl.origin);
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price: priceId(interval), quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/app/billing?checkout=success`,
      cancel_url: `${base}/app/billing?checkout=cancel`,
      subscription_data: { metadata: { user_id: user.id } },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("stripe checkout failed", e);
    return NextResponse.json({ error: "Could not start checkout. Try again in a minute." }, { status: 502 });
  }
}
