// Studio S1: onboarding, start screen, new document, editor, rename, autosave, Save to Computer and reopen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE, shot, signInAsPro, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.goto(`${BASE}/home`);
  await page.getByTestId("onboarding").waitFor();
  await page.getByRole("radio", { name: /Diode/ }).click();
  await shot(page, "studio-1-onboarding");
  for (let i = 0; i < 3; i++) await page.getByTestId("onboarding-next").click();
  await page.getByTestId("onboarding-done").click();
  await page.getByTestId("onboarding").waitFor({ state: "detached" });
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-prefs") ?? "{}"));
  check(prefs.onboarded === true && prefs.laser === "diode", "onboarding saves laser type and marks done");

  await page.getByTestId("welcome").waitFor();
  await shot(page, "studio-1-start");

  await page.keyboard.press("Control+/");
  await page.keyboard.type("hinge");
  await page.waitForTimeout(200);
  await shot(page, "studio-1-search");
  await page.keyboard.press("Escape");

  await page.getByTestId("blank-canvas").click();
  await page.getByTestId("new-document-dialog").waitFor();
  await page.getByTestId("document-name").fill("Coaster set");
  await page.getByTestId("sheet-preset").selectOption({ label: /A4/ }).catch(async () => {
    const opts = await page.getByTestId("sheet-preset").locator("option").allTextContents();
    const a4 = opts.find((o) => o.startsWith("A4"));
    await page.getByTestId("sheet-preset").selectOption({ label: a4 });
  });
  await page.waitForTimeout(400);
  await shot(page, "studio-1-new-document");
  await page.getByTestId("create-document").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  check((await page.getByTestId("doc-name").textContent()) === "Coaster set", "editor opens the new document");

  await page.getByTestId("doc-name").dblclick();
  await page.getByTestId("rename-input").fill("Coaster set v2");
  await page.keyboard.press("Enter");
  await page.getByTestId("sheet-w").fill("200+100");
  await page.keyboard.press("Enter");
  await page.getByTestId("save-state").filter({ hasText: "Saved on this device" }).waitFor();
  await page.waitForTimeout(1800);
  await page.getByTestId("save-state").filter({ hasText: "Saved on this device" }).waitFor();
  check((await page.getByTestId("sheet-w").inputValue()).startsWith("300"), "W accepts the expression 200+100");
  await shot(page, "studio-1-editor");

  await page.getByRole("button", { name: "File" }).click();
  await shot(page, "studio-1-file-menu");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /Save to Computer/ }).click()]);
  const file = path.join(os.tmpdir(), dl.suggestedFilename());
  await dl.saveAs(file);
  check(dl.suggestedFilename() === "Coaster set v2.oclc", "download is named after the project");
  const bytes = fs.readFileSync(file);
  check(bytes[0] === 0x50 && bytes[1] === 0x4b, "a Studio .oclc is a ZIP");

  await page.reload();
  await page.getByTestId("studio-editor").waitFor();
  check((await page.getByTestId("doc-name").textContent()) === "Coaster set v2", "rename survives a reload (IndexedDB)");

  await page.goto(`${BASE}/home`);
  await page.getByTestId("recent-project").first().waitFor();
  check(await page.getByTestId("welcome").count() === 0, "welcome card hides once a project exists");
  await page.mouse.wheel(0, 2000);
  await page.waitForTimeout(300);
  await shot(page, "studio-1-recents");

  await page.locator('input[aria-label="Open a project file"]').setInputFiles(file);
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  const reopened = await page.getByTestId("doc-name").textContent();
  check(reopened.startsWith("Coaster set v2"), `reopened file keeps its name (${reopened})`);
  check((await page.getByTestId("sheet-w").inputValue()).startsWith("300"), "reopened file keeps the sheet width");

  await page.goto(`${BASE}/home`);
  await page.getByTestId("gen-calibration").click();
  await page.getByTestId("new-project-dialog").waitFor();
  await page.waitForTimeout(400);
  await shot(page, "studio-1-new-project");
  await page.getByTestId("create-project").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByText("Slot fit comb").first().waitFor();
  check(true, "Test & Calibration opens with its test pieces on the sheet");

  await page.getByRole("button", { name: "View" }).click();
  await page.getByRole("menuitem", { name: "Theme" }).hover();
  await page.getByRole("menuitemcheckbox", { name: "Light" }).click();
  await page.waitForTimeout(200);
  check(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "theme switches to light");
  await page.goto(`${BASE}/home`);
  await page.getByTestId("recent-project").first().waitFor();
  check(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "theme persists across pages");
  await shot(page, "studio-1-start-light");

  await page.goto(`${BASE}/projects`);
  check(/\/login/.test(page.url()), "Projects page asks guests to sign in");
  const cleanup = await signInAsPro(page, "studio1");
  try {
    await page.goto(`${BASE}/projects`);
    await page.getByRole("heading", { name: "Projects" }).waitFor();
    await page.waitForTimeout(500);
    await shot(page, "studio-1-projects");
  } finally {
    await cleanup();
  }
  fs.rmSync(file, { force: true });
});
