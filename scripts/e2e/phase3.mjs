// End-to-end check of Shadow Box photos (D161): the original kept on the device, looks made from it
// (one undo step each), background removal, centring on the subject, the print PDF and the slot mount.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase3.mjs.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  const uploads = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("request", (r) => { if (r.method() !== "GET" && /image|pdf|multipart|octet/.test(r.headers()["content-type"] ?? "")) uploads.push(r.url()); });
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=cat-rings`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1200);

  // A "photo" drawn in the page: a dark red subject left of centre on a plain light blue background.
  const jpg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200; c.height = 900;
    const g = c.getContext("2d");
    g.fillStyle = "#c8dcf0"; g.fillRect(0, 0, 1200, 900);
    g.fillStyle = "#961e1e"; g.beginPath(); g.ellipse(420, 520, 150, 220, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f0c896"; g.beginPath(); g.arc(420, 380, 60, 0, Math.PI * 2); g.fill();
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  const thumb = () => page.locator(".gen-image-row img").first().getAttribute("src");
  const waitThumb = async (before, test) => {
    for (let i = 0; i < 80; i++) { const s = await thumb(); if (s !== before && test(s ?? "")) return s; await page.waitForTimeout(250); }
    return null;
  };
  const input = page.locator('input[type=file][aria-label="Photo"]');
  await input.setInputFiles({ name: "portrait.jpg", mimeType: "image/jpeg", buffer: Buffer.from(jpg, "base64") });
  await page.locator(".gen-image-name", { hasText: "portrait.jpg" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  const colour = await thumb();
  check(colour?.startsWith("data:image/jpeg"), "the chosen photo is made into a JPEG on the device");
  check(await page.getByText("the original photo is kept in this browser").isVisible(), "the photo field says images stay on the device");
  check(await page.locator(".canvas svg image").count() > 0, "the photo shows in the drawing");
  const kept = await page.evaluate(() => new Promise((ok) => {
    const r = indexedDB.open("hingelab-photos");
    r.onsuccess = () => { const q = r.result.transaction("originals").objectStore("originals").count(); q.onsuccess = () => ok(q.result); q.onerror = () => ok(-1); };
    r.onerror = () => ok(-1);
  }));
  check(kept >= 1, `the original is kept in IndexedDB (${kept})`);

  // Looks: posterised and engraved are small grey PNGs made from the original.
  const looks = page.getByRole("group", { name: "Photo look" });
  await looks.getByRole("button", { name: "Posterised" }).click();
  const poster = await waitThumb(colour, (s) => s.startsWith("data:image/png"));
  check(!!poster, "Posterised remakes the photo as a PNG of flat tones");
  check(await page.locator("#f_photo\\.tones").count() === 1, "and offers the number of tones");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase3-poster.png") });
  await page.keyboard.press("Control+z");
  const back = await waitThumb(poster, (s) => s.startsWith("data:image/jpeg"));
  check(back === colour && await looks.getByRole("button", { name: "Colour" }).getAttribute("aria-pressed") === "true", "one Ctrl+Z undoes the look and its photo together");
  await page.keyboard.press("Control+Shift+z");
  check(!!(await waitThumb(colour, (s) => s === poster)), "Ctrl+Shift+Z brings the posterised photo back");
  await looks.getByRole("button", { name: "Engraved" }).click();
  const dots = await waitThumb(poster, (s) => s.startsWith("data:image/png"));
  check(!!dots, "Engraved remakes the photo as engraving dots");
  check(await page.getByRole("group", { name: "Dots" }).count() + await page.getByRole("combobox", { name: "Dots" }).count() === 1, "and offers the dot pattern");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase3-engrave.png") });
  await looks.getByRole("button", { name: "Colour" }).click();
  const again = await waitThumb(dots, (s) => s.startsWith("data:image/jpeg"));
  check(!!again, "Colour goes back to a colour photo");

  // Background removal.
  await page.getByLabel("Remove the background").check();
  const nobg = await waitThumb(again, (s) => s.startsWith("data:image/jpeg"));
  check(!!nobg && nobg !== again, "Remove the background remakes the photo");
  check(await page.locator("#f_photo\\.tol").count() === 1, "and offers how closely the background is matched");

  // Centre on the subject.
  const zoomBefore = await page.locator("#f_photo\\.zoom").inputValue();
  await page.getByRole("button", { name: "Centre on the subject" }).click();
  await page.locator(".gen-image .note", { hasText: /^Centred on the (subject|face)\.$/ }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(500);
  const zoomAfter = await page.locator("#f_photo\\.zoom").inputValue();
  const across = await page.locator("#f_photo\\.x").inputValue();
  check(zoomAfter !== zoomBefore || across !== "0", `Centre on the subject zooms and moves the photo (zoom ${zoomBefore} → ${zoomAfter}, across ${across})`);

  // Print PDF from the original.
  const [pdfDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Print photo (PDF)" }).click()]);
  const pdfFile = path.join(OUT, pdfDl.suggestedFilename());
  await pdfDl.saveAs(pdfFile);
  const pdf = fs.readFileSync(pdfFile);
  fs.rmSync(pdfFile);
  check(/-photo\.pdf$/.test(pdfDl.suggestedFilename()) && pdf.subarray(0, 5).toString() === "%PDF-" && pdf.includes("/DCTDecode"), `Print photo downloads ${pdfDl.suggestedFilename()} (${Math.round(pdf.length / 1024)} kB)`);
  const note = await page.locator(".gen-image .note", { hasText: "Print PDF made" }).innerText().catch(() => "");
  check(/at \d+ dpi/.test(note), `it says the size and resolution (${note})`);

  // Slot mount: a holder part, and the photo stays out of the cut file.
  await page.getByRole("group", { name: "Photo goes" }).getByRole("button", { name: "In a slot" }).click();
  await page.waitForTimeout(1200);
  check(await page.getByText(/slide it into the holder/).count() > 0, "In a slot explains how the print slides in");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const svg = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  check(svg.includes("Photo holder") && !/<image /.test(svg), "the cut file has the photo holder and no photo");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase3-slot.png") });

  // Remove clears the photo.
  await page.getByRole("button", { name: "Remove" }).click();
  await page.waitForTimeout(600);
  check(await page.locator(".gen-image-name").count() === 0 && await looks.count() === 0, "Remove clears the photo and its settings");

  check(uploads.length === 0, `nothing is uploaded${uploads.length ? `: ${uploads.join(", ")}` : ""}`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 3 checks passed.");
