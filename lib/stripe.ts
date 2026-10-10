import "server-only";
import Stripe from "stripe";

/** Billing works only when the secret key and both Pro prices are set. */
export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO_MONTHLY && process.env.STRIPE_PRICE_PRO_YEARLY);
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

export function priceId(interval: "month" | "year"): string {
  const id = interval === "year" ? process.env.STRIPE_PRICE_PRO_YEARLY : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!id) throw new Error("Stripe price ids are not set");
  return id;
}

export function siteURL(fallback: string): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || fallback).replace(/\/$/, "");
}
