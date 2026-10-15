// End-to-end check of sharing (D167): a share link opens the design read-only without touching the
// visitor's own autosave, Remix makes it theirs (and Ctrl+Z returns to theirs); pictures stay out of
// a link unless asked; a project file carries an uploaded font to a device that lacks it; the gallery
// is closed while its flag is off; Pro gates are off by default and lock Batch and LightBurn for a
// guest when a device switches them on; and share links in Hinge Box, Letters and Parametric.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase9.mjs.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
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

/** A WOFF 1.0 file of a TrueType font. */
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

  const saved = (key) => page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) ?? "{}"); return s.params ?? s; }, key);
  const openAll = () => page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const setText = async (name, v) => {
    const t = page.getByRole("textbox", { name, exact: true });
    await t.fill(v);
    await t.blur();
    await page.waitForTimeout(1200);
  };
  const menu = async (top, item) => {
    await page.getByRole("navigation", { name: "Main menu" }).getByRole("button", { name: top, exact: true }).click();
    await page.getByRole("menuitem", { name: item }).click();
  };
  const toast = (re, what) => page.locator(".toast").filter({ hasText: re }).first().waitFor({ timeout: 8000 }).then(() => check(true, what), () => check(false, what));
  const shareLink = async () => {
    await menu("File", "Share link…");
    const dlg = page.getByRole("dialog", { name: "Share link" });
    await dlg.waitFor();
    return { dlg, url: await dlg.getByRole("textbox", { name: "Share link" }).inputValue() };
  };
  const KEY = "hingelab-gen-sign-v1";

  // ---- A link to a sign.
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.waitForTimeout(2500);
  await openAll();
  await setText("Text", "SHARED");
  const { dlg, url } = await shareLink();
  check(url.startsWith(`${BASE}/app/editor/local?p=sign#share=1.`), `File › Share link… gives a link with the settings after the # (${url.length} characters)`);
  check(/\d[\d,]* characters\./.test(await dlg.innerText()), "and says how long it is");
  check(await dlg.getByRole("region", { name: "Publish to the gallery" }).count() === 0, "the gallery section is hidden while the gallery flag is off");
  await page.keyboard.press("Escape");
  await dlg.waitFor({ state: "detached" });
  await setText("Text", "MINE");
  check((await saved(KEY))?.text?.text === "MINE", "my own sign is autosaved as MINE");

  // ---- Opening it: read-only, my autosave untouched.
  await page.goto("about:blank");
  await page.goto(url);
  const bar = page.getByRole("region", { name: "Shared design" });
  await bar.waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  check(/Shared design .*view only/.test(await bar.innerText()), "the link opens the design read-only with a banner");
  const texts = () => page.evaluate(() => [...document.querySelectorAll(".dock-col textarea, .dock-col input")].map((e) => e.value));
  check((await texts()).includes("SHARED"), "showing the shared settings");
  check(await page.locator(".dock-col").first().evaluate((e) => e.inert === true), "the settings panel is locked");
  check(await page.locator(".gallery").first().evaluate((e) => e.inert === true), "and so is the left rail");
  check(/Shared design, not saved/.test(await page.locator(".statusbar, .status").first().innerText().catch(() => "")) || await page.getByText("Shared design, not saved").count() > 0, "the status bar says it is not saved");
  await page.waitForTimeout(1500);
  check((await saved(KEY))?.text?.text === "MINE", "my own autosave is not overwritten");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase9-shared.png") });

  // ---- Remix.
  await bar.getByRole("button", { name: "Remix" }).click();
  await toast(/Remixing “.*”: it is your design here now/, "Remix says it is my design now");
  check(await bar.count() === 0, "the banner goes");
  check(!page.url().includes("#share="), "and the link's settings leave the address bar");
  check(await page.locator(".dock-col").first().evaluate((e) => e.inert !== true), "the panel unlocks");
  await page.waitForTimeout(1500);
  check((await saved(KEY))?.text?.text === "SHARED", "the remix autosaves as my design");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1500);
  check((await saved(KEY))?.text?.text === "MINE", "Ctrl+Z returns to my own sign");

  // A damaged link opens my own design instead.
  await page.goto("about:blank");
  await page.goto(`${BASE}/app/editor/local?p=sign#share=1.AAAA`);
  await page.waitForTimeout(3000);
  check(await page.getByRole("region", { name: "Shared design" }).count() === 0 && !page.url().includes("#share="), "a damaged link opens my own design");

  // ---- A project file carries an uploaded font.
  await openAll();
  const fontInput = page.locator(".gen-font input[type=file]").first();
  await fontInput.setInputFiles({ name: "MyFont.woff", mimeType: "font/woff", buffer: WOFF });
  await page.locator(".toast").filter({ hasText: /Added .* on this device/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const fontId = (await saved(KEY))?.text?.fontId ?? "";
  check(fontId.startsWith("upload:"), `the sign uses an uploaded font (${fontId})`);
  {
    const { dlg: d2 } = await shareLink();
    check(/Left out: 1 uploaded font/.test(await d2.innerText()), "a share link leaves the uploaded font out and says so");
    await page.keyboard.press("Escape");
  }
  const proj = await grab(page, () => page.getByRole("button", { name: "Save project" }).click());
  const j = JSON.parse(proj.data.toString("utf8"));
  const f = j.assets?.fonts?.[0];
  check(j.product === "sign" && f?.id === fontId && /Archivo Black/.test(f?.name ?? "") && f?.data?.length > 1000, `the project file holds the font (${proj.name}, ${Math.round(proj.data.length / 1024)} KB, “${f?.name}”)`);
  const fonts = () => page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open("hingelab-fonts", 1);
    r.onsuccess = () => { const q = r.result.transaction("fonts").objectStore("fonts").getAllKeys(); q.onsuccess = () => { res(q.result); r.result.close(); }; };
    r.onerror = () => res([]);
  }));
  await page.evaluate((id) => new Promise((res) => {
    const r = indexedDB.open("hingelab-fonts", 1);
    r.onsuccess = () => { const t = r.result.transaction("fonts", "readwrite"); t.objectStore("fonts").delete(id); t.oncomplete = () => { r.result.close(); res(); }; };
  }), fontId);
  check(!(await fonts()).includes(fontId), "the font is removed from this device");
  await page.locator('input[aria-label="Open a project file"]').setInputFiles({ name: proj.name, mimeType: "application/json", buffer: proj.data });
  await toast(/Opened .* and added 1 font on this device/, "opening the project adds the font back");
  check((await fonts()).includes(fontId), "under the same id");
  await page.waitForTimeout(1500);
  check(await page.locator(".err[role=alert], .canvas-error").count() === 0, "and the sign draws with it");

  // ---- Gates: off by default, then on for this device.
  await openAll();
  await page.getByRole("button", { name: "Batch files (ZIP)…" }).click();
  const batch = page.getByRole("dialog", { name: "Batch personalisation" });
  check(await batch.waitFor({ timeout: 5000 }).then(() => true, () => false), "with every gate off, Batch opens");
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("hingelab-flags", "gate.batch,gate.lbrn2"));
  await page.reload();
  await page.waitForTimeout(2500);
  await openAll();
  await page.getByRole("button", { name: "Batch files (ZIP)…" }).click();
  const up = page.getByRole("dialog", { name: "Upgrade to Pro" });
  check(await up.waitFor({ timeout: 5000 }).then(() => true, () => false) && /Batch personalisation .* is a Pro feature/.test(await up.innerText()), "with gate.batch on, a guest is asked to upgrade for Batch");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More…" }).click();
  const exp = page.getByRole("dialog", { name: "Export" });
  await exp.waitFor();
  await exp.getByRole("group", { name: "Format" }).getByRole("button", { name: "LightBurn" }).click();
  check(/LightBurn project files \(\.lbrn2\) are a Pro feature/.test(await exp.innerText()) && await exp.getByRole("button", { name: /Export LightBurn/ }).isDisabled(), "with gate.lbrn2 on, LightBurn export is locked with the reason");
  await exp.getByRole("group", { name: "Format" }).getByRole("button", { name: "SVG" }).click();
  check(await exp.getByRole("button", { name: /Export SVG/ }).isEnabled(), "while SVG stays free");
  await page.keyboard.press("Escape");
  await page.evaluate(() => localStorage.setItem("hingelab-flags", "gallery"));
  await page.reload();
  await page.waitForTimeout(2500);
  {
    const { dlg: d3 } = await shareLink();
    const gal = d3.getByRole("region", { name: "Publish to the gallery" });
    check(await gal.count() === 1 && /Sign in to publish/.test(await gal.innerText()), "with the gallery flag on, the dialog offers publishing (sign in first)");
    await page.keyboard.press("Escape");
  }
  await page.evaluate(() => localStorage.removeItem("hingelab-flags"));

  // ---- The gallery page while the server flag is off.
  await page.goto(`${BASE}/gallery`);
  check(await page.getByRole("heading", { name: "Gallery" }).isVisible() && await page.getByText("The gallery is not open yet.").isVisible(), "the gallery page says it is not open yet");

  // ---- Pictures stay out of a link unless asked.
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=cat-rings`);
  await page.waitForTimeout(2500);
  await openAll();
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 300;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 300);
    g.fillStyle = "#222"; g.beginPath(); g.arc(200, 150, 80, 0, Math.PI * 2); g.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type=file][aria-label="Picture"]').setInputFiles({ name: "disc.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.locator(".gen-image-name", { hasText: "disc" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  {
    const { dlg: d4, url: short } = await shareLink();
    const keep = d4.getByRole("checkbox", { name: /Include my pictures/ });
    check(await keep.count() === 1 && !(await keep.isChecked()), "a design with a picture offers to include it, off by default");
    check(/Left out: 1 picture/.test(await d4.innerText()), "and says the picture is left out");
    await keep.check();
    const long = await d4.getByRole("textbox", { name: "Share link" }).inputValue();
    check(long.length > short.length + 500, `including the picture makes the link longer (${short.length} → ${long.length})`);
    await page.keyboard.press("Escape");
  }

  // ---- Hinge Box, Letters and Parametric share too.
  for (const [p, name] of [["hinge", "Hinge Box"], ["letters", "Letters"], ["parametric", "Parametric"]]) {
    await page.goto(`${BASE}/app/editor/local?p=${p}`);
    await page.waitForTimeout(p === "hinge" ? 2500 : 6000);
    const { url: link } = await shareLink();
    await page.keyboard.press("Escape");
    await page.goto("about:blank");
    await page.goto(link);
    const b = page.getByRole("region", { name: "Shared design" });
    const shown = await b.waitFor({ timeout: 20000 }).then(() => true, () => false);
    check(shown && await page.locator(".dock-col").first().evaluate((e) => e.inert === true), `${name}: the link opens read-only`);
    if (shown) {
      await b.getByRole("button", { name: "Back to my design" }).click();
      await page.waitForTimeout(2500);
      check(await page.getByRole("region", { name: "Shared design" }).count() === 0 && !page.url().includes("#share="), `${name}: Back to my design leaves it`);
    }
  }

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 9 checks passed.");
