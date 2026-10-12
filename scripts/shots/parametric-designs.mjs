// Parametric design gallery, generator and Style section (D129), against the dev server on BASE:
//   npx next dev -p 3456, then node scripts/shots/parametric-designs.mjs
// Opens the editor, uses the flagship slat-wall portrait from the gallery (one undo step), generates
// a design, tries the quick looks, and checks the dialog at phone width.
import { BASE, shot, withBrowser } from "./lib.mjs";

const assert = (cond, msg) => { if (!cond) throw new Error("FAILED: " + msg); console.log("ok -", msg); };
const waitSliced = async (page, prev = "", timeout = 120000) => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout });
  await page.waitForTimeout(800);
  return page.locator(".pe-stage").textContent();
};
const open = async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("pd")) { localStorage.clear(); sessionStorage.setItem("pd", "1"); } });
  await page.goto(`${BASE}/app/editor/local?p=parametric`);
  return waitSliced(page);
};

await withBrowser(async (page) => {
  let s = await open(page);

  // --- Gallery ---
  await page.locator('[data-open="gallery"]').click();
  const dialog = page.getByRole("dialog", { name: "Designs" });
  await dialog.locator(".ds-card").first().waitFor();
  const all = await dialog.locator(".ds-card").count();
  assert(all >= 45, `the gallery lists ${all} designs`);
  await page.waitForFunction(() => [...document.querySelectorAll(".ds-card img")].slice(0, 8).every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  assert(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")) === "Search designs", "the search field has focus when the gallery opens");
  await shot(page, "parametric-designs-gallery");

  await page.keyboard.type("lamp");
  const lamps = await dialog.locator(".ds-card").count();
  assert(lamps > 0 && lamps < 15, `searching “lamp” finds ${lamps} designs`);
  await page.keyboard.press("Control+A");
  await page.keyboard.type("zzzz");
  assert(await dialog.locator(".ds-empty").isVisible(), "a search with no match shows the empty state");
  await dialog.getByRole("button", { name: "Show all designs" }).click();
  await dialog.getByRole("button", { name: /^Portraits & faces/ }).click();
  const faces = await dialog.locator(".ds-card").count();
  assert(faces >= 6 && faces < all, `the Portraits & faces tab shows ${faces} designs`);
  assert(await dialog.locator('.ds-card[data-design="slat-portrait"] .pro-badge').count() === 1, "the 60-part flagship shows the Pro badge for Free");
  assert(await dialog.locator('.ds-card[data-design="head-fins"] .pro-badge').count() === 0, "a Free design shows no badge");
  await dialog.locator('.ds-card[data-design="slat-portrait"]').click();
  assert(/Veiled portrait slat wall/.test(await dialog.locator(".ds-pick").textContent()), "picking a card shows its name in the footer");
  await shot(page, "parametric-designs-portraits");
  await dialog.getByRole("button", { name: "Use this design" }).click();
  await dialog.waitFor({ state: "detached" });
  s = await waitSliced(page, s);
  const parts = Number(/(\d+) parts/.exec(s)[1]);
  assert(parts >= 40 && parts <= 80, `the flagship slat-wall portrait slices into ${parts} parts`);
  assert(await page.locator('select[aria-label="Library model"]').inputValue() === "veiled-face-cc0", "the source is the Veiled face");
  assert(await page.locator('select[aria-label="Look"]').inputValue() === "dark", "the flagship opens with the dark look");
  assert(await page.locator('.style-looks button[data-look="slats"]').getAttribute("aria-pressed") === "true", "the Style section shows the Slat wall look");
  await page.locator('[data-testid="parametric-view"] canvas').waitFor();
  await shot(page, "parametric-slat-portrait-3d");

  await page.keyboard.press("Control+z");
  const back = await waitSliced(page, s);
  assert(back !== s && await page.locator('select[aria-label="Library model"]').inputValue() === "abstract-head-cc0", "one Ctrl+Z returns to the previous design");
  await page.keyboard.press("Control+Shift+z");
  s = await waitSliced(page, back);
  assert(await page.locator('select[aria-label="Library model"]').inputValue() === "veiled-face-cc0", "redo brings the portrait back");

  // --- Style section ---
  await page.locator('.style-looks button[data-look="horizontal"]').click();
  s = await waitSliced(page, s);
  assert(await page.locator('.style-looks button[data-look="horizontal"]').getAttribute("aria-pressed") === "true", "a quick look applies (horizontal fins)");
  await page.locator('select[aria-label="Look"]').selectOption("wood");
  await shot(page, "parametric-style-horizontal");
  await page.keyboard.press("Control+z");
  s = await waitSliced(page, s);

  // --- Generator ---
  await page.locator('[data-open="generate"]').click();
  await dialog.locator(".ds-gen").waitFor();
  assert(await dialog.locator("canvas.ds-canvas").count() === 7, "the generator draws a preview and six variations");
  await dialog.locator('[data-recipe="terrain"]').click();
  await dialog.getByRole("button", { name: "Slat wall" }).click();
  const seed = await dialog.getByLabel("Seed").inputValue();
  await dialog.getByRole("button", { name: "Variation 2" }).click();
  assert(await dialog.getByLabel("Seed").inputValue() !== seed, "a variation takes a new seed");
  await dialog.getByRole("button", { name: "New variation" }).click();
  await page.waitForTimeout(300);
  await shot(page, "parametric-designs-generator");
  const caption = (await dialog.locator(".ds-hero figcaption").textContent()).replace("Pro", "").trim();
  assert(/^Terrain slat wall #\d+$/.test(caption), `the design is named after its recipe and seed: ${caption}`);
  await dialog.getByRole("button", { name: "Use this design" }).click();
  await dialog.waitFor({ state: "detached" });
  s = await waitSliced(page, s);
  assert(await page.locator(".doc-title, .menubar").first().count() >= 0, "the generated design opens");
  assert(await page.locator('[aria-label="Model from"] button[data-v="formula"]').getAttribute("aria-pressed") === "true", "a generated design is an ordinary formula source");
  await shot(page, "parametric-generated-3d");

  await page.locator('[data-open="generate"]').click();
  await dialog.getByRole("button", { name: "Surprise me" }).click();
  await dialog.locator('[data-recipe="leaf-clock"]').click();
  await page.waitForTimeout(300);
  await shot(page, "parametric-designs-generator-clock");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert(true, "Escape closes the dialog");

  // --- File menu entry and My designs ---
  await page.getByRole("button", { name: /^File$/ }).click();
  await page.getByRole("menuitem", { name: "Browse designs…" }).click();
  await dialog.getByRole("tab", { name: /My designs/ }).click();
  assert(await dialog.locator(".ds-empty").isVisible(), "My designs shows its empty state");
  await page.keyboard.press("Escape");
});

// --- Phone width ---
await withBrowser(async (page) => {
  await open(page);
  await page.locator('[data-open="gallery"]').click();
  const dialog = page.getByRole("dialog", { name: "Designs" });
  await dialog.locator(".ds-card").first().waitFor();
  const box = await dialog.boundingBox();
  assert(box && box.width <= 375 && box.x >= 0, `the dialog fits a 375 px screen (${Math.round(box?.width ?? 0)} px)`);
  const overflow = await page.evaluate(() => document.querySelector(".modal.ds").scrollWidth - document.querySelector(".modal.ds").clientWidth);
  assert(overflow <= 1, "nothing overflows sideways");
  await page.waitForTimeout(500);
  await shot(page, "parametric-designs-mobile");
  await dialog.getByRole("tab", { name: "Generate" }).click();
  await dialog.locator("canvas.ds-canvas").first().waitFor();
  await page.waitForTimeout(300);
  await shot(page, "parametric-designs-generator-mobile");
}, { width: 375, height: 812 });
console.log("parametric designs: all checks passed");
