// Letters L5 (plan limits), against the local Supabase stack and the dev server on BASE:
// a Free user previews everything, Solid/Stencil show locks, exporting a word opens Upgrade to Pro,
// the server refuses it too, and a single-letter box exports with the Free mark. Then the same
// user becomes Pro and exports the whole word cleanly.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";
import { BASE, shot, signIn, uniqueEmail, withBrowser } from "./lib.mjs";

const env = loadEnv("development", process.cwd(), "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = uniqueEmail("letters5");
const { data: created, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
if (error) throw error;
const userId = created.user.id;

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const text = 'textarea[aria-label="Text"]';
const setText = async (page, t) => { await page.fill(text, t); await page.locator(text).blur(); await page.waitForTimeout(1500); };
const apiExport = (page, body) => page.evaluate(async (b) => {
  const r = await fetch("/api/export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  return { status: r.status, body: r.ok ? await r.text() : (await r.json()).error };
}, body);

try {
  await withBrowser(async (page) => {
    await signIn(page, email);
    await page.goto(`${BASE}/app`);
    await page.getByRole("button", { name: "+ New letters" }).click();
    await page.waitForURL(/\/app\/editor\/[0-9a-f-]{36}$/);
    await page.waitForSelector('[aria-label="Letters mode"]');
    await page.waitForSelector("#preview3d canvas", { state: "attached", timeout: 30000 });
    await page.waitForTimeout(1500);
    assert(await page.locator('[aria-label="Letters mode"] button.locked').count() === 2, "Free: Solid and Stencil show a lock");
    await shot(page, "letters-5-free-preview");

    // a word: preview works, export opens the upgrade dialog
    await page.locator(".btn-export").first().click();
    await page.waitForSelector(".upgrade-reason");
    assert((await page.locator(".upgrade-reason").textContent()).startsWith("Letters is a Pro feature"), "exporting a word opens Upgrade to Pro");
    await shot(page, "letters-5-upgrade-dialog");
    await page.keyboard.press("Escape");
    await page.locator(".upgrade-reason").waitFor({ state: "detached" }).catch(async () => { await page.getByRole("button", { name: /close|not now|cancel/i }).first().click(); });

    const word = await apiExport(page, { product: "letters", params: { text: "Sam", mode: "box" } });
    assert(word.status === 403, `the server refuses a word for Free (${word.body})`);
    const solid = await apiExport(page, { product: "letters", params: { text: "S", mode: "solid" } });
    assert(solid.status === 403, "the server refuses a Solid letter for Free");

    // one letter as a box: exports with the mark
    await page.locator('[aria-label="Letters mode"] button[data-v="box"]').click();
    await setText(page, "S");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(".btn-export").first().click()]);
    const svg = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    assert(svg.includes('id="watermark"') && svg.includes("Made with HingeLab"), "Free single-letter box exports with the mark");
    assert(svg.includes("letter box (living-hinge walls)") && /<g id="hinge"[^>]*>\s*<path/.test(svg), "the export is the real letter box with hinge cuts");
    await page.waitForSelector(".toast:has-text('Made with HingeLab')");
    await shot(page, "letters-5-free-single-letter");

    // Pro: the whole word, clean
    await admin.from("profiles").update({ plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", userId);
    await page.reload();
    await page.waitForSelector('[aria-label="Letters mode"]');
    await page.waitForTimeout(1500);
    assert(await page.locator('[aria-label="Letters mode"] button.locked').count() === 0, "Pro: no locks");
    await setText(page, "Sam");
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.locator(".btn-export").first().click()]);
    const svg2 = await (await dl2.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    assert(!svg2.includes("watermark") && svg2.includes('letters: "Sam"'), "Pro exports the whole word without the mark");
    const st = await apiExport(page, { product: "letters", params: { text: "ABOPQR8", mode: "stencil" } });
    assert(st.status === 200 && st.body.includes("<svg"), "Pro: the server builds a stencil too");
  });
} finally {
  await admin.auth.admin.deleteUser(userId);
}
