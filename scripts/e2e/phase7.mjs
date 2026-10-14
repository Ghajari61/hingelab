// End-to-end check of text and typography (D165): a WOFF font uploaded in a generator and used at once,
// WOFF2 refused with a reason, Persian text shaped with a Persian font, stencil bridges and text round
// a circle (with undo and autosave), and Shadow Box words on a chosen layer, engraved with a laser,
// and a word used as the picture shape.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase7.mjs.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

/** A WOFF 1.0 file of a TrueType font: each table zlib-compressed on its own. */
function toWoff(sfnt) {
  const n = sfnt.readUInt16BE(4);
  const tables = Array.from({ length: n }, (_, i) => {
    const d = 12 + i * 16, off = sfnt.readUInt32BE(d + 8), len = sfnt.readUInt32BE(d + 12);
    const raw = sfnt.subarray(off, off + len), z = zlib.deflateSync(raw);
    return { tag: sfnt.readUInt32BE(d), sum: sfnt.readUInt32BE(d + 4), orig: len, data: z.length < len ? z : raw };
  });
  const pad = (k) => (k + 3) & ~3;
  const size = tables.reduce((s, t) => s + pad(t.data.length), 44 + 20 * n);
  const out = Buffer.alloc(size);
  out.writeUInt32BE(0x774f4646, 0);
  out.writeUInt32BE(sfnt.readUInt32BE(0), 4);
  out.writeUInt32BE(size, 8);
  out.writeUInt16BE(n, 12);
  let at = 44 + 20 * n;
  tables.forEach((t, i) => {
    const d = 44 + i * 20;
    out.writeUInt32BE(t.tag, d);
    out.writeUInt32BE(at, d + 4);
    out.writeUInt32BE(t.data.length, d + 8);
    out.writeUInt32BE(t.orig, d + 12);
    out.writeUInt32BE(t.sum, d + 16);
    t.data.copy(out, at);
    at += pad(t.data.length);
  });
  return out;
}

