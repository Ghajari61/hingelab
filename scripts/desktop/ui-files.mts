// The desktop app's project files (.oclc) in Chromium, without Tauri: stand-ins for the Rust commands
// record what the UI asks for; `generate` is the server's own generateDesign (Pro plan).
// Usage: npx vite-node --config vitest.config.ts scripts/desktop/ui-files.mts
import { resolve } from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";
import { desktopCatalog, generateDesign } from "@/lib/desktop/products";

const PORT = 5198;
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };
let designId = 0;
const calls: { cmd: string; args: Record<string, unknown> }[] = [];
const titles: string[] = [];
const HINGE_FILE = JSON.stringify({ app: "HingeLab", product: "hinge-box", version: 1, params: { name: "Opened box", W: 91 } });
const LETTERS_FILE = JSON.stringify({ app: "HingeLab", product: "letters", version: 1, params: { text: "HI" } });
let nextOpen: { path: string; name: string; text: string | null } | null = null;
let pendingLaunch: string | null = "C:\\Projects\\Launch box.oclc";
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
    case "get_prefs": return { exportDir: null, lastDir: null, openAfterExport: false, projectDir: null, recentFiles: [] };
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
    case "generate": {
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

  // Ctrl+O: a Hinge Box file opens here; a Letters file goes to the website view.
  nextOpen = { path: "C:\\Projects\\Other.oclc", name: "Other.oclc", text: HINGE_FILE };
  await page.keyboard.press("Control+o");
  await page.waitForFunction(() => document.querySelector(".ws-file")?.textContent === "Other.oclc", null, { timeout: 15000 });
  check((await page.locator(".ws-product").innerText()) === "Hinge Box", "Ctrl+O opens a Hinge Box file in Hinge Box");
  nextOpen = { path: "C:\\Projects\\Hi.oclc", name: "Hi.oclc", text: LETTERS_FILE };
  await page.keyboard.press("Control+o");
  await after(800);
  check(last("web_open_file")?.args.path === "C:\\Projects\\Hi.oclc", "a Letters file is handed to the website view");
  check(calls.some((c) => c.cmd === "web_open" && c.args.path === "/app/editor/local?desktop-open=1"), "the website view opens the hand-off page");
  nextOpen = { path: "C:\\Projects\\Bad.oclc", name: "Bad.oclc", text: "{\"nothing\":1}" };
  await page.keyboard.press("Control+o");
  await after(500);
  check((await page.locator(".toast").allInnerTexts()).some((t) => t.includes("not a HingeLab project")), "a file that is not a project is refused with a message");

  check(!errors.length, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  await vite.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
