// Phase 4 (subscriptions): Free locks and the upgrade dialog, the Free export mark, server-side
// limits, the billing page, and signed webhooks updating the plan.
// Needs a dev server started with dummy TEST Stripe values (no Stripe account is contacted for
// the webhook events used here):
//   NEXT_DIST_DIR=.next-e2e STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_e2e_secret
//   STRIPE_PRICE_PRO_MONTHLY=price_m STRIPE_PRICE_PRO_YEARLY=price_y npx next dev -p 3458
//   SHOTS_BASE=http://localhost:3458 STRIPE_WEBHOOK_SECRET=whsec_e2e_secret node scripts/shots/phase4.mjs
import fs from "node:fs";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { BASE, shot, signIn, uniqueEmail, withBrowser } from "./lib.mjs";

const env = loadEnv("development", process.cwd(), "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_secret";
const stripe = new Stripe("sk_test_unused");

const email = uniqueEmail("phase4");
const { data: created, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
if (error) throw error;
const userId = created.user.id;
const customer = `cus_e2e_${userId.slice(0, 8)}`;

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const status = (page) => page.locator(".statusbar .push");

async function webhook(type, object, secret = SECRET) {
  const payload = JSON.stringify({ id: `evt_e2e_${type}_${Date.now()}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  return res.status;
}

async function profile() {
  const { data } = await admin.from("profiles").select("plan, plan_status, stripe_customer_id").eq("id", userId).single();
  return data;
}

await withBrowser(async (page) => {
  await signIn(page, email);

  // --- Free: locks, preview, upgrade dialog ---
  await page.goto(`${BASE}/app`);
  await page.waitForSelector(".limit-note");
  assert((await page.locator(".limit-note").textContent()).includes("0 of 3"), "My boxes shows 0 of 3 projects");
  await page.getByRole("button", { name: "+ New box" }).click();
  await page.waitForURL(/\/app\/editor\/[0-9a-f-]{36}$/);
  await page.waitForSelector(".iconseg button.locked");
  await page.waitForTimeout(1500);
  assert((await page.locator(".iconseg button.locked").count()) === 6, "3 Pro shapes and 3 Pro patterns show a lock");
  await shot(page, "main-4-editor-free-locks");

  await page.locator('[aria-label="Box shape"] button[data-v="cyl"]').click();
  await page.waitForSelector(".toast:has-text('Pro feature')");
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Not saved — Pro feature", null, { timeout: 15000 });
  assert(true, "a Pro shape can be previewed, but the cloud save is refused");
  await page.locator(".btn-export").first().click();
  await page.waitForSelector(".modal.upgrade");
  assert((await page.locator(".upgrade-reason").textContent()).startsWith("Cylinder shape is a Pro feature"), "export of a Pro shape opens Upgrade to Pro");
  await shot(page, "main-4-upgrade-dialog");
  await page.keyboard.press("Escape");

  const api = await page.evaluate(async () => {
    const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: { shape: "cyl" } }) });
    return { status: r.status, body: await r.json() };
  });
  assert(api.status === 403, `the server refuses a Pro export for Free users (${api.body.error})`);

  await page.locator('[aria-label="Box shape"] button[data-v="rect"]').click();
  await page.locator(".btn-export").first().click();
  await page.waitForSelector(".upgrade-reason", { timeout: 15000 });
  assert((await page.locator(".upgrade-reason").textContent()).includes("Saving and exporting need Pro"), "Free export opens Upgrade to Pro");
  await page.keyboard.press("Escape");
  const freeApi = await page.evaluate(async () => {
    const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ params: { shape: "rect" } }) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  });
  assert(freeApi.status === 403 && String(freeApi.body.error ?? "").includes("Saving and exporting need Pro"), "the server refuses Free export");

  // --- Free: no cloud projects ---
  await page.goto(`${BASE}/app`);
  await page.waitForSelector(".limit-note");
  assert((await page.locator(".limit-note").textContent()).includes("cannot save cloud projects"), "Free is told cloud saving needs Pro");
  await shot(page, "main-4-project-limit");

  // --- Billing page (Free) and checkout error handling with a dummy key ---
  await page.goto(`${BASE}/app/billing`);
  await page.waitForSelector(".plan-card.pro");
  await shot(page, "main-4-billing-free");
  await page.getByRole("button", { name: /Upgrade · \$9\/month/ }).click();
  await page.waitForSelector(".auth-msg.err[role=alert]", { timeout: 30000 });
  assert(true, `checkout with an invalid key shows an error instead of crashing: "${await page.locator(".auth-msg.err[role=alert]").textContent()}"`);

  // --- Webhooks ---
  assert((await webhook("invoice.payment_failed", { object: "invoice", customer }, "whsec_wrong")) === 400, "a webhook with a wrong signature is rejected (400)");
  await admin.from("profiles").update({ stripe_customer_id: customer, plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", userId);
  await page.goto(`${BASE}/app/billing?checkout=success`);
  await page.waitForSelector(".billing-current");
  await shot(page, "main-4-billing-pro");

  await page.goto(`${BASE}/app`);
  await page.locator(".box-card").first().getByRole("link", { name: "Open", exact: true }).click();
  await page.waitForSelector("#f_W");
  await page.waitForTimeout(1500);
  assert((await page.locator(".iconseg button.locked").count()) === 0, "Pro sees no locks");
  await page.locator('[aria-label="Box shape"] button[data-v="cyl"]').click();
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Saved to cloud", null, { timeout: 15000 });
  const [dl2] = await Promise.all([page.waitForEvent("download"), page.locator(".btn-export").first().click()]);
  const svg2 = fs.readFileSync(await dl2.path(), "utf8");
  assert(!svg2.includes("watermark"), "Pro exports a clean cylinder box");
  await shot(page, "main-4-editor-pro");

  assert((await webhook("invoice.payment_failed", { object: "invoice", customer })) === 200, "signed invoice.payment_failed accepted");
  assert((await profile()).plan_status === "past_due" && (await profile()).plan === "pro", "payment failure marks past_due and keeps Pro");
  assert((await webhook("customer.subscription.deleted", { id: "sub_e2e", object: "subscription", status: "canceled", customer, items: { data: [{ current_period_end: 1_900_000_000 }] } })) === 200, "signed customer.subscription.deleted accepted");
  assert((await profile()).plan === "free", "subscription deleted turns the plan back to Free");
});

await admin.auth.admin.deleteUser(userId);
