// Field reset: double-click on a field's name or its ↺ button restores the default (classic editors
// and the studio editor).
import { BASE, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  const scale = page.locator('.fld[data-id="uniformScale"]');
  const input = scale.locator("input");
  await input.fill("0.21");
  await input.press("Tab");
  await page.waitForTimeout(200);
  check(await scale.getByRole("button", { name: "Reset Scale" }).count() === 1, "a changed field shows ↺");
  await scale.locator("xpath=..").screenshot({ path: "docs/screenshots/reset-field-changed.png" });
  await scale.locator("label").dblclick();
  await page.waitForTimeout(200);
  check(await input.inputValue() === "1", "double-click on the name resets Scale to 1");
  check(await scale.getByRole("button", { name: "Reset Scale" }).count() === 0, "↺ hides at the default");

  await input.fill("2.5");
  await input.press("Tab");
  await scale.getByRole("button", { name: "Reset Scale" }).click();
  await page.waitForTimeout(200);
  check(await input.inputValue() === "1", "↺ resets Scale to 1");

  await page.getByRole("button", { name: "Hinge Box", exact: true }).click().catch(() => {});
  const w = page.locator('.fld[data-id="W"]');
  if (await w.count()) {
    const wi = w.locator("input");
    const before = await wi.inputValue();
    await wi.fill("321");
    await wi.press("Tab");
    await w.locator("label").dblclick();
    await page.waitForTimeout(200);
    check(await wi.inputValue() === before, `Hinge Box Width resets to ${before}`);
  }
});
