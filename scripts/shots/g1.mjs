// G1 (D89): generators framework + Clock — start page tiles, header menu, presets, rail cards, checks, export, 3D, help.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const openSec = async (page, title) => {
  const sum = page.locator("details.sec > summary").filter({ hasText: new RegExp("^" + title) });
  await sum.scrollIntoViewIfNeeded();
  if (!(await sum.locator("xpath=..").evaluate((d) => d.open))) await sum.click();
};
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 20 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });
const engraved = (page) => page.locator(".canvas svg path.engrave").evaluateAll((els) => els.reduce((n, e) => n + e.getAttribute("d").length, 0));

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g1")) { localStorage.clear(); sessionStorage.setItem("g1", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  check((await page.locator(".start-tile").count()) === 3, "the start page keeps the three core products");
  check((await page.locator(".gen-tile").filter({ hasText: "Clock" }).count()) === 1, "a Clock tile sits under Generators");
  const thumbs = page.locator('img[src^="/presets/clock/"]');
  check((await thumbs.count()) >= 6, `clock presets show thumbnails (${await thumbs.count()})`);
  await page.locator(".start-gens").scrollIntoViewIfNeeded();
  await shot(page, "g1-start");

  // Start from the Station preset.
  await page.locator('img[src="/presets/clock/station.svg"]').first().click();
  await page.waitForSelector('.gen-app[data-generator="clock"]');
  await drawn(page);
  check(/Station/i.test(await page.locator(".toast").textContent()), "the preset is applied with a toast");
  const withNumerals = await engraved(page);
  check(withNumerals > 4000, `Roman numerals are engraved on the face (${withNumerals} path chars)`);
  await shot(page, "g1-station");

  // Rail cards change the face.
  await page.locator(".gallery .gcard").filter({ hasText: /^Gear$/ }).click();
  await drawn(page);
  check(/gear/i.test(await page.locator(".menubar, header").first().textContent()), "the Gear card makes a gear face");
  await shot(page, "g1-gear");

  // Checks: a minute hand far too long, then Auto-fix all.
  await openSec(page, "Hands");
  const minute = page.locator('[id="f_hands.minute"]');
  await minute.fill("190");
  await minute.blur();
  await page.waitForSelector('.checks li.issue[data-code="HAND_TOO_LONG"]');
  check(true, "a too-long minute hand is listed");
  await page.locator(".checks").evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(page, "g1-checks");
  await page.getByRole("button", { name: "Auto-fix all" }).click();
  await page.waitForFunction(() => !document.querySelector('.checks li.issue[data-code="HAND_TOO_LONG"]'));
  check(true, "Auto-fix all shortens the hand");

  // Export.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  check(/clock.*\.svg$/.test(dl.suggestedFilename()), `Export SVG downloads ${dl.suggestedFilename()}`);

  // 3D.
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, "g1-3d");
  await page.getByRole("tab", { name: "Sheets" }).click();

  // Header menu lists the generators.
  await page.locator(".gen-menu").click();
  const items = await page.getByRole("menuitem").allTextContents();
  check(items.some((t) => /Clock/.test(t)), `the Generators menu lists the clock (${items.length} items)`);
  await shot(page, "g1-menu");
  await page.keyboard.press("Escape");

  // Help ? on the Face section opens the clock article.
  await page.locator(".dock").getByRole("button", { name: "Help: Face", exact: true }).click();
  const frame = page.frameLocator(".help-drawer iframe");
  await frame.locator("h1").waitFor();
  const h1 = await frame.locator("h1").textContent();
  check(/Clock/.test(h1), `the ? opens the clock article (${h1})`);
  await frame.locator('.help-field[data-field="face.size"]').waitFor();
  check(true, "the article lists the clock's fields");
  await shot(page, "g1-help");
});

// The default wall clock straight from the URL.
await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=clock`);
  await page.waitForSelector('.gen-app[data-generator="clock"]');
  await drawn(page);
  await page.waitForTimeout(800);
  await shot(page, "g1-wall");
});
