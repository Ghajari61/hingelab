// G6 (D94): xTool Studio gaps — text bent along a clock dial with numerals that follow it, an engraved
// border on a sign, copies of a whole set on the sheets, DXF export, and Parametric's all-sheets SVG.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, shot, signInAsPro, withBrowser } from "./lib.mjs";

// Live runs cannot create a Pro user (that needs the local Supabase stack), so they skip the Pro-only exports.
const live = !/localhost|127\.0\.0\.1/.test(BASE);
const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 4 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const openSec = (page, title) => page.locator(".dock details.sec").evaluateAll((els, t) => { for (const d of els) if (d.querySelector("summary")?.textContent?.trim().startsWith(t)) d.open = true; }, title);
const setNum = async (page, key, v) => {
  const el = page.locator(`[id="f_${key}"]`);
  await el.fill(String(v));
  await el.blur();
};
const download = async (page, click) => {
  const [d] = await Promise.all([page.waitForEvent("download"), click()]);
  const file = path.join(OUT, d.suggestedFilename());
  await d.saveAs(file);
  const text = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  return { name: d.suggestedFilename(), text };
};
const paths = (svg) => (svg.match(/<path /g) ?? []).length;
const isDXF = (t) => /^\s*0\r?\nSECTION/.test(t) && /\nPOLYLINE\r?\n/.test(t) && /\nEOF\s*$/.test(t);

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g6")) { localStorage.clear(); sessionStorage.setItem("g6", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");

  // The station clock: an arched title along the top and numerals turned to follow the dial.
  const station = page.locator('img[src="/presets/clock/station.svg"]').first();
  await station.scrollIntoViewIfNeeded();
  check(await station.count() === 1, "the Station clock preset shows its thumbnail");
  await station.click();
  await page.waitForSelector('.gen-app[data-generator="clock"]');
  await drawn(page);
  await page.waitForTimeout(800);
  await openSec(page, "Text on the dial");
  check((await page.getByRole("textbox", { name: "Text", exact: true }).inputValue()) === "GRAND CENTRAL", "the preset carries its text on the dial");
  check(await page.getByRole("checkbox", { name: "Follow the dial" }).isChecked(), "its numerals follow the dial");
  await shot(page, "g6-station");

  // Along the bottom, reading left to right.
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("EST. 2026");
  await page.getByRole("group", { name: "Position" }).getByRole("button", { name: "Bottom" }).click();
  await page.waitForTimeout(800);
  await drawn(page);
  check(!(await codes(page)).some((c) => c.startsWith("INSCRIPTION")), "the bottom text fits without a warning");
  await shot(page, "g6-clock-bottom");

  // Too long for the dial: flagged, and the fix makes it fit.
  await page.getByRole("textbox", { name: "Text", exact: true }).fill("A VERY LONG MOTTO ON A SMALL CLOCK FACE");
  await setNum(page, "inscription.size", 16);
  await page.waitForSelector('.checks li.issue[data-code="INSCRIPTION_LONG"]');
  check(true, "text wrapping past half the dial is flagged");
  await page.locator('.checks li.issue[data-code="INSCRIPTION_LONG"]').getByRole("button").first().click();
  await page.waitForTimeout(800);
  check(!(await codes(page)).includes("INSCRIPTION_LONG"), "its fix (smaller text) clears it");

  // The clock as a DXF.
  const dxf = await download(page, () => page.locator(".btn-export-alt", { hasText: "DXF" }).click());
  check(/\.dxf$/.test(dxf.name) && isDXF(dxf.text), `the DXF button saves an R12 DXF (${dxf.name}, ${dxf.text.length} bytes)`);
  check(!/NaN|undefined/.test(dxf.text), "the DXF is clean");
});

