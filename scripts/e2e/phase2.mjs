// End-to-end check of pictures in Shadow Box (D160): the Your picture pattern, a PNG and an SVG traced
// on the device, the three ways of making layers, loose pieces, undo and SVG export.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase2.mjs.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
  <path d="M60 5 L115 95 H5 Z M60 35 L85 80 H35 Z" fill-rule="evenodd"/>
</svg>`;

await withBrowser(async (page) => {
  const errors = [];
  const uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.method() !== "GET" && /image|svg|multipart/.test(r.headers()["content-type"] ?? "")) uploads.push(r.url()); });
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=cat-rings`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1200);

  const drawing = () => page.locator(".canvas svg").first().evaluate((s) => [...s.querySelectorAll("path")].map((p) => p.getAttribute("d")?.length ?? 0).join(","));
  const pattern = () => page.getByRole("group", { name: "Pattern", exact: true }).locator('.gcard[aria-pressed="true"]').getAttribute("data-v");
  check((await pattern()) === "picture", "the Cat rings preset uses the Your picture pattern");
  check(await page.getByText("Your images stay on your device").isVisible(), "the picture field says images stay on the device");
  check(await page.getByRole("group", { name: "Sample shape" }).locator(".gcard").count() === 12, "12 sample shapes on the rail");

  // A sample shape changes the layers.
  const cat = await drawing();
  await page.getByRole("group", { name: "Sample shape" }).locator('.gcard[data-v="fish"]').click();
  await page.waitForTimeout(800);
  const fish = await drawing();
  check(fish !== cat, "picking the fish redraws the layers");

  // A PNG drawn in the page: a dark disc on a grey square, traced in the browser.
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400; c.height = 300;
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 300);
    g.fillStyle = "#999"; g.fillRect(60, 40, 280, 220);
    g.fillStyle = "#222"; g.beginPath(); g.arc(200, 150, 80, 0, Math.PI * 2); g.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  const input = page.locator('input[type=file][aria-label="Picture"]');
  check((await input.getAttribute("accept"))?.includes("image/svg+xml"), "the picture field accepts SVG files");
  await input.setInputFiles({ name: "disc.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.locator(".gen-image-name", { hasText: "disc" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const disc = await drawing();
  check(disc !== fish, "the traced PNG redraws the layers");
  check(await page.getByRole("group", { name: "Sample shape" }).count() === 0, "the sample rail hides once a picture is traced");
  check(await page.locator(".gen-image-row img").evaluate((i) => i.src.startsWith("data:image/jpeg")), "a small preview of the picture is shown");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase2-traced.png") });

  // Levels, tunnel and rings.
  const modes = page.getByRole("group", { name: "Layers from" });
  const seen = new Set([disc]);
  for (const m of ["Levels", "Tunnel", "Rings"]) {
    await modes.getByRole("button", { name: m, exact: true }).click();
    await page.waitForTimeout(800);
    check(await modes.getByRole("button", { name: m, exact: true }).getAttribute("aria-pressed") === "true", `${m} is picked`);
    seen.add(await drawing());
  }
  check(seen.size >= 3, `the three modes draw differently (${seen.size} drawings)`);
  check(await page.locator("#f_picture\\.cut").count() === 1, "Rings on a traced picture offers the shape level");

  // Paper shape held by bridges: no loose-piece warning.
  await page.getByText("Keep the shape as paper").click();
  await page.waitForTimeout(800);
  const codes = () => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const loose = page.getByRole("group", { name: "Loose pieces" });
  await loose.getByRole("button", { name: "Bridges" }).click();
  await page.waitForTimeout(800);
  check(!(await codes()).includes("LOOSE"), `bridges hold the paper shape (${(await codes()).join(", ") || "no issues"})`);

  // Undo goes back through the steps, the trace included.
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Control+z"); await page.waitForTimeout(250); }
  check(await page.locator(".gen-image-name").count() === 0, "Ctrl+Z undoes the traced picture");
  check(await page.getByRole("group", { name: "Sample shape" }).count() === 1, "and the sample rail comes back");
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(250); }
  check(await page.locator(".gen-image-name", { hasText: "disc" }).count() === 1, "Ctrl+Shift+Z brings it back");

  // An SVG: its filled triangle, hole included, becomes the shape.
  await input.setInputFiles({ name: "triangle.svg", mimeType: "image/svg+xml", buffer: Buffer.from(SVG) });
  await page.locator(".gen-image-name", { hasText: "triangle" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  check((await drawing()) !== disc, "the SVG redraws the layers");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase2-svg.png") });
  await input.setInputFiles({ name: "lines.svg", mimeType: "image/svg+xml", buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="9" y2="9" stroke="#000"/></svg>`) });
  await page.locator(".gen-image .note.err").waitFor({ timeout: 20000 });
  check(/no filled shapes/.test(await page.locator(".gen-image .note.err").innerText()), "an SVG with only lines explains why it cannot be used");

  // Export.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const svg = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  check(/\.svg$/.test(dl.suggestedFilename()) && (svg.match(/<path /g) ?? []).length > 5, `Export SVG downloads ${dl.suggestedFilename()} with the layers`);

  // Remove clears the picture and its outlines.
  await page.getByRole("button", { name: "Remove" }).click();
  await page.waitForTimeout(600);
  check(await page.getByRole("group", { name: "Sample shape" }).count() === 1, "Remove goes back to the sample shapes");

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 2 checks passed.");
