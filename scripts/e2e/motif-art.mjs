// End-to-end check of your own motif (D169): every Motif choice offers Your picture (traced on the device)
// and Your text; the motif is engraved or scored like the built-in ones, survives a reload and undoes.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/motif-art.mjs.
import path from "node:path";
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  const uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.method() !== "GET" && /image|multipart/.test(r.headers()["content-type"] ?? "")) uploads.push(r.url()); });

  const openAll = () => page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  /** Engraved regions on the canvas (subpaths of the engrave fills). */
  const engraved = () => page.locator(".canvas svg path.engrave").evaluateAll((ps) => ps.reduce((a, p) => a + ((p.getAttribute("d") ?? "").match(/M/g)?.length ?? 0), 0));
  const drawing = () => page.locator(".canvas svg").first().evaluate((s) => [...s.querySelectorAll("path")].map((p) => p.getAttribute("d")?.length ?? 0).join(","));
  const settle = () => page.waitForTimeout(900);
  const motifCard = (name, v) => page.getByRole("group", { name, exact: true }).locator(`.gcard[data-v="${v}"]`);

  // ---- Sign: the motif rail offers Your picture and Your text.
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.locator(".canvas svg path.engrave").first().waitFor({ timeout: 30000 });
  await settle();
  await openAll();
  const flower = await engraved();
  check(await motifCard("Motif", "picture").count() === 1 && await motifCard("Motif", "text").count() === 1, "the Motif rail offers Your picture and Your text");

  await motifCard("Motif", "picture").click();
  await settle();
  await openAll();
  const input = page.locator('input[type=file][aria-label="Motif picture"]');
  check(await input.count() === 1, "Your picture shows a picture field");
  check(await page.getByText("Your images stay on your device: the picture is traced here").isVisible(), "which says the picture stays on the device");
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 300; c.height = 300;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 300, 300);
    g.fillStyle = "#111"; g.beginPath(); g.arc(150, 150, 120, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(150, 150, 60, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#111"; g.fillRect(135, 100, 30, 100);
    return c.toDataURL("image/png").split(",")[1];
  });
  await input.setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.locator(".gen-image-name", { hasText: "logo" }).waitFor({ timeout: 20000 });
  await settle();
  const pic = await engraved();
  check(pic > 0 && pic !== flower, `the traced picture is engraved as the motif (${flower} → ${pic} regions)`);
  check(await page.getByRole("checkbox", { name: "Use the light parts" }).count() === 1, "the picture can use its light parts instead");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "motif-picture.png") });

  // Score instead of engrave.
  await page.getByRole("group", { name: "Mark", exact: true }).getByRole("button", { name: "Score" }).click();
  await settle();
  const before = await drawing();
  check(await engraved() === 0, "Score traces the picture's outlines instead of engraving it");
  await page.keyboard.press("Control+z");
  await settle();
  check(await engraved() === pic && (await drawing()) !== before, "Undo brings the engraving back");

  // Your text.
  await motifCard("Motif", "text").click();
  await settle();
  await openAll();
  const motifText = page.getByRole("textbox", { name: "Motif text", exact: true });
  check(await motifText.count() === 1, "Your text shows a text field and a font");
  await motifText.fill("AB");
  await motifText.blur();
  await settle();
  const ab = await engraved();
  check(ab > 0 && ab !== pic, `the typed words are engraved as the motif (${ab} regions)`);

  // Autosave keeps it.
  await page.waitForTimeout(1500);
  await page.reload();
  await page.locator(".canvas svg path.engrave").first().waitFor({ timeout: 30000 });
  await settle();
  await openAll();
  check(await page.getByRole("textbox", { name: "Motif text", exact: true }).inputValue() === "AB", "after a reload the motif text is still there");
  check(await engraved() === ab, "and drawn the same");

  // ---- Boxes: the lid engraving's Motif list, engraved or scored.
  await page.goto(`${BASE}/app/editor/local?p=boxes&preset=jewellery-box`);
  await page.locator(".canvas svg path.engrave").first().waitFor({ timeout: 30000 });
  await settle();
  await openAll();
  const sel = page.getByRole("combobox", { name: "Motif", exact: true });
  const opts = await sel.locator("option").evaluateAll((os) => os.map((o) => o.value));
  check(opts[0] === "none" && opts[1] === "picture" && opts[2] === "text", "the lid's Motif list starts None, Your picture, Your text");
  const heart = await engraved();
  await sel.selectOption("text");
  await settle();
  await openAll();
  await page.getByRole("textbox", { name: "Motif text", exact: true }).fill("J&M");
  await page.getByRole("textbox", { name: "Motif text", exact: true }).blur();
  await settle();
  const jm = await engraved();
  check(jm > 0 && jm !== heart, `typed initials are engraved on the lid (${heart} → ${jm} regions)`);
  await page.getByRole("group", { name: "Mark", exact: true }).getByRole("button", { name: "Score" }).click();
  await settle();
  check(await engraved() === 0, "the lid's Mark can score the art instead");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "motif-boxes.png") });

  // ---- The other designs offer it too.
  for (const [p, group] of [["tablenum", "Motif"], ["keyrack", "Motif"], ["topper", "Motif"], ["trophy", "Motif"]]) {
    await page.goto(`${BASE}/app/editor/local?p=${p}`);
    await page.locator(".canvas svg").first().waitFor({ timeout: 30000 });
    await settle();
    if (p === "trophy") { await page.getByRole("group", { name: "Emblem", exact: true }).locator('.gcard[data-v="motif"]').click(); await settle(); }
    await openAll();
    check(await motifCard(group, "picture").count() === 1 && await motifCard(group, "text").count() === 1, `${p}: the Motif rail offers Your picture and Your text`);
  }

  check(uploads.length === 0, "no picture is uploaded anywhere");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
});

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nall passed");
