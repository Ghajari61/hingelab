// Studio 3D Assembly: a generated finger box goes to 3D put together, the safe fixes apply, a part is
// adjusted, and Back to Studio returns to the same drawing.
import { BASE, withBrowser } from "./lib.mjs";

const shot = (page, name) => page.screenshot({ path: `tmp/${name}.png` });
const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("hingelab-prefs")) localStorage.setItem("hingelab-prefs", JSON.stringify({ onboarded: true }));
  });
  await page.goto(`${BASE}/templates?t=${process.env.TPL ?? "box-recipe"}`);
  await page.getByTestId("template-open").click();
  await page.waitForURL(/\/editor\/local-/, { timeout: 60000 });
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(800);
  const paths = () => page.locator('[data-testid="scene"] path').count();
  const before = await paths();
  check(before >= 1, `the generator draws the box parts (${before} paths)`);
  await shot(page, "studio-asm-1-drawing");

  await page.getByTestId("view-3d").click();
  await page.getByTestId("assembly-3d").waitFor();
  await page.getByTestId("assembly-view").locator("canvas").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1200);
  const summary = await page.getByTestId("assembly-summary").textContent();
  check(/box/i.test(summary), `the parts are put together as a box (${summary})`);
  check(await page.getByTestId("view-3d").getAttribute("aria-pressed") === "true", "the 3D button shows it is on");
  await shot(page, "studio-asm-2-assembled");

  await page.getByTestId("assembly-parts").locator(".asm-part").first().click();
  await page.getByTestId("assembly-selected").waitFor();
  const z = page.getByLabel("Move Z, mm");
  await z.fill("40");
  await z.press("Enter");
  await page.waitForTimeout(400);
  check((await page.getByTestId("assembly-parts").textContent()).includes("adjusted"), "moving a part marks it adjusted");
  await shot(page, "studio-asm-3-adjusted");

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(300);
  check(!(await page.getByTestId("assembly-parts").textContent()).includes("adjusted"), "Ctrl+Z undoes the move in 3D");
  await page.keyboard.press("Control+Shift+z");
  await page.waitForTimeout(300);

  await page.getByTestId("assembly-back").click();
  await page.getByTestId("assembly-3d").waitFor({ state: "detached" });
  check(await paths() === before, "Back to Studio shows the same drawing");

  await page.keyboard.press("Control+Shift+3");
  await page.getByTestId("assembly-3d").waitFor();
  await page.waitForTimeout(800);
  check((await page.getByTestId("assembly-parts").textContent()).includes("adjusted"), "the adjustment is kept with the project");
  await page.getByTestId("assembly-parts").locator(".asm-part").first().click();
  await page.getByTestId("assembly-show-2d").click();
  await page.getByTestId("assembly-3d").waitFor({ state: "detached" });
  await page.waitForTimeout(400);
  check(await page.getByTestId("selection-box").count() === 1, "Show in Studio returns with the part selected");
  await shot(page, "studio-asm-4-back");

  // A part partly off the sheet (like the Paper Tray screenshot): 3D turns it onto the sheet.
  await page.goto(`${BASE}/home?new=blank`);
  await page.getByTestId("new-document-dialog").waitFor();
  await page.getByTestId("document-name").fill("Off sheet");
  await page.getByTestId("create-document").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(400);
  const stage = page.getByTestId("stage");
  const sb = await stage.boundingBox();
  await page.keyboard.press("m");
  await page.mouse.move(sb.x + sb.width * 0.45, sb.y + sb.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.55, sb.y + sb.height * 0.6, { steps: 4 });
  await page.mouse.move(sb.x + sb.width * 0.6, sb.y + sb.height * 0.95, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("v");
  await page.getByTestId("view-3d").click();
  await page.getByTestId("assembly-3d").waitFor();
  await page.waitForTimeout(1200);
  const toastText = (await page.getByTestId("toast").allTextContents()).join(" / ");
  check(/Fixed for 3D/.test(toastText), `opening 3D moves the part onto the sheet (${toastText})`);
  await shot(page, "studio-asm-5-offsheet");
  await page.getByTestId("assembly-back").click();
  await page.waitForTimeout(400);
  await shot(page, "studio-asm-6-offsheet-back");
});
