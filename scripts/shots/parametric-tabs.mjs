// Parametric tab count: Joints & Fit sets Auto (with its spacing) or a number of tabs per fin, and
// every fin keeps all its tabs (the backboard gets one slot per tab).
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const waitSliced = async (page, prev = "", timeout = 120000) => {
  await page.waitForFunction((p) => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && t !== p && !document.querySelector(".pe-progress");
  }, prev, { timeout });
  await page.waitForTimeout(800);
  return page.locator(".pe-stage").textContent();
};

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  const joints = page.locator("details.sec", { has: page.locator("summary", { hasText: "Joints & Fit" }) });
  await joints.locator("summary").click();
  const choice = joints.getByRole("group", { name: "Tabs per fin" });
  check(await choice.locator('button[data-v="auto"][aria-pressed="true"]').count() === 1, "Tabs per fin starts on Auto");
  check(await joints.locator('.fld[data-id="tabPitch"] input').inputValue() === "60", "Auto spacing shows 60 mm");

  await choice.locator('button[data-v="count"]').click();
  s = await waitSliced(page, s);
  const count = joints.locator('.fld[data-id="tabCount"] input');
  check(await count.isVisible(), "Set number shows the Tabs field");
  await count.fill("6");
  await count.press("Enter");
  s = await waitSliced(page, s);
  check(await count.inputValue() === "6", "Tabs set to 6");
  await joints.scrollIntoViewIfNeeded();
  await shot(page, "parametric-tabs-6");
  await page.getByRole("tab", { name: /Sheets/ }).click();
  await page.waitForTimeout(1200);
  await shot(page, "parametric-tabs-6-sheets");
  await page.getByRole("tab", { name: "3D" }).click();

  await choice.locator('button[data-v="auto"]').click();
  s = await waitSliced(page, s);
  check(await joints.locator('.fld[data-id="tabPitch"]').isVisible(), "back to Auto shows Tab every");

  await page.locator('[aria-label="Slicing method"] button[data-v="radial"]').click();
  s = await waitSliced(page, s);
  check(await joints.getByRole("group", { name: "Tabs per hub joint" }).count() === 1, "Radial names it Tabs per hub joint");
});
