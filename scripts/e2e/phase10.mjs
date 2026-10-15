// End-to-end check of polish and robustness (D168): a parameter change redraws the preview in about
// 100 ms; nesting by outline runs in the background with progress and Cancel and holds the export
// until it is done; touching parts share their cut lines once in an export; every control has a
// name for screen readers and a visible focus; the menus work from the keyboard; tablet widths keep
// the whole editor; and a phone gets the simple flow (preset, text, export) with the full editor a
// tap away.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase10.mjs.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

async function grab(page, act) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), act()]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const data = fs.readFileSync(file);
  fs.rmSync(file);
  return { name: dl.suggestedFilename(), data };
}

const ROLES = new Set(["button", "link", "textbox", "combobox", "checkbox", "radio", "slider", "spinbutton", "menuitem", "menuitemcheckbox", "menuitemradio", "tab", "searchbox", "switch", "listbox"]);

/** Controls the accessibility tree shows without a name. */
async function unnamed(page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const out = [];
  for (const n of nodes) {
    if (n.ignored || !ROLES.has(n.role?.value) || (n.name?.value ?? "").trim()) continue;
    let html = "";
    try {
      const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: n.backendDOMNodeId });
      html = (await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function(){return this.outerHTML.slice(0,100)}", returnByValue: true })).result.value;
    } catch { /* detached */ }
    out.push(`${n.role.value} ${html}`);
  }
  await cdp.detach();
  return out;
}

/** Tab through the page; return the stops whose look does not change when focused. */
async function unseenFocus(page, steps) {
  const bad = new Set();
  let stops = 0;
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press("Tab");
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const look = () => [el, el.parentElement, ...el.querySelectorAll(".knob")].filter(Boolean).map((e) => {
        const s = getComputedStyle(e);
        return [s.outlineStyle, s.outlineWidth, s.boxShadow, s.borderColor, s.backgroundColor, s.color].join("|");
      }).join(";");
      const on = look();
      el.blur();
      const off = look();
      el.focus({ focusVisible: true });
      return { same: on === off, html: el.outerHTML.slice(0, 100) };
    });
    if (!r) continue;
    stops++;
    if (r.same) bad.add(r.html);
  }
  return { stops, bad: [...bad] };
}

