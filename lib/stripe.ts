import "server-only";
import Stripe from "stripe";

/**
 * Billing works when the secret key is set and either the original Pro prices (grandfathered
 * $9/$79) or the new Pro prices are set. A missing price for one plan fails that checkout only.
 */
export function stripeConfigured(): boolean {
  const secret = !!process.env.STRIPE_SECRET_KEY;
  const legacy = !!(process.env.STRIPE_PRICE_PRO_MONTHLY && process.env.STRIPE_PRICE_PRO_YEARLY);
  const next = !!(process.env.PRICE_PRO_MONTHLY && process.env.PRICE_PRO_YEARLY);
  return secret && (legacy || next);
}

export type CheckoutPlan = "pro" | "business" | "lifetime";

/** Price id for a new checkout. Never the grandfathered $9/$79 prices. Null when that env var is unset. */
export function checkoutPriceId(plan: CheckoutPlan, interval: "month" | "year"): string | null {
  const id = plan === "lifetime"
    ? process.env.PRICE_LIFETIME
    : plan === "business"
      ? (interval === "year" ? process.env.PRICE_BUSINESS_YEARLY : process.env.PRICE_BUSINESS_MONTHLY)
      : (interval === "year" ? process.env.PRICE_PRO_YEARLY : process.env.PRICE_PRO_MONTHLY);
  return id || null;
}

/**
 * Server-side Stripe client. Live keys are refused unless STRIPE_ALLOW_LIVE=true, so a live key
 * pasted by mistake cannot charge real cards before the owner decides to launch.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("A live Stripe key is set but STRIPE_ALLOW_LIVE is not true. Use test keys until launch.");
  }
  return new Stripe(key, { appInfo: { name: "HingeLab" } });
}

export function siteURL(fallback: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallback).replace(/\/$/, "");
}
