import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { stripeConfigured } from "@/lib/stripe";
import { lockedPriceCopyFor } from "@/lib/billing/grandfather";
import { BUSINESS_SEATS, COMMERCIAL_LICENSE, PLAN_ROWS, PRICES, hasPro, planLabel, planOf } from "@/lib/plans";
import { AppHeader } from "@/components/site/AppHeader";
import { ManageBilling, UpgradeButtons } from "@/components/billing/BillingActions";

export const metadata: Metadata = { title: "Billing · HingeLab" };

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : null;
}

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string; plan?: string }> }) {
  const session = await getUser();
  if (!session) redirect("/login?next=%2Fapp%2Fbilling");
  const { checkout } = await searchParams;
  const { data: profile } = await session.supabase
    .from("profiles")
    .select("plan, plan_status, current_period_end, stripe_customer_id")
    .eq("id", session.user.id)
    .maybeSingle();
  const plan = planOf(profile?.plan);
  const paid = hasPro(plan);
  const label = planLabel(plan);
  const billing = stripeConfigured();
  const date = fmtDate(profile?.current_period_end ?? null);
  const status = profile?.plan_status ?? null;
  const ending = plan === "free" && status === "canceled";
  const locked = plan === "pro" ? await lockedPriceCopyFor(profile?.stripe_customer_id) : null;

  return (
    <div className="page site-page">
      <AppHeader current="billing" />
      <main className="boxes billing">
        <h1>Billing</h1>

        {checkout === "success" && !paid && (
          <p className="auth-msg ok" role="status">Payment received. Your plan turns on as soon as Stripe confirms it, usually within a few seconds. Refresh this page in a moment.</p>
        )}
        {checkout === "success" && paid && <p className="auth-msg ok" role="status">You&apos;re all set. Your plan is now {label}.</p>}
        {checkout === "cancel" && <p className="auth-msg err" role="status">Checkout was cancelled. You have not been charged.</p>}
        {!billing && (
          <p className="auth-msg err" role="status">Billing is not set up on this server yet. Plans are shown below, but upgrading is unavailable.</p>
        )}

        <section className="billing-current" aria-label="Your plan">
          <div>
            <h2>You are on the {label} plan</h2>
            {locked && <p className="auth-msg ok" role="status">{locked}</p>}
            <p>
              {plan === "pro" && status === "past_due" && "Your last payment failed. Stripe will retry; update your card under Manage billing to keep Pro."}
              {plan === "business" && status === "past_due" && "Your last payment failed. Stripe will retry; update your card under Manage billing to keep Business."}
              {plan === "pro" && status !== "past_due" && (date ? `Renews on ${date}.` : "Thanks for supporting HingeLab.")}
              {plan === "business" && status !== "past_due" && (date ? `Renews on ${date}.` : "Thanks for supporting HingeLab.")}
              {plan === "lifetime" && "Pro features, forever. This was a one-time purchase."}
              {plan === "free" && (ending ? "Your subscription has ended." : "Free lets you preview designs. Saving, exporting and cloud projects need Pro.")}
            </p>
          </div>
          {billing && profile?.stripe_customer_id && <ManageBilling />}
        </section>

        <div className="billing-plans">
          <section className="plan-card" id="plan-free">
            <h3>Free</h3>
            <div className="plan-price">$0</div>
            <ul>{PLAN_ROWS.map((r) => <li key={r.feature}><b>{r.feature}:</b> {r.free === "✓" ? "Included" : r.free}</li>)}</ul>
          </section>
          <section className="plan-card pro" id="plan-pro">
            <h3>Pro</h3>
            <div className="plan-price">${PRICES.monthly}<small> / month, or ${PRICES.yearly} / year</small></div>
            <ul>{PLAN_ROWS.map((r) => <li key={r.feature}><b>{r.feature}:</b> {r.pro === "✓" ? "Included" : r.pro}</li>)}</ul>
            {plan === "free" && <UpgradeButtons disabled={!billing} />}
          </section>
          <section className="plan-card" id="plan-business">
            <h3>Business</h3>
            <div className="plan-price">${PRICES.businessMonthly}<small> / month, or ${PRICES.businessYearly} / year</small></div>
            <ul>
              <li><b>Includes:</b> Everything in Pro</li>
              <li><b>Batches:</b> Unlimited</li>
              <li><b>Devices:</b> {BUSINESS_SEATS}</li>
              <li><b>License:</b> {COMMERCIAL_LICENSE}</li>
              <li><b>Support:</b> Priority support</li>
            </ul>
            {plan !== "business" && plan !== "lifetime" && <UpgradeButtons plan="business" disabled={!billing} />}
          </section>
        </div>
      </main>
    </div>
  );
}
