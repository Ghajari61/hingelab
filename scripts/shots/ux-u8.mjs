// UX U8 (D87): searchable help centre; articles list every option from the field definitions with
// figures and screenshots; a ? on each panel section and a Tips button open help beside the editor.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/help`);
  await page.getByRole("searchbox", { name: "Search help" }).waitFor();
  check(await page.locator(".help-groups section").count() >= 5 && await page.locator(".help-groups section").filter({ hasText: "Clock" }).count() === 1, "articles are grouped by product, generators included");
  await page.getByRole("searchbox", { name: "Search help" }).fill("kerf");
  const first = page.getByRole("region", { name: "Search results" }).locator(".help-list li").first();
  check(/Material, thickness and kerf/.test(await first.textContent()), "searching kerf finds the material article first");
  await page.getByRole("searchbox", { name: "Search help" }).fill("hub radius");
  check(/Slicing method/.test(await page.getByRole("region", { name: "Search results" }).textContent()), "option names are searchable (hub radius)");
  await shot(page, "ux-u8-search");

  await page.goto(`${BASE}/help/hinge-pattern`);
  const field = page.locator('.help-field[data-field="slit"]');
  check(/Slit/.test(await field.locator("dt").textContent()) && /3 mm or more/.test(await field.locator("dt").textContent()), "options show their range and units");
  check(await page.locator(".help-figs img").count() === 4, "four pattern figures drawn from the geometry");
  const loaded = await page.locator(".help-figs img").evaluateAll((imgs) => Promise.all(imgs.map((i) => i.decode().then(() => i.naturalWidth > 0, () => false))));
  check(loaded.every(Boolean), "the figures load");
  await shot(page, "ux-u8-article");

  await page.goto(`${BASE}/help#kerf`);
  await page.waitForURL(/\/help\/material-and-kerf$/);
  check(true, "old /help#kerf links land on the new article");

  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForSelector(".gallery .gcard");
  check(await page.locator("details.sec .help-mark").count() >= 6, "dock sections have a ? button");
  await page.locator(".dock").getByRole("button", { name: "Help: Hinge Pattern", exact: true }).click();
  const frame = page.frameLocator(".help-drawer iframe");
  await frame.locator("h1").waitFor();
  check(await frame.locator("h1").textContent() === "Hinge pattern", "the ? opens the section's article beside the editor");
  await shot(page, "ux-u8-drawer");
  await page.keyboard.press("Escape");
  check(await page.locator(".help-drawer").count() === 0, "Esc closes it");

  await page.locator(".gallery-head").getByRole("button", { name: "Tips" }).click();
  await frame.locator("h1").waitFor();
  check(/Tips for the Hinge Box/.test(await frame.locator("h1").textContent()), "Tips opens the product's tips");
  await page.getByRole("button", { name: "Close help" }).click();

  await page.getByRole("button", { name: "Help", exact: true }).click();
  check(await page.getByRole("menuitem", { name: /Help centre/ }).isVisible(), "the Help menu links the help centre");
  await page.keyboard.press("Escape");

  await page.locator(".gallery").getByRole("button", { name: "Help: Lid", exact: true }).click();
  await frame.locator("h1").waitFor();
  check(await frame.locator("h1").textContent() === "Box shape and lid", "rail groups have help too");
});
