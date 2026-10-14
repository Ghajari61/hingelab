// End-to-end check of the editor polish (D159): sheet grid and labels, rail names, typed sums and
// units, the words field between presets, preset search, favourites, recent and Randomise.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase1.mjs.
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };
const hit = (a, b, pad = 0) => a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => { for (const k of Object.keys(localStorage)) if (/^hingelab-(fav|recent|locks)-/.test(k)) localStorage.removeItem(k); });
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=cloud-sky`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1500);

  // Sheets: a grid that fits the window, labels clear of every sheet.
  const sheetsBox = async () => {
    const rects = await page.locator("#world .sheet-rect").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    const labels = await page.locator("#world > g text").evaluateAll((els) => els.filter((e) => /^Sheet \d+ of/.test(e.textContent ?? "")).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    return { rects, labels };
  };
  const { rects, labels } = await sheetsBox();
  const view = await page.locator(".canvas").boundingBox();
  check(rects.length > 1, `the design takes several sheets (${rects.length})`);
  check(new Set(rects.map((r) => Math.round(r.x))).size > 1, "sheets sit in more than one column");
  check(rects.every((r) => r.x >= view.x - 1 && r.y >= view.y - 1 && r.x + r.width <= view.x + view.width + 1 && r.y + r.height <= view.y + view.height + 1), "Zoom to fit shows every sheet");
  check(!rects.some((a, i) => rects.some((b, j) => i < j && hit(a, b))), "sheets never overlap");
  check(labels.every((l) => !rects.some((r) => hit(l, r, -0.5))), `sheet labels clear of the sheets (${labels.length} shown)`);
  for (let i = 0; i < 8; i++) await page.getByRole("button", { name: "Zoom out" }).click();
  const far = await sheetsBox();
  check(far.labels.every((l) => !far.rects.some((r) => hit(l, r, -0.5))), `zoomed far out, labels still clear (${far.labels.length} shown)`);
  await page.getByRole("button", { name: "Fit sheet" }).click();

  // Rail names: one line, never broken inside a word, the full name in the tooltip.
  const cards = await page.locator(".gcard").evaluateAll((els) => els.map((b) => {
    const t = b.querySelector(".lbl .t"); const cs = t ? getComputedStyle(t) : null;
    return { text: t?.textContent ?? "", title: b.getAttribute("title") ?? "", nowrap: cs?.whiteSpace === "nowrap", lines: t ? Math.round(t.getBoundingClientRect().height / parseFloat(cs.lineHeight || "14")) : 0 };
  }));
  check(cards.length > 20 && cards.every((c) => c.nowrap && c.lines <= 1), `${cards.length} rail names stay on one line`);
  check(cards.every((c) => c.title.startsWith(c.text)), "every rail card has its full name as a tooltip");

  // Right panel: full label and help in the tooltip; typed sums and units.
  const twist = page.locator('.fld[data-id="design.shiftX"] label');
  check(/Vanishing point X[\s\S]*Moves the back cut-outs/.test((await twist.getAttribute("title")) ?? ""), "a long field name shows in full with its help");
  const border = page.locator("#f_frame\\.border");
  await border.fill("1/8in"); await border.press("Enter");
  check((await border.inputValue()) === "3.175", `"1/8in" reads as 3.175 mm (${await border.inputValue()})`);
  await border.fill("25.4*2"); await border.press("Enter");
  check((await border.inputValue()) === "50.8", `"25.4*2" reads as 50.8 (${await border.inputValue()})`);
  await border.fill("3mm"); await border.press("Enter");
  check((await border.inputValue()) === "3", `"3mm" reads as 3 (${await border.inputValue()})`);

  // Words: a preset without words leaves the field empty with a faded hint.
  const words = page.getByRole("textbox", { name: "Text", exact: true });
  check((await words.inputValue()) === "Sweet dreams", "the Sweet dreams preset brings its words");
  const presets = page.getByRole("group", { name: "Shadow Box presets" });
  await page.getByRole("searchbox", { name: "Search Shadow Box presets" }).fill("oval portal");
  await presets.locator(".gcard").first().click();
  await page.waitForTimeout(600);
  check((await words.inputValue()) === "", "the next preset without words leaves the field empty");
  const ph = await words.evaluate((e) => ({ text: e.placeholder, style: getComputedStyle(e, "::placeholder").fontStyle }));
  check(ph.text === "Add words (optional)" && ph.style === "italic", `the empty field shows a faded hint (${ph.text}, ${ph.style})`);

  // Preset search, favourites and recent.
  const search = page.getByRole("searchbox", { name: "Search Shadow Box presets" });
  await search.fill("moon");
  const names = await presets.locator(".gcard").evaluateAll((els) => els.map((e) => e.getAttribute("title") ?? ""));
  check(names.length > 0 && names.every((n) => /moon/i.test(n)), `search "moon" keeps ${names.length} matching presets`);
  await search.fill("zzzz");
  check(await page.getByText("No presets match").isVisible(), "a search without matches says so");
  await search.fill("");
  check(await page.getByRole("group", { name: "Shadow Box recent presets" }).locator(".gcard", { hasText: "Oval portal" }).count() === 1, "Recent lists the preset just used");
  await presets.locator(".gcell").nth(2).hover();
  await presets.getByRole("button", { name: /^Add .* to favourites$/ }).nth(2).click();
  check(await page.getByRole("group", { name: "Shadow Box favourite presets" }).locator(".gcard").count() === 1, "the star adds a preset to Favourites");

  // Randomise with a locked pattern; Ctrl+Z goes back.
  const pattern = () => page.getByRole("group", { name: "Pattern", exact: true }).locator('.gcard[aria-pressed="true"]').getAttribute("data-v");
  const before = await pattern();
  await page.getByRole("button", { name: "Lock Pattern" }).click();
  const shuffle = page.getByRole("button", { name: /^Randomise design/ });
  check(/1 locked/.test(await shuffle.innerText()), "the Randomise button counts the locked settings");
  const front = () => page.locator("#f_design\\.max").inputValue();
  const seen = new Set();
  for (let i = 0; i < 5; i++) { await shuffle.click(); await page.waitForTimeout(300); seen.add(await front()); check((await pattern()) === before, `randomise ${i + 1} keeps the locked pattern`); }
  check(seen.size > 1, `randomise changes the unlocked settings (front cut-out ${[...seen].join(", ")})`);
  const last = await front();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check((await front()) !== last || seen.size === 1, "Ctrl+Z undoes a randomise");
  await page.getByRole("button", { name: "Unlock Pattern" }).click();

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 1 checks passed.");
