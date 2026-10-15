import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { effectivePlan } from "@/lib/desktop/session";
import {
  BATCH_FREE, BATCH_PRO, batchLimitMessage, designBatchCount, getEntitlements, hasPro, lockedPriceCopy, planForPrice, planForStatus, planOf,
} from "@/lib/plans";
import { handleStripeEvent, type BillingStore, type ProfilePatch } from "../events";

const stripe = new Stripe("sk_test_dummy");
const SECRET = "whsec_test_secret";

function signed(type: string, object: unknown): Stripe.Event {
  const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return stripe.webhooks.constructEvent(payload, header, SECRET);
}

describe("entitlements", () => {
  it("ranks free below pro and lifetime, and both below business", () => {
    expect(planOf("nope")).toBe("free");
    expect(planOf("lifetime")).toBe("lifetime");
    for (const plan of ["pro", "lifetime", "business"] as const) {
      const e = getEntitlements(plan);
      expect(e.pro).toBe(true);
      expect(e.watermark).toBe(false);
      expect(hasPro(plan)).toBe(true);
    }
    expect(getEntitlements("free")).toMatchObject({ pro: false, watermark: true, batchLimit: BATCH_FREE, projectLimit: 3 });
    expect(getEntitlements("pro").batchLimit).toBe(BATCH_PRO);
    expect(getEntitlements("lifetime").batchLimit).toBe(BATCH_PRO);
    expect(getEntitlements("business")).toMatchObject({ batchLimit: null, seats: 3, commercialUse: true, prioritySupport: true });
    expect(getEntitlements("pro", { open: true }).batchLimit).toBeNull();
  });

  it("caps batches by count and leaves the no-account editor open", () => {
    expect(designBatchCount({ batch: { mode: "range", from: 1, to: 6 } })).toBe(6);
    expect(designBatchCount({ job: { names: "A\nB\nC" }, sheet: { copies: 4 } })).toBe(12);
    expect(batchLimitMessage("free", 5)).toBeNull();
    expect(batchLimitMessage("free", 6)).toMatch(/Pro allows 30/);
    expect(batchLimitMessage("pro", 30)).toBeNull();
    expect(batchLimitMessage("lifetime", 31)).toMatch(/unlimited batches/);
    expect(batchLimitMessage("business", 500)).toBeNull();
    expect(batchLimitMessage("pro", 500, true)).toBeNull();
  });

  it("maps new prices to Business and leaves unknown prices on Pro", () => {
    process.env.PRICE_BUSINESS_MONTHLY = "price_biz_m";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_old_m";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_old_y";
    expect(planForStatus("active")).toBe("pro");
    expect(planForPrice("active", "price_biz_m")).toBe("business");
    expect(planForPrice("active", "price_old_m")).toBe("pro");
    expect(planForPrice("active", null)).toBe("pro");
    expect(planForPrice("canceled", "price_biz_m")).toBe("free");
    expect(lockedPriceCopy("price_old_m")).toBe("Your price is locked at $9/month");
    expect(lockedPriceCopy("price_old_y")).toBe("Your price is locked at $79/year");
    expect(lockedPriceCopy("price_biz_m")).toBeNull();
    delete process.env.PRICE_BUSINESS_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_MONTHLY;
    delete process.env.STRIPE_PRICE_PRO_YEARLY;
  });

  it("keeps lifetime after the paid period, and business only while it is paid", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(effectivePlan("lifetime", "2020-01-01T00:00:00Z", now)).toBe("lifetime");
    expect(effectivePlan("business", null, now)).toBe("business");
    expect(effectivePlan("business", "2026-10-01T00:00:00Z", now)).toBe("free");
    expect(effectivePlan("pro", null, now)).toBe("pro");
  });
});

describe("lifetime and founder webhooks", () => {
  it("grants a one-time lifetime payment without touching a subscription patch", async () => {
    const calls: ProfilePatch[] = [];
    let granted = 0;
    const store: BillingStore = {
      updateByCustomer: async () => true,
      updateByUser: async (_id, patch) => { calls.push(patch); return true; },
      retrieveSubscription: async () => { throw new Error("not a subscription"); },
      grantFounder: async () => { granted += 1; return true; },
    };
    const note = await handleStripeEvent(signed("checkout.session.completed", {
      object: "checkout.session", mode: "payment", payment_status: "paid", customer: "cus_life",
      client_reference_id: "user-1", metadata: { plan: "lifetime", user_id: "user-1" },
    }), store);
    expect(note).toMatch(/lifetime purchase/);
    expect(granted).toBe(1);
    expect(calls).toEqual([{ stripe_customer_id: "cus_life" }]);
  });

  it("does not grant a 201st lifetime seat", async () => {
    const calls: ProfilePatch[] = [];
    const store: BillingStore = {
      updateByCustomer: async () => true,
      updateByUser: async (_id, patch) => { calls.push(patch); return true; },
      retrieveSubscription: async () => { throw new Error("not a subscription"); },
      grantFounder: async () => false,
    };
    const note = await handleStripeEvent(signed("checkout.session.completed", {
      object: "checkout.session", mode: "payment", payment_status: "paid",
      client_reference_id: "user-2", metadata: { plan: "lifetime" },
    }), store);
    expect(note).toMatch(/sold out/);
    expect(calls).toEqual([]);
  });

  it("restores Founder Lifetime when the last subscription is cancelled", async () => {
    const calls: { patch: ProfilePatch }[] = [];
    const store: BillingStore = {
      updateByCustomer: async (_id, patch) => { calls.push({ patch }); return true; },
      updateByUser: async () => true,
      retrieveSubscription: async () => ({ id: "sub_1", status: "canceled", customer: "cus_1", items: { data: [{ current_period_end: 1 }] } } as unknown as Stripe.Subscription),
      isFounder: async () => true,
    };
    await handleStripeEvent(signed("customer.subscription.deleted", {
      id: "sub_1", object: "subscription", status: "canceled", customer: "cus_1", items: { data: [] },
    }), store);
    expect(calls.at(-1)?.patch).toMatchObject({ plan: "lifetime", plan_status: "active", current_period_end: null });
  });
});
