// The desktop app's project files (.oclc) in Chromium, without Tauri: stand-ins for the Rust commands
// record what the UI asks for; `generate` is the server's own generateDesign (Pro plan).
// Usage: npx vite-node --config vitest.config.ts scripts/desktop/ui-files.mts
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { desktopCatalog, generateDesign } from "@/lib/desktop/products";
import { traceForDesktop } from "@/lib/desktop/trace";

const PORT = 5198;
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };
let designId = 0;
let aiRuns = 0;
let offline = false;
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const titles: string[] = [];
const HINGE_FILE = JSON.stringify({ app: "HingeLab", product: "hinge-box", version: 1, params: { name: "Opened box", W: 91 } });
const LETTERS_FILE = JSON.stringify({ app: "HingeLab", product: "letters", version: 1, params: { text: "HI" } });
const UPLOADED_FONT_FILE = JSON.stringify({ app: "HingeLab", product: "letters", version: 1, params: { text: "HI", fontId: "upload:abc" } });
const SQUARE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect x="20" y="10" width="160" height="80"/></svg>';
let nextOpen: { path: string; name: string; text: string | null } | null = null;
let pendingLaunch: string | null = "C:\\Projects\\Launch box.oclc";
const prefs: Record<string, unknown> = { exportDir: null, lastDir: null, openAfterExport: false, projectDir: null, recentFiles: [], homeDir: null, recentMax: 0 };
const files: Record<string, string> = { "C:\\Projects\\Launch box.oclc": HINGE_FILE };

async function command(cmd: string, args: Record<string, unknown>) {
  if (!cmd.startsWith("plugin:event") && cmd !== "generate") calls.push({ cmd, args });
  switch (cmd) {
    case "plugin:app|version": return "1.0.30";
    case "plugin:event|listen": return 1;
    case "plugin:window|set_title": titles.push(String(args.value)); return null;
    case "app_info": return { version: "1.0.30", server: "local", signedIn: true };
    case "me": return { user: { id: "qa", email: "qa@hingelab.test", name: "QA" }, plan: "pro", status: "active", periodEnd: null, entitlements: { cleanExport: true, proShapes: true, proGenerators: true }, minimumVersion: "1.0.0" };
    case "catalog": return desktopCatalog();
    case "get_prefs": return { ...prefs };
    case "choose_project_folder": prefs.homeDir = "C:\\Projects"; return { ...prefs };
    case "set_project_prefs": if (args.clearFolder) prefs.homeDir = null; prefs.recentMax = Number(args.recentMax); return { ...prefs };
    case "recent_projects": return Object.keys(files).map((p) => ({ path: p, name: p.split("\\").pop(), exists: true }));
    case "take_open_request": { const p = pendingLaunch; pendingLaunch = null; return p; }
    case "save_project_as": {
      const path = `C:\\Projects\\${String(args.name)}.oclc`;
      files[path] = String(args.content);
      return { path, name: path.split("\\").pop() };
    }
    case "save_project": {
      const path = String(args.path);
      files[path] = String(args.content);
      return { path, name: path.split("\\").pop() };
    }
    case "open_project": {
      if (typeof args.path === "string") return { path: args.path, name: args.path.split("\\").pop(), text: files[args.path] ?? null };
      const f = nextOpen;
      nextOpen = null;
      return f;
    }
    case "web_open_file": return "/app/editor/local?desktop-open=1";
    case "export_design_as": return { path: `C:\\Out\\design.${String(args.format)}` };
    case "pick_picture": return { name: "Square", svg: SQUARE_SVG, data: null, mime: null };
    case "trace_picture": {
      const r = traceForDesktop(args.request);
      return r.status === 200 ? r.body : { __err: { kind: "invalid", message: (r.body as { message: string }).message } };
    }
    case "ai_design": {
      const req = args.request as { prompt: string };
      aiRuns++;
      return { product: "hinge", productName: "Hinge Box", match: "exact", name: `AI ${aiRuns}`, summary: req.prompt, notes: [], params: { W: 60 + aiRuns } };
    }
    case "generate": {
      if (offline) return { __err: { kind: "network", message: "No connection." } };
      const req = args.request as { product: string };
      const r = await generateDesign(req, "pro");
      if (!("product" in r.body)) return { __err: { kind: "invalid", message: (r.body as { error: string }).error } };
      return { status: r.status, body: { ...r.body, ...(r.status === 200 ? { designId: ++designId } : {}) } };
    }
    default: return null;
  }
}

