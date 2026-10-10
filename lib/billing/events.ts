/**
 * Stripe webhook events → profile updates. The storage side is injected so the logic can be
 * tested without Stripe or Supabase.
 */
import type Stripe from "stripe";
import { planForStatus, type Plan } from "@/lib/plans";

export type ProfilePatch = {
  plan?: Plan;
  plan_status?: string | null;
  current_period_end?: string | null;
  stripe_customer_id?: string;
};

export type BillingStore = {
  /** Updates the profile of the Stripe customer; returns false when no profile has that customer. */
  updateByCustomer: (customerId: string, patch: ProfilePatch) => Promise<boolean>;
  /** Links a customer to a user (checkout started before the customer id was saved). */
  updateByUser: (userId: string, patch: ProfilePatch) => Promise<boolean>;
  retrieveSubscription: (id: string) => Promise<Stripe.Subscription>;
};

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

/** Billing period end; recent API versions keep it on the subscription items. */
export function periodEnd(sub: Stripe.Subscription): string | null {
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const fromItems = sub.items?.data?.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  const t = typeof legacy === "number" ? legacy : fromItems?.length ? Math.max(...fromItems) : null;
  return t ? new Date(t * 1000).toISOString() : null;
}

export function patchFromSubscription(sub: Stripe.Subscription): ProfilePatch {
  return { plan: planForStatus(sub.status), plan_status: sub.status, current_period_end: periodEnd(sub) };
}

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
] as const;

/** Applies one verified event. Returns a short description for the logs. */
export async function handleStripeEvent(event: Stripe.Event, store: BillingStore): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.mode !== "subscription") return "ignored: not a subscription checkout";
      const customer = idOf(s.customer);
      const subId = idOf(s.subscription);
      if (!customer || !subId) return "ignored: no customer or subscription";
      const patch = patchFromSubscription(await store.retrieveSubscription(subId));
      if (s.client_reference_id) await store.updateByUser(s.client_reference_id, { ...patch, stripe_customer_id: customer });
      else await store.updateByCustomer(customer, patch);
      return `checkout completed for ${customer}: ${patch.plan}`;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customer = idOf(sub.customer);
      if (!customer) return "ignored: no customer";
      // Events can arrive out of order, so the current state comes from Stripe, not the event snapshot.
      const patch = event.type === "customer.subscription.deleted"
        ? { plan: "free" as Plan, plan_status: sub.status, current_period_end: periodEnd(sub) }
        : patchFromSubscription(await store.retrieveSubscription(sub.id));
      const found = await store.updateByCustomer(customer, patch);
      return found ? `${event.type} for ${customer}: ${patch.plan}` : `no profile for ${customer}`;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      const customer = idOf(inv.customer);
      if (!customer) return "ignored: no customer";
      await store.updateByCustomer(customer, { plan_status: "past_due" });
      return `payment failed for ${customer}`;
    }
    default:
      return `ignored: ${event.type}`;
  }
}
