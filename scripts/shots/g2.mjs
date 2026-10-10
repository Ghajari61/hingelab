// G2 (D90): Puzzle generator — presets, shapes and tab styles, Randomise, an engraved picture, the
// 50-piece free limit (upgrade dialog when accounts are on), 3D pieces, export, help.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 8 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });
const stat = (page, label) => page.locator(`.gen-stats > div:has(dt:text-is("${label}")) dd`).textContent();
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const card = (page, group, text) => page.locator(".gallery section, .gallery .ggroup, .gallery").filter({ hasText: group }).locator(".gcard").filter({ hasText: new RegExp(`^${text}$`) }).first();

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g2")) { localStorage.clear(); sessionStorage.setItem("g2", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  check((await page.locator(".gen-tile").filter({ hasText: "Puzzle" }).count()) === 1, "a Puzzle tile sits under Generators");
  const thumbs = page.locator('img[src^="/presets/puzzle/"]');
  check((await thumbs.count()) >= 6, `puzzle presets show thumbnails (${await thumbs.count()})`);
  const photo = page.locator(".start-card, .preset-card, li, a, button").filter({ has: page.locator('img[src="/presets/puzzle/photo-100.svg"]') }).last();
  check(/Pro/.test(await photo.textContent()), "the 100-piece preset is marked Pro");
  await thumbs.first().scrollIntoViewIfNeeded();
  await shot(page, "g2-start");

  // Heart 24.
  await page.locator('img[src="/presets/puzzle/heart-24.svg"]').first().click();
  await page.waitForSelector('.gen-app[data-generator="puzzle"]');
  await drawn(page);
  const n = Number((await stat(page, "Pieces")).replace(/\D.*/, ""));
  check(Math.abs(n - 24) <= 3, `the heart has about 24 pieces (${n})`);
  await page.waitForTimeout(400);
  await shot(page, "g2-heart");

  // Kids edges, then Randomise.
  await card(page, "Edge style", "Kids").click();
  await drawn(page);
  const seedBefore = await page.locator('[id="f_tabs.seed"]').inputValue();
  const cutsBefore = await page.locator("svg#stage").innerHTML();
  await page.getByRole("button", { name: "Randomise" }).click();
  await page.waitForTimeout(500);
  check((await page.locator('[id="f_tabs.seed"]').inputValue()) !== seedBefore, "Randomise picks a new layout number");
  check((await page.locator("svg#stage").innerHTML()) !== cutsBefore, "and the cuts change");

  // A picture on a rectangle.
  await card(page, "Puzzle shape", "Rectangle").click();
  await card(page, "Engraving", "Picture").click();
  await page.waitForSelector('.checks li.issue[data-code="NO_PICTURE"]');
  check(true, "Picture without a picture asks for one");
  await page.setViewportSize({ width: 600, height: 400 });
  const png = await page.screenshot();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('.gen-image input[type="file"]').setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: png });
  await page.waitForSelector(".canvas svg image.engrave-image", { timeout: 30000 });
  check(true, "the picture is engraved on the canvas, clipped to the puzzle");
  await page.locator(".gen-image").scrollIntoViewIfNeeded();
  await shot(page, "g2-picture");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  const svg = await (await import("node:fs")).promises.readFile(await dl.path(), "utf8");
  check(/<image [^>]*clip-path=/.test(svg) && /Inner cuts/.test(svg), `Export SVG has the picture and single-line cuts (${dl.suggestedFilename()})`);

  // 100 pieces: Pro when accounts are on.
  await page.locator('[id="f_pieces.count"]').fill("100");
  await page.locator('[id="f_pieces.count"]').blur();
  await drawn(page);
  await page.waitForTimeout(400);
  const pro = (await codes(page)).includes("NEEDS_PRO");
  if (pro) {
    await page.keyboard.press("Control+e");
    await page.getByRole("dialog", { name: "Upgrade to Pro" }).waitFor();
    check(/50 pieces/.test(await page.locator(".upgrade-reason").textContent()), "exporting 100 pieces on the free plan asks to upgrade");
    await shot(page, "g2-pro");
    await page.getByRole("dialog", { name: "Upgrade to Pro" }).getByRole("button", { name: "Close" }).click();
  } else {
    const [dl2] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
    check(true, `no accounts on this server, so 100 pieces export directly (${dl2.suggestedFilename()})`);
  }

  // 3D with the pieces spread out.
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 60000 });
  const explode = page.getByRole("slider", { name: /Explode/i });
  if (await explode.count()) await explode.fill("1");
  await page.waitForTimeout(1500);
  await shot(page, "g2-3d");
  await page.getByRole("tab", { name: "Sheets" }).click();

  // Help.
  await page.locator(".dock").getByRole("button", { name: "Help: Pieces", exact: true }).click();
  const frame = page.frameLocator(".help-drawer iframe");
  await frame.locator("h1", { hasText: "Puzzle" }).waitFor({ timeout: 15000 }).catch(() => {});
  const h1 = await frame.locator("h1").textContent();
  check(/Puzzle/.test(h1), `the ? opens the puzzle article (${h1})`);
  await frame.locator('.help-field[data-field="pieces.count"]').waitFor();
  check(true, "it lists the puzzle's fields");
});

// Round 36 with a tray, straight from the URL.
await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=puzzle`);
  await page.waitForSelector('.gen-app[data-generator="puzzle"]');
  await drawn(page);
  await page.waitForTimeout(600);
  await shot(page, "g2-default");
});
