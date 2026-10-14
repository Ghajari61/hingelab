// End-to-end check of the Shadow Box enclosure (D162): the light box and diffuser, the back board,
// keyholes and feet, the finger-jointed box, pin holes and layer numbers, their checks and export.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/phase4.mjs.
import fs from "node:fs";
import path from "node:path";
import { BASE, OUT, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=lit-forest-box`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1500);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });

  const stat = (label) => page.locator(".dock dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd").first().innerText().catch(() => "");
  const codes = () => page.locator(".checks li.issue").evaluateAll((els) => els.map((e) => e.dataset.code));
  const parts = async () => Number(/Parts (\d+)/.exec(await page.locator("body").innerText())?.[1] ?? 0);

  check(/^4 rings, 12 mm deep$/.test(await stat("Light box")), `the Lit forest box has a 4-ring light box (${await stat("Light box")})`);
  check(/^\d+ × \d+ × \d+ mm$/.test(await stat("Box")), `and a finger-jointed box (${await stat("Box")})`);
  check(await page.getByText(/through the keyholes near the top/).count() > 0, "the assembly says how to hang it on the keyholes");
  check(await page.getByText(/LED strip round the inside of the rings/).count() > 0, "and where the LED strip goes");
  check((await codes()).length === 0, `the preset has no warnings (${(await codes()).join(", ") || "none"})`);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase4-sheets.png") });

  // Export: rings, diffuser, walls and the back board in the cut file.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+e")]);
  const file = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(file);
  const svg = fs.readFileSync(file, "utf8");
  fs.rmSync(file);
  const has = ["Light box ring 1", "Diffuser", "Back board", "Box top", "Box left side"].filter((n) => svg.includes(n));
  check(has.length === 5, `the SVG has the enclosure parts (${has.join(", ")})`);

  // Feet instead of keyholes: two more parts; undo goes back.
  const before = await parts();
  await page.getByRole("group", { name: "Hang or stand" }).getByRole("button", { name: "Feet" }).click();
  await page.waitForTimeout(1000);
  const after = await parts();
  check(after === before + 2, `Feet adds two parts (${before} → ${after})`);
  check(await page.getByText(/Stand the box upright in the two feet/).count() > 0, "and says how to stand it");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(800);
  check(await parts() === before, "Ctrl+Z takes the feet away again");

  // The 3D view shows the box.
  await page.getByRole("tab", { name: "3D view" }).click();
  await page.locator("canvas").first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  if (process.env.E2E_SHOTS) await page.screenshot({ path: path.join(process.env.E2E_SHOTS, "phase4-3d.png") });
  await page.getByRole("tablist", { name: "View" }).getByRole("tab").first().click();
  await page.waitForTimeout(500);

  // A light box behind a solid back layer: the check explains and its fix opens the back up.
  await page.goto(`${BASE}/app/editor/local?p=shadowbox&preset=star-tunnel`);
  await page.locator(".toast, [role=status]").filter({ hasText: "Started from" }).first().waitFor();
  await page.waitForTimeout(1200);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  await page.getByLabel("Light box behind the layers").check();
  await page.waitForTimeout(1000);
  check((await codes()).includes("LIGHT_BLOCKED"), "a light box behind a plain back board is flagged");
  await page.locator('.checks li.issue[data-code="LIGHT_BLOCKED"]').getByRole("button", { name: "Make the back layer a pattern layer" }).click();
  await page.waitForTimeout(1000);
  check(!(await codes()).includes("LIGHT_BLOCKED"), "its fix makes the back layer a pattern layer");

  // Keyholes in a narrow border: the check offers a wider border.
  await page.getByLabel("Light box behind the layers").uncheck();
  await page.getByRole("group", { name: "Hang or stand" }).getByRole("button", { name: "Keyholes" }).click();
  await page.waitForTimeout(1000);
  check((await codes()).includes("KEYHOLE_ROOM"), "keyholes in a 12 mm border are flagged");
  await page.locator('.checks li.issue[data-code="KEYHOLE_ROOM"]').getByRole("button", { name: /^Border \d+ mm$/ }).click();
  await page.waitForTimeout(1000);
  check(!(await codes()).includes("KEYHOLE_ROOM"), "and the wider border makes room for them");

  // Pins and numbers.
  await page.getByLabel("Pin holes").check();
  await page.getByLabel("Layer numbers").check();
  await page.waitForTimeout(1000);
  check(await page.getByText(/through the two pin holes/).count() > 0 && await page.getByText(/number is scored on its bottom border/).count() > 0, "pin holes and layer numbers come with assembly steps");

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll Phase 4 checks passed.");
