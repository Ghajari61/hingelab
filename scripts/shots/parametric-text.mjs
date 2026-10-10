// Parametric Text source: a typed word (Latin, then Persian in Vazirmatn) sliced into fins.
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
const parts = (s) => Number(/(\d+) parts/.exec(s)[1]);

await withBrowser(async (page) => {
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  let s = await waitSliced(page);

  await page.locator('[aria-label="Model from"] button[data-v="text"]').click();
  s = await waitSliced(page, s);
  check(parts(s) > 3, `the default word "Sam" is sliced: ${s}`);
  check(/“Sam”/.test(await page.locator(".dock").textContent()), "the Source section names the text");
  await shot(page, "parametric-text-sam");

  await page.locator('[aria-label="Profile"] button[data-v="flat"]').click();
  s = await waitSliced(page, s);
  check(parts(s) > 3, `flat letters are sliced: ${s}`);

  const text = page.getByRole("textbox", { name: "Text", exact: true });
  await text.fill("سام");
  await text.blur();
  await page.waitForSelector(".note.warn:has-text('Fredoka')", { timeout: 15000 });
  check(true, "Fredoka warns that it has no Persian letters");

  await page.locator('select[aria-label="Font"]').selectOption("vazirmatn");
  s = await waitSliced(page, s);
  check(await page.locator(".note.warn:has-text('has no')").count() === 0, "Vazirmatn has every letter");
  check(parts(s) > 3, `Persian "سام" is sliced: ${s}`);
  await page.locator('[aria-label="Profile"] button[data-v="rounded"]').click();
  s = await waitSliced(page, s);
  await shot(page, "parametric-text-persian");

  await text.fill("");
  await text.blur();
  await page.waitForFunction(() => /Type some text/.test(document.body.textContent ?? ""), null, { timeout: 15000 });
  check(true, "empty text asks for some text");
});