/** Time from a key press on a focused slider until the drawing has settled (its last change). */
async function previewMs(page, slider, presses = 7) {
  const s = page.getByRole("slider", { name: slider, exact: true }).first();
  await s.focus();
  const times = [];
  for (let i = 0; i < presses; i++) {
    await page.evaluate(() => {
      const draw = document.querySelector(".stage .canvas svg") ?? document.querySelector(".stage");
      window.__t = { t0: 0, t1: 0 };
      const mo = new MutationObserver(() => { if (window.__t.t0) window.__t.t1 = performance.now(); });
      mo.observe(draw, { subtree: true, childList: true, attributes: true, attributeFilter: ["d", "points", "x", "y", "width", "height", "transform", "viewBox"] });
      window.__mo = mo;
      document.addEventListener("keydown", () => { window.__t.t0 = performance.now(); }, { capture: true, once: true });
    });
    await page.keyboard.press(i % 2 ? "ArrowDown" : "ArrowUp");
    await page.waitForTimeout(1200);
    const t = await page.evaluate(() => { window.__mo.disconnect(); return window.__t.t1 - window.__t.t0; });
    if (t > 0) times.push(t);
  }
  times.sort((a, b) => a - b);
  return times.length ? times[times.length >> 1] : Infinity;
}

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const uploads = [];
  page.on("request", (r) => { if (r.method() === "POST" && !r.url().startsWith(BASE)) uploads.push(r.url()); });

  const openAll = () => page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const toast = (re, what, timeout = 8000) => page.locator(".toast").filter({ hasText: re }).first().waitFor({ timeout }).then(() => check(true, what), () => check(false, what));
  const sheetSec = () => page.locator("details.sec").filter({ has: page.locator("summary", { hasText: /^Sheet/ }) }).first();
  const go = async (p, wait = 3000) => { await page.goto(`${BASE}/app/editor/local?p=${p}`); await page.waitForTimeout(wait); };

  // ---- Preview speed.
  for (const [p, slider] of [["sign", "Margin slider"], ["boxes", "Width slider"], ["hinge", "Width slider"]]) {
    await go(p);
    await openAll();
    const ms = await previewMs(page, slider);
    check(ms < 100, `${p}: a slider step redraws the preview in ${Math.round(ms)} ms (median, under 100)`);
  }

  // ---- Nesting by outline in the background, with Cancel.
  await page.evaluate(() => localStorage.removeItem("hingelab-gen-boxes-v1"));
  await go("boxes");
  await openAll();
  const chip = page.locator(".nest-chip");
  const copies = sheetSec().getByRole("textbox", { name: "Copies", exact: true });
  await copies.fill("12");
  await copies.blur();
  await page.waitForTimeout(1500);
  await sheetSec().getByRole("button", { name: "By outline", exact: true }).click();
  const shown = await chip.waitFor({ timeout: 4000 }).then(() => true, () => false);
  check(shown, "By outline starts nesting in the background with a progress chip");
  if (shown) {
    check(await chip.getByRole("progressbar", { name: "Nesting progress" }).count() === 1 && await chip.getByRole("button", { name: "Cancel" }).count() === 1, "the chip has a named progress bar and a Cancel button");
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Control+e");
    await toast(/Still nesting the parts by shape/, "Ctrl+E while nesting says to wait instead of exporting a half-made layout", 3000);
    const t0 = Date.now();
    const hit = await chip.getByRole("button", { name: "Cancel" }).click({ timeout: 5000 }).then(() => true, () => false);
    check(hit && await chip.waitFor({ state: "detached", timeout: 3000 }).then(() => Date.now() - t0 < 2000, () => false), "Cancel stops it at once and the box layout stays");
  }
  await copies.fill("1");
  await copies.blur();
  await page.waitForTimeout(1500);
  await sheetSec().getByRole("button", { name: "By box", exact: true }).click();
  await page.waitForTimeout(800);
  await sheetSec().getByRole("button", { name: "By outline", exact: true }).click();
  const done = await chip.waitFor({ timeout: 4000 }).then(() => chip.waitFor({ state: "detached", timeout: 60000 }).then(() => true, () => false), () => true);
  check(done && await page.locator(".canvas-error").count() === 0, "left alone, the outline nest finishes and the chip goes");
  const nested = await grab(page, () => page.getByRole("button", { name: "Export SVG", exact: true }).click());
  check(nested.data.toString("utf8").startsWith("<svg") || nested.data.toString("utf8").includes("<svg"), `then Export SVG works (${nested.name})`);
  await sheetSec().getByRole("button", { name: "By box", exact: true }).click();
  await page.waitForTimeout(800);

  // ---- Shared cut lines are cut once.
  const gap = sheetSec().getByRole("textbox", { name: "Spacing", exact: true });
  await gap.fill("0");
  await gap.blur();
  await page.waitForTimeout(2000);
  const flat = await grab(page, () => page.getByRole("button", { name: "Export SVG", exact: true }).click());
  await toast(/\d+ mm of cut line that touching parts share is cut once, not twice/, "with Spacing 0, Export SVG cuts the shared lines once and says how much");
  const svg = flat.data.toString("utf8");
  check(/width="[\d.]+mm"/.test(svg) && /viewBox="0 0 [\d.]+ [\d.]+"/.test(svg), "the file is sized in millimetres, one unit per mm");
  const guide = page.locator("details.gen-assembly");
  check(/The parts touch on the sheet \(Spacing 0\)/.test(await guide.first().textContent().catch(() => "")), "the assembly steps start with separating the touching parts");
  await page.getByRole("button", { name: "More…" }).click();
  const exp = page.getByRole("dialog", { name: "Export" });
  await exp.waitFor();
  check(await exp.getByRole("checkbox", { name: /Cut shared lines once/ }).isChecked(), "the Export dialog has “Cut shared lines once”, on by default");
  await page.keyboard.press("Escape");
  await gap.fill("4");
  await gap.blur();
  await page.waitForTimeout(800);

  // ---- Names, focus and menus from the keyboard.
  for (const [p, wait] of [["sign", 3000], ["boxes", 3000], ["hinge", 3000], ["letters", 6000], ["parametric", 6000]]) {
    await go(p, wait);
    await openAll();
    const u = await unnamed(page);
    check(u.length === 0, `${p}: every control has a name for screen readers${u.length ? `: ${u.slice(0, 5).join(" · ")}` : ""}`);
    const f = await unseenFocus(page, 90);
    check(f.stops > 30 && f.bad.length === 0, `${p}: ${f.stops} Tab stops, each with a visible focus${f.bad.length ? `; not: ${f.bad.slice(0, 4).join(" · ")}` : ""}`);
  }
  await go("sign");
  const nav = page.getByRole("navigation", { name: "Main menu" });
  const file = nav.getByRole("button", { name: "File", exact: true });
  check(await file.getAttribute("aria-haspopup") === "menu", "menu buttons say they open a menu");
  await file.focus();
  await page.keyboard.press("ArrowDown");
  const fileMenu = page.getByRole("menu", { name: "File" });
  check(await fileMenu.waitFor({ timeout: 2000 }).then(() => true, () => false) && await file.getAttribute("aria-expanded") === "true", "ArrowDown on File opens its menu");
  const focusedItem = () => page.evaluate(() => document.activeElement?.getAttribute("role") + ":" + document.activeElement?.textContent?.trim());
  const first = await focusedItem();
  check(first.startsWith("menuitem:"), `with the first item focused (${first})`);
  await page.keyboard.press("ArrowDown");
  check((await focusedItem()) !== first, "ArrowDown moves to the next item");
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  check((await focusedItem()) === first, "Home goes back to the first");
  await page.keyboard.press("ArrowRight");
  check(await page.getByRole("menu", { name: "Edit" }).isVisible().catch(() => false), "ArrowRight moves to the Edit menu");
  await page.keyboard.press("Escape");
  check(await page.getByRole("menu").count() === 0 && await page.evaluate(() => document.activeElement?.textContent?.trim()) === "Edit", "Escape closes it and puts focus back on its menu button");

  // ---- Tablets keep the whole editor.
  for (const [w, h, p] of [[820, 1180, "sign"], [1024, 768, "hinge"], [1024, 768, "boxes"], [820, 1180, "letters"]]) {
    await page.setViewportSize({ width: w, height: h });
    await go(p, p === "letters" ? 6000 : 3000);
    const lay = await page.evaluate(() => {
      const box = (s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && r.width > 200 && r.height > 300 && r.left >= -1 && r.right <= innerWidth + 1 && r.top < innerHeight / 2 ? Math.round(r.width) : 0; };
      return { over: document.documentElement.scrollWidth - innerWidth, dock: box(".dock-col"), stage: box(".stage"), phone: !!document.querySelector(".phone-flow") };
    });
    const exportBtn = await page.getByRole("button", { name: /^Export( SVG)?$/ }).first().isVisible().catch(() => false);
    check(lay.over <= 0 && lay.dock > 0 && lay.stage > 0 && exportBtn && !lay.phone, `${p} at ${w}×${h}: no sideways scrolling; settings (${lay.dock} px) and drawing (${lay.stage} px) side by side on the first screen, with Export${lay.over > 0 || !exportBtn ? ` (overflow ${lay.over} px, Export ${exportBtn ? "shown" : "hidden"})` : ""}`);
    if (process.env.E2E_SHOTS && p === "sign") await page.screenshot({ path: path.join(process.env.E2E_SHOTS, `phase10-tablet-${w}.png`) });
  }

  // ---- A phone gets the simple flow.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => sessionStorage.removeItem("hingelab-full-editor"));
  await go("sign");
  const steps = page.getByRole("navigation", { name: "Steps" });
  check(await steps.isVisible().catch(() => false) && await page.locator(".dock-col").count() === 0, "a phone opens the simple flow, not the full editor");
  check(await steps.getByRole("button", { name: /Choose a design/ }).getAttribute("aria-current") === "step", "starting at “Choose a design”");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "with no sideways scrolling");
  const cards = page.locator(".pf-card:not(.keep)");
  const picked = (await cards.nth(1).innerText()).trim();
  await cards.nth(1).click();
  await page.getByRole("heading", { name: "Make it yours" }).waitFor();
  check(true, `picking “${picked}” goes to “Make it yours”`);
  const text = page.getByRole("textbox", { name: "Text", exact: true });
  check(await text.isVisible(), "which offers the text");
  await text.fill("PHONE");
  await text.blur();
  const preview = page.getByRole("img", { name: /^Preview:/ });
  check(await preview.waitFor({ timeout: 8000 }).then(() => true, () => false), "and shows a preview");
  const u = await unnamed(page);
  check(u.length === 0, `every control in the phone flow has a name${u.length ? `: ${u.slice(0, 4).join(" · ")}` : ""}`);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase10-phone.png") });
  await page.getByRole("button", { name: "Next: export" }).click();
  const phoneSvg = await grab(page, () => page.getByRole("button", { name: "Download SVG" }).click());
  check(phoneSvg.name.endsWith(".svg") && /width="[\d.]+mm"/.test(phoneSvg.data.toString("utf8")), `Download SVG gives the file (${phoneSvg.name})`);
  const phoneDxf = await grab(page, () => page.getByRole("button", { name: "Download DXF" }).click());
  check(phoneDxf.name.endsWith(".dxf") && phoneDxf.data.toString("latin1").includes("ENTITIES"), `and Download DXF too (${phoneDxf.name})`);
  await page.getByRole("button", { name: "Full editor" }).first().click();
  await page.locator(".dock-col").first().waitFor({ timeout: 8000 });
  check(await steps.count() === 0, "Full editor switches to the whole editor");
  check((await page.getByRole("textbox", { name: "Text", exact: true }).inputValue()) === "PHONE", "keeping the text typed on the phone");
  await page.reload();
  await page.waitForTimeout(3000);
  check(await page.locator(".dock-col").count() > 0, "and stays there after a reload in this tab");
  await page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: "View", exact: true }).click();
  await page.getByRole("menuitem", { name: "Simple phone view" }).click();
  check(await steps.waitFor({ timeout: 5000 }).then(() => true, () => false), "View › Simple phone view goes back to the simple flow");
  await page.getByRole("button", { name: "All products" }).click();
  await page.waitForTimeout(2500);
  check(!page.url().includes("p=sign"), "All products leaves the editor");

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 10 checks passed.");