const WOFF = toWoff(fs.readFileSync(path.join(process.cwd(), "public/fonts/ArchivoBlack-Regular.ttf")));

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const uploads = [];
  page.on("request", (r) => { if (r.method() === "POST" && !r.url().startsWith(BASE)) uploads.push(r.url()); });

  const drawing = () => page.locator(".canvas svg").first().evaluate((s) => [...s.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "").join("|"));
  const saved = (key) => page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) ?? "{}"); return s.params ?? s; }, key);
  const openAll = () => page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const codes = () => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
  const setNum = async (key, v) => {
    const f = page.locator(`#f_${key.replace(".", "\\.")}`);
    await f.fill(String(v));
    await f.press("Enter");
    await page.waitForTimeout(700);
  };
  const setText = async (name, v) => {
    const t = page.getByRole("textbox", { name, exact: true });
    await t.fill(v);
    await t.blur();
    await page.waitForTimeout(1200);
  };

  // ---- Sign: stencil bridges and a circle.
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.waitForTimeout(2500);
  await openAll();
  await setText("Text", "BOAR");
  const flat = await drawing();
  await setNum("textForm.stencil", 1.5);
  const stencil = await drawing();
  check(stencil !== flat, "stencil bridges redraw the letters");
  check((await saved("hingelab-gen-sign-v1"))?.textForm?.stencil === 1.5, "the stencil width is autosaved");
  await setNum("textForm.stencil", 0);
  await setNum("textForm.circle", 160);
  const ring = await drawing();
  check(ring !== flat && ring !== stencil, "Round a circle sets the text round a circle");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(700);
  check(await page.locator("#f_textForm\\.circle").inputValue() === "0", "Ctrl+Z takes the circle off in one step");
  check(!(await codes()).includes("MISSING_GLYPHS"), "the default font sets the text");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase7-sign.png") });

  // A WOFF font uploaded here is used at once and kept on the device.
  const fontInput = page.locator(".gen-font input[type=file]").first();
  check((await fontInput.getAttribute("accept"))?.includes(".woff"), "the font upload accepts WOFF files");
  const before = await drawing();
  await fontInput.setInputFiles({ name: "MyFont.woff", mimeType: "font/woff", buffer: WOFF });
  const added = page.locator(".toast").filter({ hasText: /Added .* on this device/ }).first();
  await added.waitFor({ timeout: 10000 }).catch(() => {});
  const note = await added.innerText().catch(() => "");
  check(/Added Archivo Black/.test(note), `the WOFF font is added on this device (“${note}”)`);
  await page.waitForTimeout(1500);
  const fontId = (await saved("hingelab-gen-sign-v1"))?.text?.fontId ?? "";
  check(fontId.startsWith("upload:"), `the sign uses the uploaded font (${fontId})`);
  const shown = await page.locator(".gen-font .fp-name").first().innerText();
  check(/^Archivo Black/.test(shown), `the font picker shows its name (“${shown}”)`);
  check(await drawing() !== before, "the letters are redrawn in the uploaded font");
  check(await page.locator(".err[role=alert], .canvas-error").count() === 0, "no error with the uploaded font");
  await fontInput.setInputFiles({ name: "web.woff2", mimeType: "font/woff2", buffer: Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0, 0]) });
  await page.locator(".toast").filter({ hasText: /WOFF2 fonts cannot be read yet/ }).first().waitFor({ timeout: 5000 })
    .then(() => check(true, "a WOFF2 font is refused with a reason"), () => check(false, "a WOFF2 font is refused with a reason"));

  // Persian, shaped right to left with joined letters.
  await setText("Text", "سلام دوست");
  await page.locator(".gen-font button[aria-haspopup=listbox]").first().click();
  await page.getByRole("group", { name: "Font style" }).getByRole("button", { name: "Persian" }).click();
  await page.locator('.fp-opt[data-font="vazirmatn"]').click();
  await page.waitForTimeout(2000);
  check((await saved("hingelab-gen-sign-v1"))?.text?.fontId === "vazirmatn", "Vazirmatn is picked from the Persian fonts");
  check(!(await codes()).includes("MISSING_GLYPHS"), "Vazirmatn has every Persian letter");
  const fa = await drawing();
  check(fa.length > 200 && fa !== before, "the Persian text is drawn");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase7-persian.png") });

  // ---- Shadow Box: a word as the shape, words on a layer, engraved words.
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=cat-rings`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1200);
  await openAll();
  const cat = await drawing();
  await setText("Word as the shape", "HI");
  await page.waitForTimeout(1000);
  check(await drawing() !== cat, "a word replaces the sample shape");
  check(await page.getByRole("group", { name: "Sample shape" }).count() === 0, "the sample rail hides while a word is the shape");
  check(await page.locator(".gen-font .rowlabel", { hasText: "Shape font" }).count() === 1, "the word has its own font");
  check((await saved("hingelab-gen-shadowbox-v1"))?.picture?.word === "HI", "the word is autosaved");

  await setText("Text", "Love");
  const onFront = await drawing();
  await setNum("text.layer", 3);
  check(await drawing() !== onFront, "the words move to Layer 3");
  check((await saved("hingelab-gen-shadowbox-v1"))?.text?.layer === 3, "the layer is autosaved");
  check(await page.getByText("Engrave the words").count() === 0, "a blade cutter does not offer engraving");
  await page.getByRole("group", { name: "Cutter" }).getByRole("button", { name: "Laser" }).click();
  await page.waitForTimeout(800);
  await openAll();
  const cut = await drawing();
  await page.getByText("Engrave the words").click();
  await page.waitForTimeout(1200);
  check(await drawing() !== cut, "engraving the words redraws Layer 3");
  check(/engraved on Layer 3/.test(await page.locator("body").innerText()), "the assembly steps say where the words are engraved");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase7-shadowbox.png") });

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 7 checks passed.");
