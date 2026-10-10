// G3 (D91): QR Code generator — presets, content types, the logo check and its fix, outputs (cut-out in
// 3D, stencil), exported SVGs that scan (rendered and decoded with jsQR), help.
import { promises as fs } from "node:fs";
import jsQR from "jsqr";
import sharp from "sharp";
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const drawn = (page) => page.waitForFunction(() => document.querySelectorAll(".canvas svg path").length > 8 && !document.querySelector(".canvas-error"), null, { timeout: 60000 });
const stat = (page, label) => page.locator(`.gen-stats > div:has(dt:text-is("${label}")) dd`).textContent();
const codes = (page) => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
const card = (page, group, text) => page.locator(".gallery section, .gallery .ggroup, .gallery").filter({ hasText: group }).locator(".gcard").filter({ hasText: new RegExp(`^${text}$`) }).first();

/** Render an exported SVG and read the code in it, as a phone would (inner cuts filled: the holes or paint). */
async function scan(svg) {
  const filled = svg.replace('inkscape:label="03 Inner cuts" fill="none"', 'inkscape:label="03 Inner cuts" fill="#000"');
  const { data, info } = await sharp(Buffer.from(filled), { density: 150 }).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgba = new Uint8ClampedArray(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const v = data[i] < 160 ? 0 : 255;
    rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = v;
    rgba[4 * i + 3] = 255;
  }
  return jsQR(rgba, info.width, info.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}
async function exportSvg(page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  return { name: dl.suggestedFilename(), svg: await fs.readFile(await dl.path(), "utf8") };
}

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("g3")) { localStorage.clear(); sessionStorage.setItem("g3", "1"); } });
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForSelector(".start-tile");
  check((await page.locator(".gen-tile").filter({ hasText: "QR Code" }).count()) === 1, "a QR Code tile sits under Generators");
  const thumbs = page.locator('img[src^="/presets/qr/"]');
  check((await thumbs.count()) >= 5, `QR presets show thumbnails (${await thumbs.count()})`);
  await thumbs.first().scrollIntoViewIfNeeded();
  await shot(page, "g3-start");

  // Wi-Fi card: the exported file scans to the network login.
  await page.locator('img[src="/presets/qr/wifi-card.svg"]').first().click();
  await page.waitForSelector('.gen-app[data-generator="qr"]');
  await drawn(page);
  const content = await stat(page, "Content");
  check(content === "Wi-Fi", `the Wi-Fi card holds a Wi-Fi login (${content})`);
  await page.waitForTimeout(400);
  await shot(page, "g3-wifi");
  const wifi = await exportSvg(page);
  const wifiData = await scan(wifi.svg);
  check(wifiData === "WIFI:T:WPA;S:Guest;P:welcome-2026;;", `the exported Wi-Fi card scans (${wifi.name}: ${wifiData})`);

  // A web address.
  await card(page, "Content", "Web address").click();
  await page.locator('.dock input[aria-label="Web address"]').fill("example.com/hello");
  await page.locator('.dock input[aria-label="Web address"]').blur();
  await drawn(page);
  check((await stat(page, "Content")) === "Web address", "switching the content to a web address");

  // A logo too big for level M, fixed by level H.
  await page.getByRole("group", { name: "Error correction" }).getByRole("button", { name: "M", exact: true }).click();
  await page.locator(".dock details.sec > summary").filter({ hasText: "Centre logo" }).click();
  await page.locator('.dock select[aria-label="Logo"]').selectOption("heart");
  await page.locator('[id="f_logo.size"]').fill("30");
  await page.locator('[id="f_logo.size"]').blur();
  await page.waitForSelector('.checks li.issue[data-code="LOGO_TOO_BIG"]');
  check(true, "a 30 % logo at level M is flagged");
  await page.locator('.checks li.issue[data-code="LOGO_TOO_BIG"]').scrollIntoViewIfNeeded();
  await shot(page, "g3-logo-check");
  await page.locator('.checks li.issue[data-code="LOGO_TOO_BIG"]').getByRole("button", { name: "Error correction H" }).click();
  await page.waitForTimeout(500);
  check(!(await codes(page)).includes("LOGO_TOO_BIG"), "its fix (level H) clears it");
  const logo = await exportSvg(page);
  check((await scan(logo.svg)) === "https://example.com/hello", "the code with the heart logo scans");

  // Cut out over a dark backplate, in 3D.
  await card(page, "Output", "Cut out").click();
  await drawn(page);
  await page.getByRole("tab", { name: "3D" }).click();
  await page.waitForSelector("#preview3d canvas", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await shot(page, "g3-cutout-3d");
  await page.getByRole("tab", { name: "Sheets" }).click();

  // A dotted paint stencil.
  await card(page, "Output", "Stencil").click();
  await card(page, "Module style", "Dots").click();
  await drawn(page);
  check(/mm/.test(await stat(page, "Bridges")), "the stencil reports its bridges");
  await page.waitForTimeout(400);
  await shot(page, "g3-stencil");
  const sten = await exportSvg(page);
  check((await scan(sten.svg)) === "https://example.com/hello", `the exported stencil scans (${sten.name})`);

  // Help.
  await page.locator(".dock").getByRole("button", { name: "Help: Content", exact: true }).click();
  const frame = page.frameLocator(".help-drawer iframe");
  await frame.locator("h1", { hasText: "QR" }).waitFor({ timeout: 15000 }).catch(() => {});
  const h1 = await frame.locator("h1").textContent();
  check(/QR/.test(h1), `the ? opens the QR article (${h1})`);
  await frame.locator('.help-field[data-field="content.ssid"]').waitFor();
  check(true, "it lists the QR fields");
});

// The default code straight from the URL.
await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=qr`);
  await page.waitForSelector('.gen-app[data-generator="qr"]');
  await drawn(page);
  await page.waitForTimeout(600);
  await shot(page, "g3-default");
});
