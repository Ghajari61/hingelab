import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planOf, planRank, type Plan } from "@/lib/plans";
import { checkoutPriceId, getStripe, siteURL, stripeConfigured, type CheckoutPlan } from "@/lib/stripe";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/**
 * Starts Stripe Checkout for a new Pro or Business subscription. The price id comes from the new
 * PRICE_* env vars. Existing $9/$79 subscriptions are not changed here. Founder Lifetime is not
 * offered for new purchases.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  if (!isJSONRequest(request)) return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  if (!stripeConfigured()) return NextResponse.json({ error: "Billing is not set up yet." }, { status: 503 });
  const session = await getUser();
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const limited = await rateLimit(LIMITS.checkout, `user:${session.user.id}`);
  if (!limited.ok) return tooManyRequests(limited);

  const body = (await request.json().catch(() => ({}))) as { interval?: string; plan?: string };
  if (body.plan === "lifetime") return NextResponse.json({ error: "Founder Lifetime is not available." }, { status: 409 });
  const interval = body.interval === "year" ? "year" : "month";
  const target: CheckoutPlan = body.plan === "business" ? "business" : "pro";
  const price = checkoutPriceId(target, interval);
  if (!price) return NextResponse.json({ error: "This plan is not available yet." }, { status: 503 });

  const { user } = session;
  const admin = createAdminClient();
  const stripe = getStripe();
  const { data: profile } = await admin.from("profiles").select("stripe_customer_id, plan").eq("id", user.id).single();
  const current = planOf(profile?.plan);
  const blocked = checkoutBlocked(current, target);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 409 });

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
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${base}/app/billing?checkout=success`,
      cancel_url: `${base}/app/billing?checkout=cancel`,
      subscription_data: { metadata: { user_id: user.id, plan: target } },
    });
    return NextResponse.json({ url: checkout.url });
  } catch (e) {
    console.error("stripe checkout failed", e);
    return NextResponse.json({ error: "Could not start checkout. Try again in a minute." }, { status: 502 });
  }
}

function checkoutBlocked(current: Plan, target: CheckoutPlan): string | null {
  if (current === "business") return "You are already on Business. Use Manage billing to change your plan.";
  if (current === target) return "You are already on this plan. Use Manage billing to change it.";
  if (target === "pro" && (current === "lifetime" || planRank(current) > planRank("pro"))) {
    return "You already have Pro features. Business is the upgrade from here.";
  }
  return null;
}
