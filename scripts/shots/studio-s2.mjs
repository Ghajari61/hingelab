// Studio S2: vector editor core — drawing tools, smart guides, undo/redo, text, pen, node editing,
// layers, guides, command palette, shortcuts editor, preferences, reset with undo, autosave.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };

await withBrowser(async (page) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("hingelab-prefs")) localStorage.setItem("hingelab-prefs", JSON.stringify({ onboarded: true }));
  });
  await page.goto(`${BASE}/home?new=blank`);
  await page.getByTestId("new-document-dialog").waitFor();
  await page.getByTestId("document-name").fill("Editor tour");
  await page.getByTestId("create-document").click();
  await page.waitForURL(/\/editor\/local-/);
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(400);

  const stage = page.getByTestId("stage");
  const sb = await stage.boundingBox();
  const at = (fx, fy) => ({ x: sb.x + sb.width * fx, y: sb.y + sb.height * fy });
  const paths = () => page.locator('[data-testid="scene"] path').count();
  const drag = async (a, b, mods = []) => {
    for (const m of mods) await page.keyboard.down(m);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    for (const m of mods) await page.keyboard.up(m);
  };

  // Shapes
  await page.keyboard.press("m");
  check(await page.getByTestId("tool-rect").getAttribute("aria-pressed") === "true", "M selects the Rectangle tool");
  await drag(at(0.3, 0.3), at(0.42, 0.45));
  check(await paths() === 1, "dragging draws a rectangle");
  check(await page.getByTestId("selection-box").count() === 1, "the new rectangle is selected");
  check((await page.getByTestId("control-bar").textContent()).includes("Rectangle"), "control bar shows the rectangle's options");
  await page.getByTestId("shape-r").fill("4");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press("l");
  await drag(at(0.55, 0.3), at(0.65, 0.4), ["Shift"]);
  check(await paths() === 2, "Shift-drag with the Ellipse tool draws a circle");

  // Move with smart guides (hold the mouse to capture the magenta hints)
  await page.keyboard.press("v");
  const c = at(0.6, 0.35);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 40, c.y + 3, { steps: 6 });
  await page.mouse.move(c.x - 60, c.y + 2, { steps: 6 });
  await page.waitForTimeout(150);
  check(await page.locator('line[stroke="var(--smart-guide)"]').count() > 0, "smart guides appear while moving");
  check(await page.getByTestId("hud").count() === 1, "the HUD shows the move distance");
  await shot(page, "studio-2-smart-guides");
  await page.mouse.up();

  // Undo / redo
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  check(await paths() === 1, "Ctrl+Z undoes the move and the circle");
  await page.keyboard.press("Control+Shift+z");
  await page.keyboard.press("Control+Shift+z");
  check(await paths() === 2, "Ctrl+Shift+Z redoes both");

  // Command palette → Star tool
  await page.keyboard.press("Control+/");
  await page.getByTestId("command-palette").waitFor();
  await page.keyboard.type("star");
  await page.waitForTimeout(150);
  await shot(page, "studio-2-palette");
  await page.keyboard.press("Enter");
  await page.getByTestId("command-palette").waitFor({ state: "detached" });
  check(await page.getByTestId("tool-star").getAttribute("aria-pressed") === "true", "the palette selects the Star tool");
  await drag(at(0.3, 0.55), at(0.4, 0.72));
  check(await paths() === 3, "the Star tool draws a star");

  // Text (HarfBuzz outlines)
  await page.keyboard.press("t");
  await page.getByTestId("text-font").selectOption("vazirmatn");
  const tp = at(0.5, 0.65);
  await page.mouse.click(tp.x, tp.y);
  await page.getByTestId("text-editor").waitFor();
  await page.keyboard.type("Hello سام");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => {
    const ps = [...document.querySelectorAll('[data-testid="scene"] path')];
    return ps.length === 4 && (ps[3].getAttribute("d") ?? "").length > 200;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  check(await page.getByText("has no glyph").count() === 0, "typed text becomes HarfBuzz outlines (Latin and Persian, no missing glyphs)");

  // Pen: closed triangle
  await page.keyboard.press("p");
  for (const [fx, fy] of [[0.7, 0.55], [0.8, 0.7], [0.66, 0.72], [0.7, 0.55]]) { const q = at(fx, fy); await page.mouse.click(q.x, q.y); }
  check(await paths() === 5, "the Pen tool closes a path on its first anchor");
  check((await page.locator('[data-testid="scene"] path').nth(4).getAttribute("d")).trim().endsWith("Z"), "the pen path is closed");

  // Direct selection shows anchors
  await page.keyboard.press("a");
  await page.mouse.click(at(0.8, 0.7).x - 2, at(0.8, 0.7).y - 1);
  await page.waitForTimeout(150);
  await shot(page, "studio-2-nodes");

  // Guides from the ruler
  await page.keyboard.press("v");
  const ruler = { x: sb.x + sb.width * 0.5, y: sb.y + 8 };
  await drag(ruler, at(0.5, 0.5));
  check(await page.locator('line[stroke="var(--guide)"]').count() === 1, "dragging from the ruler adds a guide");

  // Select all + group → Layers panel
  await page.mouse.click(at(0.95, 0.95).x, at(0.95, 0.95).y);
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+g");
  await page.getByRole("tab", { name: "Layers", exact: true }).click();
  await page.getByTestId("layers-panel").waitFor();
  check(await page.locator('[role="treeitem"]').count() === 1, "Ctrl+G groups everything into one layer row");
  await page.locator('[role="treeitem"] button[aria-label="Expand"]').click();
  await page.waitForTimeout(150);
  check(await page.locator('[role="treeitem"]').count() === 6, "the group expands to its five children");
  await shot(page, "studio-2-layers");

  // Menus + context menu
  await page.getByRole("button", { name: "Object", exact: true }).click();
  await page.getByRole("menuitem", { name: "Arrange" }).hover();
  await page.waitForTimeout(150);
  await shot(page, "studio-2-object-menu");
  await page.keyboard.press("Escape");
  await page.mouse.click(at(0.36, 0.375).x, at(0.36, 0.375).y, { button: "right" });
  await page.getByRole("menu", { name: "Object" }).waitFor();
  await shot(page, "studio-2-context-menu");
  await page.keyboard.press("Escape");

  // Reset a field with Alt+click and undo it from the toast
  await page.getByRole("tab", { name: "Document", exact: true }).click();
  const grid = page.getByLabel("Grid", { exact: true });
  await grid.fill("5");
  await grid.press("Enter");
  await page.locator(".ui-field", { has: grid }).locator("label").click({ modifiers: ["Alt"] });
  const toast = page.getByTestId("toast").filter({ hasText: "Reset Grid to 10" });
  await toast.waitFor();
  check(await grid.inputValue() === "10", "Alt+click on the label resets the field");
  await toast.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(150);
  check(await grid.inputValue() === "5", "the reset can be undone from the toast");

  // Keyboard shortcuts editor: reassign with conflict prompt
  await page.keyboard.press("Control+Alt+Shift+k");
  await page.getByTestId("shortcuts-dialog").waitFor();
  await page.getByLabel("Search", { exact: true }).fill("lock");
  await page.getByRole("button", { name: "Change shortcut for Lock", exact: true }).click();
  await page.keyboard.press("Control+g");
  await page.getByRole("alertdialog", { name: "Shortcut conflict" }).waitFor();
  await shot(page, "studio-2-shortcuts");
  await page.getByRole("button", { name: "Reassign" }).click();
  const km = await page.evaluate(() => JSON.parse(localStorage.getItem("hingelab-keymap") ?? "{}"));
  check(km["object.lock"]?.[0] === "Ctrl+G" && km["object.group"]?.length === 0, "reassigning moves Ctrl+G from Group to Lock");
  await page.getByRole("button", { name: "Restore set defaults" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // Preferences
  await page.keyboard.press("Control+k");
  await page.getByTestId("preferences-dialog").waitFor();
  await shot(page, "studio-2-preferences");
  await page.getByRole("button", { name: "Done" }).click();

  // Autosave survives a reload
  await page.getByTestId("save-state").filter({ hasText: "Saved on this device" }).waitFor();
  await page.waitForTimeout(1800);
  await page.getByTestId("save-state").filter({ hasText: "Saved on this device" }).waitFor();
  await page.reload();
  await page.getByTestId("studio-editor").waitFor();
  await page.waitForTimeout(500);
  check(await paths() === 5, "all objects come back after a reload");
  await shot(page, "studio-2-editor");
});