// The office sign: an engraved border following the rounded outline.
await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g6b")) { localStorage.clear(); sessionStorage.setItem("g6b", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  const sign = page.locator('img[src="/presets/boxes/office-sign.svg"]').first();
  await sign.scrollIntoViewIfNeeded();
  check(await sign.count() === 1, "the Office sign preset shows its thumbnail");
  await sign.click();
  await page.waitForSelector('.gen-app[data-generator="boxes"]');
  await drawn(page);
  check(Number(await page.locator('[id="f_sign.border"]').inputValue()) === 5, "the sign has a border 5 mm in");
  const withBorder = (await download(page, () => page.keyboard.press("Control+e"))).text;
  await setNum(page, "sign.border", 0);
  await page.waitForTimeout(600);
  const without = (await download(page, () => page.keyboard.press("Control+e"))).text;
  check(paths(withBorder) > paths(without) || withBorder.length > without.length + 200, "the border adds an engraved band");
  await setNum(page, "sign.border", 5);
  await page.waitForTimeout(600);
  await drawn(page);
  await shot(page, "g6-sign-border");

  // Three sets on the sheets.
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.waitForSelector('.gen-app[data-generator="boxes"]');
  await drawn(page);
  const one = (await download(page, () => page.keyboard.press("Control+e"))).text;
  await openSec(page, "Sheet");
  await setNum(page, "sheet.copies", 3);
  await page.waitForTimeout(1000);
  await drawn(page);
  const three = (await download(page, () => page.keyboard.press("Control+e"))).text;
  check(paths(three) >= 2.5 * paths(one), `three copies triple the parts (${paths(one)} → ${paths(three)} paths)`);
  check(!/NaN|undefined/.test(three), "the export is clean");
  check(/Parts\s+6\b/.test(await page.evaluate(() => document.body.innerText)), "the status bar counts every copy (Parts 6)");
  await page.locator('[id="f_sheet.copies"]').scrollIntoViewIfNeeded();
  await shot(page, "g6-copies");
  const dxf = await download(page, () => page.locator(".btn-export-alt", { hasText: "DXF" }).click());
  check(isDXF(dxf.text) && (dxf.text.match(/\nPOLYLINE\r?\n/g) ?? []).length >= paths(three), "the copies export as DXF too");
});

// Parametric: Export SVG saves every sheet in one file (Pro, so local only).
if (!live) {
  let cleanup = async () => {};
  await withBrowser(async (page) => {
    cleanup = await signInAsPro(page, "g6");
    await page.addInitScript(() => { if (!sessionStorage.getItem("g6c")) { localStorage.clear(); sessionStorage.setItem("g6c", "1"); } });
    await page.goto(`${BASE}/app/editor/local`);
    await page.waitForSelector(".start-tile");
    await page.locator('[data-preset="folded-sphere"]').first().click();
    await page.waitForFunction(() => /\d+ parts/.test(document.querySelector(".pe-stage")?.textContent ?? "") && !document.querySelector(".pe-progress"), null, { timeout: 120000 });
    await page.waitForTimeout(1000);
    const all = await download(page, () => page.keyboard.press("Control+e"));
    const n = Number(/(\d+) sheets? stacked/.exec(all.text)?.[1] ?? 0);
    check(/\.svg$/.test(all.name) && n >= 1, `Export SVG saves every sheet in one file (${n} sheet${n === 1 ? "" : "s"}, ${all.name})`);
    const one = await download(page, () => page.getByRole("button", { name: "Export this sheet (SVG)" }).click());
    check(n === 1 ? paths(all.text) === paths(one.text) : paths(all.text) > paths(one.text), "it holds the parts of every sheet");
    const dxf = await download(page, () => page.getByRole("button", { name: "Export all sheets (DXF)" }).click());
    check(/\.dxf$/.test(dxf.name) && isDXF(dxf.text), "Export all sheets (DXF) saves a DXF");
    await page.getByRole("button", { name: "Export all sheets (DXF)" }).scrollIntoViewIfNeeded();
    await shot(page, "g6-parametric-export");
  }).finally(() => cleanup());
}
