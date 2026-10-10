// Parametric P6 (pricing gates in Stripe test mode), against the local Supabase stack and a dev
// server started with dummy TEST Stripe values (no Stripe account is contacted):
//   NEXT_DIST_DIR=.next-e2e STRIPE_SECRET_KEY=sk_test_dummy_e2e STRIPE_WEBHOOK_SECRET=whsec_e2e_secret
//   STRIPE_PRICE_PRO_MONTHLY=price_dummy_m STRIPE_PRICE_PRO_YEARLY=price_dummy_y npx next dev -p 3458
//   SHOTS_BASE=http://localhost:3458 node scripts/shots/parametric-p6.mjs
// Free: library shapes as parallel fins up to 30 parts export with the mark (built on the server);
// more parts, other methods and other sources open Upgrade to Pro and are refused by the server.
// Pro: a cloud sculpture from an imported 3D file, kept in Storage, exported clean. Cancelling
// (signed webhook) brings the gates back.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { strFromU8, unzipSync } from "fflate";
import Stripe from "stripe";
import { loadEnv } from "vite";
import { BASE, shot, signIn, uniqueEmail, withBrowser } from "./lib.mjs";

const env = loadEnv("development", process.cwd(), "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_secret";
const stripe = new Stripe("sk_test_unused");
const email = uniqueEmail("parametric6");
const { data: created, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
if (error) throw error;
const userId = created.user.id;
const customer = `cus_e2e_${userId.slice(0, 8)}`;

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const waitSliced = async (page, prev = "", timeout = 120000) => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout });
  await page.waitForTimeout(800);
  return page.locator(".pe-stage").textContent();
};
const download = async (page, click) => {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), click()]);
  return fs.readFileSync(await d.path());
};
const apiExport = (page, body) => page.evaluate(async (b) => {
  const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, error: r.ok ? null : (await r.json()).error, type: r.headers.get("content-type") };
}, body);
const closeUpgrade = async (page) => {
  await page.keyboard.press("Escape");
  await page.locator(".modal.upgrade").waitFor({ state: "detached", timeout: 3000 }).catch(async () => { await page.getByRole("button", { name: /close|not now|cancel/i }).first().click(); });
};
async function webhook(type, object) {
  const payload = JSON.stringify({ id: `evt_e2e_${type}_${Date.now()}`, object: "event", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return (await fetch(`${BASE}/api/stripe/webhook`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload })).status;
}
function boxStl(w, h, d) {
  const V = [[0, 0, 0], [w, 0, 0], [w, h, 0], [0, h, 0], [0, 0, d], [w, 0, d], [w, h, d], [0, h, d]];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const buf = Buffer.alloc(84 + F.length * 50);
  buf.writeUInt32LE(F.length, 80);
  F.forEach((f, i) => f.forEach((v, k) => V[v].forEach((c, a) => buf.writeFloatLE(c, 84 + i * 50 + 12 + k * 12 + a * 4))));
  return buf;
}

try {
  await withBrowser(async (page) => {
    await page.addInitScript(() => { if (!sessionStorage.getItem("p6")) { localStorage.clear(); indexedDB.deleteDatabase("hingelab-models"); sessionStorage.setItem("p6", "1"); } });
    await signIn(page, email);

    // --- Free: New sculpture opens the browser editor ---
    await page.goto(`${BASE}/app`);
    await page.getByRole("button", { name: "+ New sculpture" }).click();
    await page.waitForURL(/\/app\/editor\/local$/);
    let s = await waitSliced(page);
    const parts = Number(/(\d+) parts/.exec(s)[1]);
    assert(parts <= 30, `Free starts with the library head as parallel fins: ${s}`);
    assert(await page.locator('[aria-label="Slicing method"] button.locked').count() === 4, "Free: the four other methods show a lock");
    assert(await page.locator('[aria-label="Model from"] button.locked').count() === 3, "Free: 3D file, Photo and Formula show a lock");
    assert(await page.getByTestId("pro-note").count() === 0, "no Pro note on a Free design");
    const cut = await page.getByTestId("cut-time").textContent();
    assert(/^about \d+ (min|h)/.test(cut), `cut-time estimate shown: ${cut}`);
    await shot(page, "parametric-6-free-editor");

    // Free export: built on the server, with the mark on every sheet
    const zip = unzipSync(new Uint8Array(await download(page, () => page.getByRole("button", { name: "Export all sheets (ZIP)" }).click())));
    const sheets = Object.keys(zip).filter((n) => /^sheet-\d+\.svg$/.test(n));
    assert(sheets.length > 0 && sheets.every((n) => strFromU8(zip[n]).includes("Made with HingeLab")), `Free ZIP: ${sheets.length} sheets, each with the HingeLab mark`);
    assert(/on the laser/.test(strFromU8(zip["assembly-guide.svg"])), "the assembly guide states the cut time");
    await page.waitForSelector(".toast:has-text('Made with HingeLab')");

    // more than 30 parts: preview works, export opens Upgrade to Pro
    await page.locator('.fld[data-id="spacing"] input').first().fill("5");
    await page.keyboard.press("Enter");
    s = await waitSliced(page, s);
    const many = Number(/(\d+) parts/.exec(s)[1]);
    assert(many > 30, `closer fins make ${many} parts`);
    assert(/More than 30 parts/.test(await page.getByTestId("pro-note").textContent()), "the Pro note names the part limit");
    await page.getByRole("button", { name: "Export all sheets (ZIP)" }).click();
    await page.waitForSelector(".modal.upgrade");
    assert(/^More than 30 parts \(this design has \d+\) needs Pro/.test(await page.locator(".upgrade-reason").textContent()), "export over 30 parts opens Upgrade to Pro");
    await shot(page, "parametric-6-upgrade-dialog");
    await closeUpgrade(page);

    // a Pro method: preview works, the guide is refused too
    await page.locator('[aria-label="Slicing method"] button[data-v="waffle"]').click();
    s = await waitSliced(page, s);
    assert(/Waffle/.test(await page.getByTestId("pro-note").textContent()), "waffle shows the Pro note");
    await shot(page, "parametric-6-free-waffle-preview");
    await page.getByRole("button", { name: "Assembly guide" }).click();
    await page.waitForSelector(".modal.upgrade");
    await closeUpgrade(page);

    // the server holds the same rules
    const dense = await apiExport(page, { product: "parametric", params: { parallel: { spacing: 5 } } });
    assert(dense.status === 403 && /More than 30 parts/.test(dense.error), `server refuses > 30 parts for Free (${dense.error})`);
    const radial = await apiExport(page, { product: "parametric", params: { method: "radial" } });
    assert(radial.status === 403, `server refuses radial for Free (${radial.error})`);
    const photo = await apiExport(page, { product: "parametric", params: { source: { kind: "image", fileName: "me.jpg" } } });
    assert(photo.status === 403, "server refuses a photo source for Free");
    const ok = await apiExport(page, { product: "parametric", params: {}, what: { kind: "sheet", index: 0 } });
    assert(ok.status === 200 && /svg/.test(ok.type), "server builds a Free sheet");

    // --- Upgrade (as the Stripe webhook records it) ---
    await admin.from("profiles").update({ stripe_customer_id: customer, plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", userId);
    await page.goto(`${BASE}/app`);
    await page.getByRole("button", { name: "+ New sculpture" }).click();
    await page.waitForURL(/\/app\/editor\/[0-9a-f-]{36}$/);
    const projectId = page.url().split("/").pop();
    s = await waitSliced(page);
    assert(await page.locator('[aria-label="Slicing method"] button.locked').count() === 0, "Pro: no locks");

    await page.locator('input[aria-label="Import model"]').setInputFiles({ name: "plinth.stl", mimeType: "model/stl", buffer: boxStl(160, 220, 70) });
    s = await waitSliced(page, s);
    await page.locator('[aria-label="Slicing method"] button[data-v="waffle"]').click();
    s = await waitSliced(page, s);
    await page.waitForFunction(() => /Saved to cloud/.test(document.querySelector(".statusbar")?.textContent ?? ""), null, { timeout: 20000 });
    const { data: row } = await admin.from("projects").select("product, params").eq("id", projectId).single();
    assert(row.product === "parametric" && row.params.method === "waffle" && row.params.source.kind === "mesh", "the cloud project stores the params (waffle, 3D file)");
    const fileId = row.params.source.fileId;
    assert(typeof fileId === "string" && fileId.startsWith(`${userId}/${projectId}/`), `the model is kept in Storage: ${fileId}`);
    const zip2 = unzipSync(new Uint8Array(await download(page, () => page.getByRole("button", { name: "Export all sheets (ZIP)" }).click())));
    assert(Object.keys(zip2).filter((n) => /^sheet-/.test(n)).every((n) => !strFromU8(zip2[n]).includes("watermark")), "Pro exports a clean waffle ZIP");
    await shot(page, "parametric-6-pro-cloud-waffle");

    // another device: the model comes back from Storage
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase("hingelab-models"); q.onsuccess = q.onerror = q.onblocked = () => r(null); }));
    await page.reload();
    await waitSliced(page, "", 120000);
    const dock = (await page.locator(".dock").textContent()).replace(/\s+/g, " ");
    assert(/plinth\.stl/.test(dock), "after clearing the device the model is loaded from the cloud");

    // --- Cancel (signed webhook): the gates come back ---
    assert(await webhook("customer.subscription.deleted", { id: "sub_e2e", object: "subscription", status: "canceled", customer, items: { data: [{ current_period_end: 1_900_000_000 }] } }) === 200, "signed customer.subscription.deleted accepted");
    await page.reload();
    await waitSliced(page, "", 120000);
    assert(/Waffle|Importing a 3D file/.test(await page.getByTestId("pro-note").textContent()), "after cancelling, the sculpture shows the Pro note again");
    await page.getByRole("button", { name: "Export all sheets (ZIP)" }).click();
    await page.waitForSelector(".modal.upgrade");
    assert(true, "and its export opens Upgrade to Pro");
    await shot(page, "parametric-6-after-cancel");
  });
} finally {
  await admin.auth.admin.deleteUser(userId);
  const { data: files } = await admin.storage.from("models").list(userId);
  for (const f of files ?? []) {
    const { data: inner } = await admin.storage.from("models").list(`${userId}/${f.name}`);
    if (inner?.length) await admin.storage.from("models").remove(inner.map((x) => `${userId}/${f.name}/${x.name}`));
  }
}
