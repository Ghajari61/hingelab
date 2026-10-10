import { afterAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { adminClient, deleteUser, localSupabaseUp, newUser } from "@/lib/testing/supabase";
import { createProject, saveProject } from "@/lib/projects/repo";
import { DEFAULTS, clone } from "@/lib/hinge";
import { handleStripeEvent } from "../events";
import { supabaseBillingStore } from "../store";

const up = await localSupabaseUp();

describe.skipIf(!up)("plan limits in the database (local Supabase)", () => {
  const created: string[] = [];
  afterAll(async () => { for (const id of created) await deleteUser(id); });

  it("Free keeps up to 3 cloud projects and only Rounded + Straight boxes", async () => {
    const a = await newUser("free");
    created.push(a.id);
    for (let i = 0; i < 3; i++) await createProject(a.client, "hinge-box");
    await expect(createProject(a.client, "letters")).rejects.toThrow(/up to 3 cloud projects/);

    const b = await newUser("free-shape");
    created.push(b.id);
    await expect(createProject(b.client, "hinge-box", { ...clone(DEFAULTS), shape: "cyl" })).rejects.toThrow(/Pro features/);
    const p = await createProject(b.client, "hinge-box");
    await expect(saveProject(b.client, p.id, "hinge-box", { ...clone(DEFAULTS), pattern: "wave" })).rejects.toThrow(/Pro features/);
    await expect(saveProject(b.client, p.id, "hinge-box", { ...clone(DEFAULTS), W: 150 })).resolves.toBeTruthy();
    await expect(createProject(b.client, "parametric")).rejects.toThrow(/Pro feature/);
  });

  it("the webhook store upgrades a user, after which the limits are gone", async () => {
    const a = await newUser("upgrade");
    created.push(a.id);
    const admin = adminClient();
    await admin.from("profiles").update({ stripe_customer_id: `cus_test_${a.id.slice(0, 8)}` }).eq("id", a.id);
    const current = { id: "sub_1", status: "active", customer: `cus_test_${a.id.slice(0, 8)}`, items: { data: [{ current_period_end: 1_900_000_000 }] } } as unknown as Stripe.Subscription;
    const store = supabaseBillingStore(admin, { subscriptions: { retrieve: async () => current } } as unknown as Stripe);
    const note = await handleStripeEvent({ id: "evt_1", type: "customer.subscription.updated", data: { object: current } } as unknown as Stripe.Event, store);
    expect(note).toMatch(/: pro$/);

    const { data } = await a.client.from("profiles").select("plan, plan_status, current_period_end").eq("id", a.id).single();
    expect(data).toMatchObject({ plan: "pro", plan_status: "active" });
    expect(Date.parse(data!.current_period_end!)).toBe(1_900_000_000_000);

    for (let i = 0; i < 4; i++) await createProject(a.client, "hinge-box");
    await expect(createProject(a.client, "hinge-box", { ...clone(DEFAULTS), shape: "cyl", pattern: "serpentine" })).resolves.toBeTruthy();
  });
});
