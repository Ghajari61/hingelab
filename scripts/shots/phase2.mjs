// Phase 2 (accounts): sign-in page, sign-up through the form, the avatar menu in the editor.
import { BASE, shot, uniqueEmail, withBrowser } from "./lib.mjs";

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/billing`);
  await page.waitForURL(/\/login\?next=/);
  await shot(page, "main-2-login-redirect");

  const email = uniqueEmail("phase2");
  await page.goto(`${BASE}/signup`);
  await page.fill('input[type="email"]', email);
  const pw = page.locator('input[type="password"]');
  await pw.nth(0).fill("short");
  await pw.nth(1).fill("short");
  await page.click('button[type="submit"]');
  await shot(page, "main-2-signup-validation");

  await pw.nth(0).fill("test-password-123");
  await pw.nth(1).fill("test-password-123");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => u.pathname === "/app");
  console.log("signed up and landed on", page.url());

  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".avatar");
  await page.click(".avatar");
  await page.waitForSelector(".user-menu .dropdown");
  await shot(page, "main-2-editor-account-menu");
});
