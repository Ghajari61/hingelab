import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { computeModel, DEFAULTS, exportSVG, layoutParts, clone } from "@/lib/hinge";
import { addWatermark, hingeLocks, planForStatus, projectLimit } from "@/lib/plans";
import { exportHingeForPlan } from "../exportHinge";
import { handleStripeEvent, periodEnd, type BillingStore, type ProfilePatch } from "../events";

const stripe = new Stripe("sk_test_dummy");
const SECRET = "whsec_test_secret";

function sub(status: string, end = 1_800_000_000, customer = "cus_1"): Stripe.Subscription {
  return { id: "sub_1", object: "subscription", status, customer, items: { data: [{ current_period_end: end }] } } as unknown as Stripe.Subscription;
}

/** Builds a signed event the way Stripe sends it and parses it back through constructEvent. */
function signed(type: string, object: unknown): Stripe.Event {
  const payload = JSON.stringify({ id: `evt_${type}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return stripe.webhooks.constructEvent(payload, header, SECRET);
}

function fakeStore(current: Stripe.Subscription) {
  const calls: { by: "customer" | "user"; key: string; patch: ProfilePatch }[] = [];
  const store: BillingStore = {
    updateByCustomer: async (key, patch) => { calls.push({ by: "customer", key, patch }); return true; },
    updateByUser: async (key, patch) => { calls.push({ by: "user", key, patch }); return true; },
    retrieveSubscription: async () => current,
  };
  return { store, calls };
}

describe("plans", () => {
  it("locks Pro shapes and patterns on Free only", () => {
    expect(hingeLocks("free", { shape: "rect", pattern: "straight" })).toEqual([]);
    expect(hingeLocks("free", { shape: "cyl", pattern: "wave" })).toEqual(["Cylinder shape", "Wave pattern"]);
    expect(hingeLocks("pro", { shape: "cyl", pattern: "serpentine" })).toEqual([]);
    expect(projectLimit("free")).toBe(3);
    expect(projectLimit("pro")).toBe(Infinity);
  });

  it("keeps Pro while Stripe retries a card, drops it when the subscription ends", () => {
    expect(planForStatus("active")).toBe("pro");
    expect(planForStatus("trialing")).toBe("pro");
    expect(planForStatus("past_due")).toBe("pro");
    expect(planForStatus("canceled")).toBe("free");
    expect(planForStatus("unpaid")).toBe("free");
    expect(planForStatus(null)).toBe("free");
  });
});

describe("export by plan", () => {
  const params = clone(DEFAULTS);

  it("Pro gets exactly the engine's SVG (the golden output)", () => {
    const m = computeModel(params);
    if ("error" in m) throw new Error(m.error);
    const expected = exportSVG(m, layoutParts(m.parts, params.bedW, params.gap), params);
    const out = exportHingeForPlan(params, "pro");
    expect(out.ok && out.svg).toBe(expected);
  });

  it("Free gets the mark on its own engrave layer in an 8 mm strip, parts untouched", () => {
    const pro = exportHingeForPlan(params, "pro");
    const free = exportHingeForPlan(params, "free");
    if (!pro.ok || !free.ok) throw new Error("export failed");
    const h = /height="([\d.]+)mm"/.exec(pro.svg)![1];
    const h2 = /height="([\d.]+)mm"/.exec(free.svg)![1];
    expect(parseFloat(h2) - parseFloat(h)).toBeCloseTo(8, 6);
    expect(free.svg).toContain('id="watermark"');
    expect(free.svg).toContain(">Made with HingeLab</text>");
    expect(free.svg).not.toContain("NaN");
    const body = (s: string) => s.slice(s.indexOf("-->"), s.indexOf('<g id="watermark"') > 0 ? s.indexOf('<g id="watermark"') : s.lastIndexOf("</svg>"));
    expect(body(free.svg)).toBe(body(pro.svg));
    expect(addWatermark("<svg>no size</svg>")).toBe("<svg>no size</svg>");
  });

  it("Free cannot export Pro shapes or patterns", () => {
    const out = exportHingeForPlan({ ...params, shape: "pill", R: 45 }, "free");
    expect(out).toEqual({ ok: false, status: 403, error: "Pill shape is a Pro feature. Upgrade to Pro to export it." });
    expect(exportHingeForPlan({ ...params, shape: "pill", R: 45 }, "pro").ok).toBe(true);
    expect(exportHingeForPlan(null, "pro")).toMatchObject({ ok: false, status: 400 });
  });
});

describe("Stripe webhook events", () => {
  it("rejects a payload with a wrong signature", () => {
    const payload = JSON.stringify({ id: "evt_x", type: "customer.subscription.updated", data: { object: {} } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => stripe.webhooks.constructEvent(payload, header, SECRET)).toThrow();
  });

  it("checkout.session.completed links the customer to the user and turns on Pro", async () => {
    const { store, calls } = fakeStore(sub("active"));
    await handleStripeEvent(signed("checkout.session.completed", {
      object: "checkout.session", mode: "subscription", customer: "cus_1", subscription: "sub_1", client_reference_id: "user-1",
    }), store);
    expect(calls).toEqual([{ by: "user", key: "user-1", patch: { plan: "pro", plan_status: "active", current_period_end: new Date(1_800_000_000_000).toISOString(), stripe_customer_id: "cus_1" } }]);
  });

  it("subscription updates use the current state from Stripe, deletions end Pro", async () => {
    const { store, calls } = fakeStore(sub("canceled"));
    await handleStripeEvent(signed("customer.subscription.updated", sub("active")), store);
    expect(calls[0].patch.plan).toBe("free");
    await handleStripeEvent(signed("customer.subscription.deleted", sub("canceled")), store);
    expect(calls[1]).toMatchObject({ by: "customer", key: "cus_1", patch: { plan: "free", plan_status: "canceled" } });
  });

  it("invoice.payment_failed marks the plan past due without removing Pro", async () => {
    const { store, calls } = fakeStore(sub("past_due"));
    await handleStripeEvent(signed("invoice.payment_failed", { object: "invoice", customer: "cus_1" }), store);
    expect(calls).toEqual([{ by: "customer", key: "cus_1", patch: { plan_status: "past_due" } }]);
  });

  it("ignores other events and reads the period end from items", async () => {
    const { store, calls } = fakeStore(sub("active"));
    expect(await handleStripeEvent(signed("charge.succeeded", {}), store)).toBe("ignored: charge.succeeded");
    expect(calls).toEqual([]);
    expect(periodEnd(sub("active", 1_700_000_000))).toBe(new Date(1_700_000_000_000).toISOString());
  });
});
