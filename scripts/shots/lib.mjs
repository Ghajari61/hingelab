// Screenshot helper for PROGRESS.md: drives the local dev server with Playwright and saves PNGs
// under docs/screenshots/. Usage: node scripts/shots/<phase>.mjs (dev server on BASE, default :3456).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.SHOTS_BASE ?? "http://localhost:3456";
export const OUT = path.resolve("docs/screenshots");

export async function withBrowser(fn, { width = 1440, height = 900 } = {}) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fn(page, context);
  } finally {
    await browser.close();
  }
  if (errors.length) console.log("page errors:\n" + errors.join("\n"));
}

export async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(process.cwd(), file));
}

/** Creates a confirmed user in the local Supabase stack and signs the page in through the login form. */
export async function signIn(page, email, password = "test-password-123") {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

export function uniqueEmail(tag) {
  return `${tag}-${Date.now()}@hingelab.test`;
}

/** Creates a Pro user in the local Supabase stack, signs the page in, and returns a cleanup function. */
export async function signInAsPro(page, tag) {
  const { createClient } = await import("@supabase/supabase-js");
  const { loadEnv } = await import("vite");
  const env = loadEnv("development", process.cwd(), "");
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return async () => {};
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const email = uniqueEmail(tag);
  const { data, error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
  if (error) throw error;
  const id = data.user.id;
  await admin.from("profiles").update({ plan: "pro", plan_status: "active", current_period_end: new Date(Date.now() + 30 * 864e5).toISOString() }).eq("id", id);
  await signIn(page, email);
  return async () => { await admin.auth.admin.deleteUser(id); };
}
