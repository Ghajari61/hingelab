import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { stripeConfigured } from "@/lib/stripe";
import { FREE_PROJECT_LIMIT, PLAN_ROWS, PRICES, planOf } from "@/lib/plans";
import { AppHeader } from "@/components/site/AppHeader";
import { ManageBilling, UpgradeButtons } from "@/components/billing/BillingActions";

export const metadata: Metadata = { title: "Billing · HingeLab" };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fbilling");
  const { checkout } = await searchParams;
  const { data: profile } = await session.supabase
    .from("profiles")
    .select("plan, plan_status, current_period_end, stripe_customer_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const plan = planOf(profile?.plan);
  const billing = stripeConfigured();
  const date = fmtDate(profile?.current_period_end ?? null);
  const status = profile?.plan_status ?? null;
  const ending = plan === "free" && status === "canceled";

  return (
    <div className="page site-page">
      <AppHeader current="billing" />
      <main className="boxes billing">
        <h1>Billing</h1>

        {checkout === "success" && plan !== "pro" && (
          <p className="auth-msg ok" role="status">Payment received. Pro turns on as soon as Stripe confirms it, usually within a few seconds. Refresh this page in a moment.</p>
        )}
        {checkout === "success" && plan === "pro" && <p className="auth-msg ok" role="status">Welcome to Pro. Every feature is now unlocked.</p>}
        {checkout === "cancel" && <p className="auth-msg err" role="status">Checkout was cancelled. You have not been charged.</p>}
        {!billing && (
          <p className="auth-msg err" role="status">Billing is not set up on this server yet. Plans are shown below, but upgrading is unavailable.</p>
        )}

        <section className="billing-current" aria-label="Your plan">
          <div>
            <h2>You are on the {plan === "pro" ? "Pro" : "Free"} plan</h2>
            <p>
              {plan === "pro" && status === "past_due" && "Your last payment failed. Stripe will retry; update your card under Manage billing to keep Pro."}
              {plan === "pro" && status !== "past_due" && (date ? `Renews on ${date}.` : "Thanks for supporting HingeLab.")}
              {plan === "free" && (ending ? "Your Pro subscription has ended." : `Free includes up to ${FREE_PROJECT_LIMIT} cloud projects and Rounded boxes with the Straight hinge.`)}
            </p>
          </div>
          {billing && profile?.stripe_customer_id && <ManageBilling />}
        </section>

        <div className="billing-plans">
          <section className="plan-card">
            <h3>Free</h3>
            <div className="plan-price">$0</div>
            <ul>{PLAN_ROWS.map((r) => <li key={r.feature}><b>{r.feature}:</b> {r.free === "✓" ? "Included" : r.free}</li>)}</ul>
          </section>
          <section className="plan-card pro">
            <h3>Pro</h3>
            <div className="plan-price">${PRICES.monthly}<small> / month, or ${PRICES.yearly} / year</small></div>
            <ul>{PLAN_ROWS.map((r) => <li key={r.feature}><b>{r.feature}:</b> {r.pro === "✓" ? "Included" : r.pro}</li>)}</ul>
            {plan === "free" && <UpgradeButtons disabled={!billing} />}
          </section>
        </div>
      </main>
    </div>
  );
}
