// End-to-end check of .oclc project files (D175): Save names the file .oclc and the editor keeps
// it (title and status bar show it, with a dot for unsaved changes); a file from another section
// opens in that section; Import takes a project's settings; the start page opens files; Test Cards
// and broken files are refused clearly; Studio saves .oclc, opens from a classic editor, and imports
// a DXF drawing.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/oclc.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

async function grab(page, act) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), act()]);
  const file = path.join(os.tmpdir(), `e2e-${Date.now()}-${dl.suggestedFilename()}`);
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), data: fs.readFileSync(file), file };
}

const json = (o) => Buffer.from(JSON.stringify(o));
const DXF = ["0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "40", "21", "0",
  "0", "LINE", "8", "0", "10", "40", "20", "0", "11", "40", "21", "30",
  "0", "CIRCLE", "8", "0", "10", "20", "20", "15", "40", "8",
  "0", "ENDSEC", "0", "EOF"].join("\n");

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const toast = (re, what, timeout = 12000) => page.locator(".toast, [role=status]").filter({ hasText: re }).first().waitFor({ timeout }).then(() => check(true, what), () => check(false, what));
  const openInput = () => page.locator('input[aria-label="Open a project file"]').first();
  const status = () => page.locator(".statusbar").first().innerText().catch(() => "");

  // ---- Save names the file .oclc, and the editor keeps it.
  await page.goto(`${BASE}/app/editor/local?p=sign`);
  await page.waitForTimeout(3500);
  const proj = await grab(page, () => page.getByRole("button", { name: "Save project" }).click());
  const j = JSON.parse(proj.data.toString("utf8"));
  check(proj.name.endsWith(".oclc") && j.product === "sign" && typeof j.version === "number", `Save writes an .oclc sign project (${proj.name})`);
  await page.waitForTimeout(500);
  check(/Saved to .*\.oclc/.test(await status()), "the status bar names the file");
  check((await page.title()).includes(proj.name) && !(await page.title()).startsWith("•"), `the title names the file (${await page.title()})`);
  const text = page.locator(".gen-text input, .gen-text textarea").first();
  await text.fill("Changed for e2e");
  await text.blur();
  await page.waitForTimeout(800);
  check((await page.title()).startsWith("•") && /unsaved changes/.test(await status()), "a change marks the file unsaved");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  check(!(await page.title()).startsWith("•"), "undoing the change makes it saved again");

  // ---- A file from another section opens there.
  await openInput().setInputFiles({ name: "e2e clock.oclc", mimeType: "application/octet-stream", buffer: json({ app: "HingeLab", product: "clock", version: 1, params: { name: "E2E clock" } }) });
  await page.waitForURL(/[?&]p=clock/, { timeout: 20000 }).catch(() => {});
  await toast(/Opened e2e clock\.oclc/, "a Clock file opened in Sign says it opened the file");
  check(/[?&]p=clock/.test(page.url()) && !/open=1/.test(page.url()), `in Clock, with a clean address (${page.url()})`);
  await page.waitForTimeout(1500);
  check(/Saved to e2e clock\.oclc/.test(await status()), "Clock keeps the file's name");
  const clockName = () => page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-gen-clock-v1") ?? "{}")?.params?.name ?? "");
  check(await clockName() === "E2E clock", "with the file's settings");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(1800);
  check(await clockName() !== "E2E clock", "Ctrl+Z returns to the design that was there");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(1500);

  // ---- A Hinge Box file goes to Hinge Box; Import takes only the settings.
  await openInput().setInputFiles({ name: "box.oclc", mimeType: "application/octet-stream", buffer: json({ app: "HingeLab", product: "hinge-box", version: 1, params: { W: 111, name: "E2E box" } }) });
  await page.waitForURL(/[?&]p=hinge/, { timeout: 20000 }).catch(() => {});
  check(/[?&]p=hinge/.test(page.url()), "a Hinge Box file opens in Hinge Box");
  await page.waitForTimeout(2500);
  const W = () => page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-v1") ?? "{}")?.params?.W);
  check(await W() === 111 && /Saved to box\.oclc/.test(await status()), "with its width, keeping the file");
  await page.locator('input[aria-label="Import a file"]').setInputFiles({ name: "other.oclc", mimeType: "application/octet-stream", buffer: json({ app: "HingeLab", product: "hinge-box", version: 1, params: { W: 123 } }) });
  await toast(/Imported the settings from other\.oclc/, "Import takes another project's settings");
  await page.waitForTimeout(1800);
  check(await W() === 123 && /box\.oclc • unsaved changes/.test(await status()), "and the editor keeps its own file, now unsaved");

  // ---- Refused files.
  await openInput().setInputFiles({ name: "cards.oclc", mimeType: "application/octet-stream", buffer: json({ app: "HingeLab", product: "testcard", params: {} }) });
  await toast(/Test Cards was removed/, "a Test Cards file says Test Cards was removed");
  await openInput().setInputFiles({ name: "junk.oclc", mimeType: "application/octet-stream", buffer: Buffer.from("hello") });
  await toast(/not a HingeLab project/, "a broken file is refused clearly");

  // ---- The start page opens files too.
  await page.goto(`${BASE}/app/editor/local`);
  await page.waitForTimeout(1500);
  await page.locator("button.linklike", { hasText: "open a project file" }).waitFor({ timeout: 10000 }).catch(() => {});
  await openInput().setInputFiles({ name: "word.oclc", mimeType: "application/octet-stream", buffer: json({ app: "HingeLab", product: "letters", version: 1, params: { text: "OCLC" } }) });
  await page.waitForURL(/[?&]p=letters/, { timeout: 20000 }).catch(() => {});
  check(/[?&]p=letters/.test(page.url()), "a Letters file opened on the start page opens in Letters");
  await toast(/Opened word\.oclc/, "and says so", 20000);

  // ---- Studio: Save to Computer writes .oclc; a classic editor opens it in Studio; Import reads DXF.
  await page.goto(`${BASE}/home`);
  await page.evaluate(() => localStorage.setItem("hingelab-prefs", JSON.stringify({ onboarded: true, laser: "diode" })));
  await page.reload();
  await page.getByTestId("blank-canvas").click();
  await page.getByTestId("new-document-dialog").waitFor();
  await page.getByTestId("document-name").fill("E2E plate");
  await page.getByTestId("create-document").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  await page.locator('input[aria-label="Import an SVG drawing"]').setInputFiles({ name: "plate.dxf", mimeType: "application/dxf", buffer: Buffer.from(DXF) });
  await toast(/Imported \d+ object/, "Studio imports a DXF drawing");
  await page.getByRole("button", { name: "File" }).click();
  const studio = await grab(page, () => page.getByRole("menuitem", { name: /Save to Computer/ }).click());
  check(studio.name === "E2E plate.oclc" && studio.data[0] === 0x50 && studio.data[1] === 0x4b, `Studio saves a ZIP .oclc (${studio.name})`);
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForTimeout(2500);
  await openInput().setInputFiles(studio.file);
  await page.waitForURL(/\/editor\/local-/, { timeout: 30000 }).catch(() => {});
  check(/\/editor\/local-/.test(page.url()), "a Studio file opened in Hinge Box opens in Studio");
  const opened = await page.getByTestId("doc-name").textContent({ timeout: 20000 }).catch(() => "");
  check(opened.startsWith("E2E plate"), `with its name (${opened})`);
  fs.rmSync(proj.file, { force: true });
  fs.rmSync(studio.file, { force: true });

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll .oclc checks passed.");
