// UX U6 (D85): shape buttons and sliders write the Parametric formulas; the formula itself sits
// under Advanced, and a typed formula shows as custom.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const stage = (page) => page.locator(".pe-stage").textContent();
/** Shape edits often keep the part count, so wait for the slicer to go quiet rather than for new text. */
const waitSliced = async (page) => {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => {
    const t = document.querySelector(".pe-stage")?.textContent ?? "";
    return /\d+ parts/.test(t) && !document.querySelector(".pe-progress");
  }, null, { timeout: 120000 });
  await page.waitForTimeout(700);
  return stage(page);
};
const picker = (page, label) => page.getByRole("group", { name: `${label} shape` });
const pressed = async (page, label) => picker(page, label).locator('button[aria-pressed="true"]').getAttribute("data-v").catch(() => null);
const formula = (page, name) => page.locator(`[aria-label="${name}"]`).inputValue();

await withBrowser(async (page) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("u6")) { localStorage.clear(); sessionStorage.setItem("u6", "1"); } });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  await page.getByRole("group", { name: "Slicing method" }).getByRole("button", { name: "Along a curve" }).click();
  s = await waitSliced(page, s);
  check(await pressed(page, "Fin length round the curve") === "constant", "the default fin length is recognised as Constant");
  check(await pressed(page, "Fin height along each fin") === "arch", "the default fin height is recognised as Arch");
  check(await picker(page, "Fin height along each fin").getByRole("button").count() === 10, "ten shape buttons");
  check(!(await page.locator('[aria-label="Fin height (t, s, L)"]').isVisible()), "the formula is hidden under Advanced");

  await picker(page, "Fin length round the curve").getByRole("button", { name: "Sine wave" }).click();
  s = await waitSliced(page, s);
  check(/sin\(2\*pi\*t\)/.test(await formula(page, "Fin length L(t)")), "Sine wave writes the fin length formula");
  await page.locator("#f_finLength-waves").fill("3");
  await page.locator("#f_finLength-waves").press("Tab");
  await page.locator("#f_finLength-amp").fill("30");
  await page.locator("#f_finLength-amp").press("Tab");
  s = await waitSliced(page, s);
  check(/30\*sin\(6\*pi\*t\)/.test(await formula(page, "Fin length L(t)")), "sliders rewrite it (3 waves, ±30 mm)");

  await picker(page, "Fin height along each fin").getByRole("button", { name: "Leaf" }).click();
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Outer outline" }).getByRole("button", { name: "Shape" }).click();
  s = await waitSliced(page, s);
  check(await pressed(page, "Outline") === "leaf", "the outline starts as a leaf");
  await picker(page, "Outline").getByRole("button", { name: "Heart" }).click();
  s = await waitSliced(page, s);
  check(/sqrt\(abs\(cos/.test(await formula(page, "Outline radius r(phi)")), "Heart writes the outline formula");
  await page.locator(".dock").evaluate((el) => { el.scrollTop = el.querySelector('[data-target="outline"]').offsetTop - 120; });
  await shot(page, "ux-u6-curve-heart");

  await picker(page, "Outline").getByRole("button", { name: "Star" }).click();
  s = await waitSliced(page, s);
  check(await page.locator("#f_outline-waves").inputValue() === "5", "a star outline has five points");
  await shot(page, "ux-u6-curve-star");

  const twist = page.locator('[data-target="twist"]');
  await twist.locator("summary").click();
  await page.locator('[aria-label="Twist ° (t)"]').fill("5*cos(2*pi*t)");
  await page.locator('[aria-label="Twist ° (t)"]').press("Tab");
  s = await waitSliced(page, s);
  check(await twist.locator(".shape-custom").isVisible(), "a typed formula shows as Custom formula");
  check(await pressed(page, "Twist round the curve") === null, "no shape is pressed for a typed formula");

  await page.getByRole("group", { name: "Slicing method" }).getByRole("button", { name: "Parallel" }).click();
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Model from" }).getByRole("button", { name: "Formula" }).click();
  s = await waitSliced(page, s);
  check(await page.locator('textarea[aria-label="Formula"]').isVisible(), "the default surface formula is custom, so the formula box is open");
  await picker(page, "Relief").getByRole("button", { name: "Bulge" }).click();
  s = await waitSliced(page, s);
  await page.getByRole("group", { name: "Relief direction" }).getByRole("button", { name: "From the centre" }).click();
  s = await waitSliced(page, s);
  check(/sqrt\(x\^2 \+ y\^2\)/.test(await formula(page, "Formula")), "From the centre measures from the middle of the surface");
  await page.locator(".dock").evaluate((el) => { el.scrollTop = 0; });
  await shot(page, "ux-u6-formula-dome");
});
