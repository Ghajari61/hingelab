// Phase 3 (cloud projects): create a box, edit it, cloud autosave, offline fallback, reload,
// open it from a second "computer" (fresh browser context), duplicate / rename / delete.
import { createClient } from "@supabase/supabase-js";
import { BASE, shot, signIn, uniqueEmail, withBrowser } from "./lib.mjs";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = uniqueEmail("phase3");
const { error } = await admin.auth.admin.createUser({ email, password: "test-password-123", email_confirm: true });
if (error) throw error;

const status = (page) => page.locator(".statusbar .push");
const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };

let projectUrl = "";
await withBrowser(async (page, context) => {
  await signIn(page, email);
  await page.goto(`${BASE}/app`);
  await page.waitForSelector(".boxes-empty");
  await shot(page, "main-3-my-boxes-empty");

  await page.getByRole("button", { name: "+ New box" }).click();
  await page.waitForURL(/\/app\/editor\/[0-9a-f-]{36}$/);
  projectUrl = page.url();
  await page.waitForSelector("#f_W");
  await page.waitForTimeout(2500);
  const opened = await status(page).textContent();
  assert(opened === "Saved to cloud", `new project opens as saved to cloud (status: ${opened})`);

  await page.fill("#f_W", "180");
  await page.locator("#f_W").blur();
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Saving…");
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Saved to cloud", null, { timeout: 15000 });
  assert(true, "edit is saved to the cloud after the debounce");
  await shot(page, "main-3-editor-saved-to-cloud");

  await context.setOffline(true);
  await page.fill("#f_W", "190");
  await page.locator("#f_W").blur();
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Offline — saved locally", null, { timeout: 15000 });
  assert(true, "offline edit falls back to the local copy");
  await shot(page, "main-3-editor-offline");
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.waitForFunction(() => document.querySelector(".statusbar .push")?.textContent === "Saved to cloud", null, { timeout: 15000 });
  assert(true, "back online, the pending edit reaches the cloud");

  await page.reload();
  await page.waitForSelector("#f_W");
  assert((await page.inputValue("#f_W")) === "190", "reload shows the saved width (190)");

  await page.goto(`${BASE}/app`);
  await page.waitForSelector(".box-card img");
  await shot(page, "main-3-my-boxes");

  const card = page.locator(".box-card").first();
  await card.getByRole("button", { name: "Rename" }).click();
  await page.fill(".rename-input", "Tea box");
  await page.getByRole("button", { name: "Rename", exact: true }).last().click();
  await page.waitForSelector(".box-name:has-text('Tea box')");
  assert(true, "rename");
  await page.locator(".box-card").first().getByRole("button", { name: "Duplicate" }).click();
  await page.waitForSelector(".box-name:has-text('Tea box copy')");
  assert((await page.locator(".box-card").count()) === 2, "duplicate");
  await shot(page, "main-3-my-boxes-duplicated");
  await page.locator(".box-card", { hasText: "Tea box copy" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll(".box-card").length === 1);
  assert(true, "delete");
});

// A second computer: a fresh browser with no local copy sees the same project.
await withBrowser(async (page) => {
  await signIn(page, email);
  await page.goto(projectUrl);
  await page.waitForSelector("#f_W");
  assert((await page.inputValue("#f_W")) === "190", "second computer opens the same box from the cloud");
  assert((await page.locator(".doc-title b").textContent()) === "Tea box", "the renamed title follows");
});
