// UX U3 (D82): preset thumbnails from the real geometry, hinge style cards, "Save as my preset".
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u3")) { localStorage.clear(); sessionStorage.setItem("u3", "1"); } });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".preset-card img");
  for (const img of await page.locator(".preset-card img").all()) await img.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.querySelectorAll(".preset-card img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  check(await page.locator(".preset-card img").count() >= 36, "every preset card has a thumbnail that loads");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "docs/screenshots/ux-u3-start.png", fullPage: true });
  console.log("saved docs/screenshots/ux-u3-start.png");

  await page.getByRole("button", { name: "Hinge Box", exact: true }).click();
  const style = page.getByRole("group", { name: "Hinge style" });
  await style.waitFor();
  check(await style.getByRole("button").count() === 5, "five hinge style cards");
  check(await style.locator('[data-v="standard"]').getAttribute("aria-pressed") === "true", "the defaults read as Standard");
  await style.locator('[data-v="fine"]').click();
  await page.waitForTimeout(200);
  check(await page.locator('.fld[data-id="slit"] input').inputValue() === "20", "Fine sets 20 mm slits");
  check(await style.locator('[data-v="fine"]').getAttribute("aria-pressed") === "true", "Fine is selected");
  await page.getByRole("button", { name: "Fit sheet" }).click();
  await page.waitForTimeout(300);
  await shot(page, "ux-u3-hinge-style");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Save as my preset/ }).click();
  const dlg = page.getByRole("dialog", { name: "Save as my preset" });
  await dlg.locator("input").fill("My fine box");
  await dlg.getByRole("button", { name: "Save preset" }).click();
  await page.waitForSelector(".toast");
  check(/Saved “My fine box”/.test(await page.locator(".toast").textContent()), "the preset is saved");

  await style.locator('[data-v="stiff"]').click();
  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  const mine = page.getByRole("region", { name: "My presets" });
  await mine.waitFor();
  check(await mine.locator(".preset-card").count() === 1, "My presets lists it on the start page");
  await mine.screenshot({ path: "docs/screenshots/ux-u3-my-presets.png" });
  console.log("saved docs/screenshots/ux-u3-my-presets.png");
  await mine.locator('[data-my-preset="My fine box"]').click();
  await page.waitForSelector(".gallery .gcard");
  await page.waitForTimeout(200);
  check(await page.locator('.fld[data-id="slit"] input').inputValue() === "20", "opening it restores the fine hinge");

  await page.getByRole("button", { name: "File" }).click();
  await page.getByRole("menuitem", { name: /Start page/ }).click();
  await page.getByRole("button", { name: "Delete preset My fine box" }).click();
  await page.waitForTimeout(200);
  check(await page.getByRole("region", { name: "My presets" }).count() === 0, "deleting the only preset hides the section");
});