const vite = await createServer({ configFile: resolve("desktop/vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push(`request failed: ${r.url()}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.exposeFunction("__hl", command);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__TAURI_INTERNALS__ = {
      invoke: async (c: string, a: unknown) => {
        const r = await (w.__hl as (c: string, a: unknown) => Promise<{ __err?: unknown }>)(c, a ?? {});
        if (r && r.__err) throw r.__err;
        return r;
      },
      transformCallback: (cb: unknown) => { const id = Math.floor(Math.random() * 1e9); w[`_${id}`] = cb; return id; },
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main", windowLabel: "main" } },
    };
    w.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    localStorage.setItem("hl-prefs-v1", JSON.stringify({ autoCheckUpdates: false }));
  });
  const after = async (n: number) => { await page.waitForTimeout(n); };
  const last = (cmd: string) => [...calls].reverse().find((c) => c.cmd === cmd);
  const count = (cmd: string) => calls.filter((c) => c.cmd === cmd).length;
  const fileChip = () => page.locator(".ws-file").innerText().catch(() => "");

  await page.goto(`http://localhost:${PORT}/`);
  // A file Windows asked the app to open (a double-click in Explorer) opens at start.
  await page.waitForSelector(".ws-head", { timeout: 30000 });
  await page.locator('img[alt="Preview of the cut file"]').waitFor({ timeout: 30000 });
  check((await page.locator(".ws-product").innerText()) === "Hinge Box", "a launch file opens in its section (Hinge Box)");
  check((await fileChip()) === "Launch box.oclc", `the workspace names the file (${await fileChip()})`);
  await after(300);
  check(titles.at(-1) === "Launch box.oclc \u2014 HingeLab", `the window title names the file (${titles.at(-1)})`);

  // Save on an opened file writes over it, without a dialog.
  await page.locator(".ws-name").click();
  await page.locator('input[aria-label="Design name"]').fill("Renamed box");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".ws-file")?.textContent?.includes("\u2022"), null, { timeout: 15000 });
  check(true, "an edit marks the file as changed");
  await after(300);
  check(titles.at(-1)?.startsWith("\u2022 ") === true, `the title shows unsaved changes (${titles.at(-1)})`);
  await page.locator(".ws-canvas").click({ position: { x: 20, y: 80 } });
  await page.keyboard.press("Control+s");
  await after(500);
  const saved = last("save_project");
  check(!!saved && saved.args.path === "C:\\Projects\\Launch box.oclc" && count("save_project_as") === 0, "Ctrl+S saves over the opened file, with no Save As");
  const written = JSON.parse(String(saved?.args.content ?? "{}"));
  check(written.app === "HingeLab" && written.product === "hinge-box" && written.params?.name === "Renamed box" && written.params?.W === 91, "the file holds the website's project format");
  check(!(await fileChip()).includes("\u2022"), "saving clears the changed mark");
  check((await page.locator(".toast").allInnerTexts()).some((t) => t.includes("Saved Launch box.oclc")), "a toast confirms the save");

  // Save As always asks.
  await page.keyboard.press("Control+Shift+S");
  await after(500);
  check(last("save_project_as")?.args.name === "Renamed box", "Ctrl+Shift+S saves as a new file, named after the design");
  check((await fileChip()) === "Renamed box.oclc", "the workspace now names the new file");

  // A new design has no file: its first Save asks where.
  await page.locator(".sidebar").getByRole("button", { name: "Dashboard" }).first().click();
  check(await page.locator(".dash-files .frow").count() >= 2, "the dashboard lists project files");
  await page.locator(".tile", { hasText: "Clock" }).first().click();
  await page.locator('img[alt="Preview of the cut file"]').waitFor({ timeout: 30000 });
  const asBefore = count("save_project_as");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await after(500);
  check(count("save_project_as") === asBefore + 1, "Save on a new design asks where (Save As)");
  const clock = JSON.parse(String(last("save_project_as")?.args.content ?? "{}"));
  check(clock.product === "clock" && typeof clock.version === "number" && clock.version >= 1, `a generator file carries its settings version (${clock.version})`);

  // Ctrl+O: Hinge Box and Letters files open here; a design with a font uploaded on the website goes to the website view.
  nextOpen = { path: "C:\\Projects\\Hi.oclc", name: "Hi.oclc", text: LETTERS_FILE };
  await page.keyboard.press("Control+o");
  await page.waitForFunction(() => document.querySelector(".ws-file")?.textContent === "Hi.oclc", null, { timeout: 15000 });
  check((await page.locator(".ws-product").innerText()) === "Letters", "Ctrl+O opens a Letters file in Letters, in the app");
  await page.locator('img[alt="Preview of the cut file"]').waitFor({ timeout: 30000 }).then(() => check(true, "the Letters design is built"), () => check(false, "the Letters design is built"));
  check(count("web_open_file") === 0, "a Letters file is not handed to the website");
  nextOpen = { path: "C:\\Projects\\Other.oclc", name: "Other.oclc", text: HINGE_FILE };
  await page.keyboard.press("Control+o");
  await page.waitForFunction(() => document.querySelector(".ws-file")?.textContent === "Other.oclc", null, { timeout: 15000 });
  check((await page.locator(".ws-product").innerText()) === "Hinge Box", "Ctrl+O opens a Hinge Box file in Hinge Box");
  nextOpen = { path: "C:\\Projects\\Font.oclc", name: "Font.oclc", text: UPLOADED_FONT_FILE };
  await page.keyboard.press("Control+o");
  await after(800);
  check(last("web_open_file")?.args.path === "C:\\Projects\\Font.oclc", "a Letters file with an uploaded font is handed to the website view");
  check(calls.some((c) => c.cmd === "web_open" && c.args.path === "/app/editor/local?desktop-open=1"), "the website view opens the hand-off page");
  nextOpen = { path: "C:\\Projects\\Bad.oclc", name: "Bad.oclc", text: "{\"nothing\":1}" };
  await page.keyboard.press("Control+o");
  await after(500);
  check((await page.locator(".toast").allInnerTexts()).some((t) => t.includes("not a HingeLab project")), "a file that is not a project is refused with a message");

  // The Edit menu: Undo and Redo.
  await page.locator(".sidebar").getByRole("button", { name: "Generators" }).click();
  await page.locator(".ws-name").click();
  await page.locator('input[aria-label="Design name"]').fill("Menu name");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelector(".ws-name")?.textContent === "Menu name", null, { timeout: 15000 });
  await after(400);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  check(await page.getByRole("menu", { name: "Edit" }).isVisible(), "the workspace has an Edit menu");
  await page.getByRole("menuitem", { name: /^Undo/ }).click();
  await page.waitForFunction(() => document.querySelector(".ws-name")?.textContent !== "Menu name", null, { timeout: 15000 }).then(() => check(true, "Edit > Undo takes the rename back"), () => check(false, "Edit > Undo takes the rename back"));
  await after(400);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: /^Redo/ }).click();
  await page.waitForFunction(() => document.querySelector(".ws-name")?.textContent === "Menu name", null, { timeout: 15000 }).then(() => check(true, "Edit > Redo puts it back"), () => check(false, "Edit > Redo puts it back"));
  await page.getByRole("button", { name: "File", exact: true }).click();
  check(await page.getByRole("menuitem", { name: /Save project as/ }).isVisible(), "the File menu has Save project as");
  await page.keyboard.press("Escape");

  // Reset: a field's ↺, a section's ↺ and Edit > Reset all settings, each one undo step.
  const until = async (fn: () => Promise<boolean>) => { for (let i = 0; i < 75; i++) { if (await fn()) return true; await after(200); } return false; };
  const width = page.getByLabel("Width", { exact: true });
  const widthIs = (v: string) => until(async () => (await width.inputValue()) === v);
  check(await widthIs("91"), "the opened file's width is shown");
  await page.getByRole("button", { name: "Reset Width" }).click();
  check(await widthIs("140"), "a field's reset button restores its default");
  check(!(await page.getByRole("button", { name: "Reset Width" }).isVisible()), "the reset button goes once the value is the default");
  await page.keyboard.press("Control+z");
  check(await widthIs("91"), "Ctrl+Z takes a field reset back");
  await page.getByRole("button", { name: "Reset Dimensions" }).click();
  check(await widthIs("140"), "a section's reset button restores its fields");
  await page.keyboard.press("Control+z");
  check(await widthIs("91"), "Ctrl+Z takes a section reset back");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset all settings" }).click();
  const ask = page.getByRole("dialog", { name: "Reset all settings?" });
  check(await ask.isVisible(), "Reset all settings asks first (Settings > Ask before Reset all)");
  await ask.getByRole("button", { name: "Reset all" }).click();
  check(await widthIs("140"), "Edit > Reset all settings restores the defaults");
  check((await page.locator(".toast").allInnerTexts()).some((t) => t.includes("All settings reset")), "a toast says Ctrl+Z undoes Reset all");
  check((await page.locator(".ws-name").innerText()) === "Menu name", "Reset all keeps the design's name");

  // Randomise: the Hinge Box gets a new pattern (its size stays); generators keep locked settings.
  const summary = () => page.locator(".ws-summary").innerText();
  const before = await summary();
  let rolled = false;
  for (let i = 0; i < 4 && !rolled; i++) {
    await page.getByRole("button", { name: "Randomise pattern" }).click();
    rolled = await until(async () => !(await page.locator(".rand-btn").isDisabled()) && (await summary()) !== before);
  }
  check(rolled, "Randomise pattern gives the Hinge Box a new pattern");
  check(await widthIs("140"), "Randomise pattern keeps the box's size");
  await page.keyboard.press("Control+z");
  check(await until(async () => (await summary()) === before), "Ctrl+Z takes a randomise back");
  await page.locator(".sidebar").getByRole("button", { name: "Generators" }).click();
  await page.getByRole("tab", { name: /Clock/ }).click();
  await page.getByRole("button", { name: "New Clock" }).click();
  await page.getByRole("button", { name: "Lock Face shape" }).click();
  check(await page.getByRole("button", { name: "Unlock Face shape" }).isVisible(), "a setting Randomise may change can be locked");
  check((await page.locator(".rand-btn").innerText()).includes("1 locked"), "the Randomise button counts the locks");
  const shape = () => page.getByRole("combobox", { name: "Face shape" }).inputValue();
  const shapeBefore = await shape();
  const json = () => page.evaluate(() => [...document.querySelectorAll(".ws-panel input, .ws-panel select, .ws-panel [role=switch], .ws-panel [role=radio]")]
    .map((e) => (e instanceof HTMLInputElement || e instanceof HTMLSelectElement ? e.value : e.getAttribute("aria-checked"))).join("|"));
  const panelBefore = await json();
  let changed = false;
  for (let i = 0; i < 4 && !changed; i++) {
    await page.locator(".ws-summary").click();
    await page.keyboard.press("Control+r");
    changed = await until(async () => !(await page.locator(".rand-btn").isDisabled()) && (await json()) !== panelBefore);
  }
  check(changed, "Ctrl+R gives a generator a new random design");
  check((await shape()) === shapeBefore, "a locked setting stays when the design is randomised");
  check((await page.locator(".toast").allInnerTexts()).some((t) => t.includes("locked settings kept")), "a toast says the locked settings were kept");
  await page.getByRole("button", { name: "Unlock Face shape" }).click();

  // The AI designer: Undo and Redo step through the AI edits.
  await page.locator(".sidebar").getByRole("button", { name: /AI/ }).first().click();
  await page.locator("#ai-prompt").fill("a box");
  await page.getByRole("button", { name: "Design it" }).click();
  await page.locator(".ai-result h2").waitFor({ timeout: 15000 });
  for (const ask of ["wider", "taller"]) {
    await page.locator("#ai-edit").fill(ask);
    await page.getByRole("button", { name: "Apply" }).click();
    await page.waitForFunction((n) => document.querySelector(".ai-result h2")?.textContent === n, ask === "wider" ? "AI 2" : "AI 3", { timeout: 15000 });
  }
  const aiName = () => page.locator(".ai-result h2").innerText();
  await page.getByRole("button", { name: "Undo edit" }).click();
  check((await aiName()) === "AI 2", "AI page: Undo edit steps back");
  await page.locator(".ai-result h2").click();
  await page.keyboard.press("Control+z");
  check((await aiName()) === "AI 1", "AI page: Ctrl+Z steps back again");
  await page.keyboard.press("Control+y");
  check((await aiName()) === "AI 2", "AI page: Ctrl+Y redoes");
  await page.getByRole("button", { name: "Redo edit" }).click();
  check((await aiName()) === "AI 3", "AI page: Redo edit redoes");
  check(await page.getByRole("button", { name: "Redo edit" }).isDisabled(), "AI page: nothing left to redo");

  // The AI designer: Open in 3D opens the design in the workspace on the 3D view.
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem("hl-prefs-v1") ?? "{}");
    localStorage.setItem("hl-prefs-v1", JSON.stringify({ ...p, view3d: false }));
    window.dispatchEvent(new CustomEvent("hl-local", { detail: "hl-prefs-v1" }));
  });
  await page.getByRole("button", { name: "Open in 3D" }).click();
  await page.locator(".ws-head").waitFor({ timeout: 15000 });
  check((await page.locator(".ws-product").innerText()) === "Hinge Box" && (await page.locator(".ws-name").innerText()) === "AI 3", "AI page: Open in 3D opens the design in the workspace");
  check(await until(async () => (await page.getByRole("group", { name: "Workspace view" }).getByRole("button", { name: "3D" }).getAttribute("aria-pressed")) === "true"), "AI page: Open in 3D shows the 3D view");
  await page.getByRole("group", { name: "Workspace view" }).getByRole("button", { name: "2D sheet" }).click();

  // Settings: the project folder, Recent's length, interface size, how designs open, Reset all without asking.
  await page.locator(".sidebar").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("heading", { name: "Project files" }).waitFor({ timeout: 10000 });
  await page.getByRole("region", { name: "Project files" }).getByRole("button", { name: "Choose folder…" }).click();
  check(await until(async () => (await page.getByRole("region", { name: "Project files" }).locator(".path").innerText()).includes("C:\\Projects")), "Settings: a chosen project folder is shown");
  await page.getByRole("combobox", { name: "Recent files to list" }).selectOption("5");
  check(await until(async () => last("set_project_prefs")?.args.recentMax === 5), "Settings: Recent files to list goes to the app");
  await page.getByRole("radiogroup", { name: "Interface size" }).getByRole("radio", { name: "110%" }).click();
  check(await page.evaluate(() => document.documentElement.style.zoom) === "1.1", "Settings: Interface size zooms the window's contents");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/desk-settings.png` });
  await page.getByRole("radiogroup", { name: "Open designs in" }).getByRole("radio", { name: "3D" }).click();
  await page.getByRole("checkbox", { name: "Ask before Reset all settings" }).uncheck();
  await page.locator(".sidebar").getByRole("button", { name: "Dashboard" }).click();
  await page.locator(".dash-new .tile").first().click();
  check(await until(async () => (await page.getByRole("group", { name: "Workspace view" }).getByRole("button", { name: "3D" }).getAttribute("aria-pressed")) === "true"), "Settings: Open designs in 3D opens a new design in 3D");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("menuitem", { name: "Reset all settings" }).click();
  check(!(await page.getByRole("dialog", { name: "Reset all settings?" }).isVisible().catch(() => false)), "Settings: with Ask before Reset all off, Reset all does not ask");
  await page.locator(".sidebar").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Reset these settings" }).click();
  check(await page.evaluate(() => document.documentElement.style.zoom) === "", "Settings: Reset these settings restores the interface size");
  check(await page.getByRole("checkbox", { name: "Ask before Reset all settings" }).isChecked(), "Settings: Reset these settings turns Ask before Reset all back on");

  // Letters and Parametric are products of the app; Studio, AI Studio and cloud projects open the website here.
  await page.locator(".sidebar").getByRole("button", { name: "Generators" }).click();
  await page.locator(".ws-head").waitFor({ timeout: 15000 });
  await page.locator(".sidebar").getByRole("button", { name: "Generators" }).click();
  check(await page.getByRole("tab", { name: /Letters/ }).isVisible() && await page.getByRole("tab", { name: /Parametric/ }).isVisible(), "Generators lists Letters and Parametric");
  await page.getByRole("tab", { name: /Puzzle/ }).click();
  await page.getByRole("button", { name: "New Puzzle" }).click();
  await page.locator(".ws-head").waitFor({ timeout: 15000 });
  await page.getByRole("group", { name: "Workspace view" }).getByRole("button", { name: "2D sheet" }).click();
  await page.locator('img[alt="Preview of the cut file"]').waitFor({ timeout: 30000 });

  // A grey picture for the puzzle, picked and shrunk here.
  await page.getByRole("radio", { name: "Picture", exact: true }).click();
  await page.getByRole("button", { name: "Choose…" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Choose…" }).click();
  check(await until(async () => ((await page.locator(".picture-row img").getAttribute("src").catch(() => "")) ?? "").startsWith("data:image/jpeg")), "a picked picture is shown in its setting");
  check(await until(async () => !(await page.locator(".issue", { hasText: /picture/i }).count())), "the puzzle uses the picture (no missing-picture issue)");
  await page.keyboard.press("Control+z");
  check(await until(async () => !(await page.locator(".picture-row img").count())), "Ctrl+Z takes a picked picture back");

  // My materials: save the current thickness and kerf, then choose it.
  await page.getByRole("button", { name: "Save this thickness and kerf as my material" }).click();
  await page.getByPlaceholder("Name, for example Birch 3 mm").fill("Test birch");
  await page.getByRole("button", { name: "Save", exact: true }).last().click();
  check(await until(async () => (await page.getByRole("combobox", { name: "My materials" }).locator("option").allInnerTexts()).some((t) => t.startsWith("Test birch"))), "a material is saved to My materials");
  const thick = page.getByLabel("Thick", { exact: true });
  await thick.fill("6");
  await thick.press("Enter");
  await thick.blur();
  check(await until(async () => (await page.getByRole("combobox", { name: "My materials" }).inputValue()) === ""), "changing the thickness leaves My materials");
  const mine = await page.getByRole("combobox", { name: "My materials" }).locator("option").nth(1).getAttribute("value");
  await page.getByRole("combobox", { name: "My materials" }).selectOption(mine!);
  check(await until(async () => (await thick.inputValue()) !== "6"), "choosing one of My materials sets the thickness back");

  // Export as DXF, PDF and LightBurn from the File menu.
  await page.getByRole("button", { name: "File", exact: true }).click();
  await page.getByRole("menuitem", { name: "Export DXF" }).click();
  check(await until(async () => last("export_design_as")?.args.format === "dxf"), "File > Export DXF asks the app for a DXF");

  // A traced picture: the Shadow Box's own picture pattern.
  await page.locator(".sidebar").getByRole("button", { name: "Generators" }).click();
  await page.getByRole("tab", { name: /Shadow/ }).click();
  await page.getByRole("button", { name: /^New Shadow/ }).click();
  await page.locator('img[alt="Preview of the cut file"]').waitFor({ timeout: 30000 });
  await page.getByRole("combobox", { name: "Pattern" }).selectOption("picture");
  await page.getByRole("button", { name: "Choose…" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Choose…" }).click();
  check(await until(async () => (last("trace_picture")?.args.request as { kind?: string } | undefined)?.kind === "svg"), "an SVG picture is sent to be traced");
  check(await until(async () => (await page.locator(".picture-name").innerText()) === "Square"), "a traced picture shows its file name");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/desk-picture.png` });

  // Offline: a change that cannot be sent is marked, sent when the app is back online, and is then one undo step.
  const copies = page.getByLabel("Copies", { exact: true });
  const copiesBefore = await copies.inputValue();
  offline = true;
  await copies.fill("2");
  await copies.press("Enter");
  await copies.blur();
  check(await until(async () => await page.getByText("Not sent, offline").isVisible()), "a change made offline is marked as not sent");
  offline = false;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  check(await until(async () => !(await page.getByText("Not sent, offline").isVisible()) && !(await page.locator(".overlay").count())), "back online, the change is sent");
  await page.locator(".ws-summary").click();
  await page.keyboard.press("Control+z");
  check(await until(async () => (await copies.inputValue()) === copiesBefore), "the change sent late is one undo step");

  await page.locator(".sidebar").getByRole("button", { name: "AI Studio" }).click();
  check(await until(async () => calls.some((c) => c.cmd === "web_open" && c.args.path === "/home?new=ai")), "the sidebar opens AI Studio in the website view");

  check(!errors.length, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  await vite.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
