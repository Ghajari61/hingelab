// Design library: the template gallery (search, categories, details with credits), opening a Studio
// template and a bundled cut-file template in Studio, and "Customise in" a classic editor.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("hingelab-prefs")) localStorage.setItem("hingelab-prefs", JSON.stringify({ onboarded: true }));
  });

  // Home: featured templates
  await page.goto(`${BASE}/home`);
  const featured = page.locator('[data-testid^="featured-"]');
  await featured.first().waitFor();
  check(await featured.count() >= 6, "Home shows a row of featured templates");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "the featured row scrolls inside the page, not the page itself");
  await page.locator(".home-row").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(600);
  await shot(page, "templates-home-row");
  await page.getByTestId("home-search").fill("snowflake");
  check(await page.getByRole("option", { name: /Snowflake ornaments/ }).count() === 1, "Home search finds templates");
  await page.getByTestId("home-search").fill("");

  // Gallery
  await page.goto(`${BASE}/templates`);
  const cards = page.locator('[data-testid^="template-"][role="listitem"]');
  await cards.first().waitFor();
  const total = await cards.count();
  check(total >= 50, `the gallery lists ${total} templates`);
  await page.waitForFunction(() => [...document.querySelectorAll(".tpl-card img")].slice(0, 8).every((i) => i.complete && i.naturalWidth > 0));
  await shot(page, "templates-gallery");

  await page.getByTestId("template-search").fill("coaster");
  await page.waitForTimeout(200);
  const hits = await cards.count();
  check(hits >= 2 && hits < total, `search narrows to ${hits} coaster templates`);
  check(page.url().includes("q=coaster"), "the search is kept in the URL");
  await page.getByTestId("template-search").fill("");
  await page.getByRole("button", { name: /^Lamps & light/ }).click();
  await page.waitForTimeout(200);
  check(await cards.count() >= 2 && await cards.count() < total, "a category filters the gallery");
  await page.waitForFunction(() => [...document.querySelectorAll(".tpl-card img")].every((i) => i.complete && i.naturalWidth > 0));
  await shot(page, "templates-category");
  await page.getByRole("button", { name: /^All/ }).click();

  // Details with credit
  await page.getByTestId("template-kv1-tank").click();
  const dlg = page.getByTestId("template-dialog");
  await dlg.waitFor();
  const text = await dlg.textContent();
  check(/JackCarter/.test(text) && /Creative Commons/.test(text) && /thingiverse\.com\/thing:2449310/.test(text), "the KV-1 details credit the author, licence and source");
  await page.waitForTimeout(300);
  await shot(page, "templates-detail-credit");
  await page.keyboard.press("Escape");

  // A Studio template opens as live objects
  await page.getByTestId("template-mandala-coasters").click();
  await page.getByTestId("template-open").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(1200);
  const paths = await page.locator('[data-testid="scene"] path').count();
  check(paths >= 10, `the mandala coasters open in Studio (${paths} paths drawn)`);
  await shot(page, "templates-open-studio");

  // A bundled cut-file template opens with one sheet per file
  await page.goto(`${BASE}/templates?t=kv1-tank`);
  await page.getByTestId("template-dialog").waitFor();
  await page.getByTestId("template-open").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(1500);
  const kv = await page.locator('[data-testid="scene"] path').count();
  check(kv >= 4, `the KV-1 tank opens in Studio (${kv} paths drawn)`);
  await shot(page, "templates-open-svg");

  // "Customise in" opens the classic editor with the template's settings
  await page.goto(`${BASE}/templates?t=hinge-sweet-jar`);
  await page.getByTestId("template-dialog").waitFor();
  check(await page.getByTestId("template-open").count() === 0, "Hinge Box templates open only in the Hinge Box editor");
  await page.getByTestId("template-customise").click();
  await page.waitForURL(/\/app\/editor\/local\?p=hinge/);
  await page.getByText(/Started from “Sweet jar”/).waitFor({ timeout: 60000 });
  check(true, "the Hinge Box editor starts from the Sweet jar settings");
  await page.waitForTimeout(800);
  await shot(page, "templates-customise-hinge");
});
