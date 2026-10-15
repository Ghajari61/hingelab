// The desktop app's 3D workspace in Chromium, without Tauri: a stand-in for the Rust commands answers
// `generate` with the server's own generateDesign (Pro plan). Screenshots go to docs/screenshots.
// Usage: npx vite-node --config vitest.config.ts scripts/desktop/ui-3d.mts
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";
import { desktopCatalog, generateDesign } from "@/lib/desktop/products";

const PORT = 5199;
const SHOTS = resolve("docs/screenshots");
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? "ok" : "FAIL"} ${msg}`); if (!ok) failed++; };
const requests: { product: string; model: boolean; bytes: number; objects: number; params: Record<string, unknown> | null }[] = [];
const getPath = (o: unknown, key: string) => key.split(".").reduce<unknown>((c, k) => (c && typeof c === "object" ? (c as Record<string, unknown>)[k] : undefined), o);
let designId = 0;

async function command(cmd: string, args: Record<string, unknown>) {
  switch (cmd) {
    case "plugin:app|version": return "1.0.9";
    case "plugin:event|listen": return 1;
    case "app_info": return { version: "1.0.9", server: "local", signedIn: true };
    case "me": return { user: { id: "qa", email: "qa@hingelab.test", name: "QA" }, plan: "pro", status: "active", periodEnd: null, entitlements: { cleanExport: true, proShapes: true, proGenerators: true }, minimumVersion: "1.0.0" };
    case "catalog": return desktopCatalog();
    case "get_prefs": return { exportDir: null, lastDir: null, openAfterExport: false };
    case "generate": {
      const req = args.request as { product: string; model?: boolean };
      const r = await generateDesign(req, "pro");
      if (!("product" in r.body)) return { __err: { kind: "invalid", message: (r.body as { error: string }).error } };
      const body = { ...r.body, ...(r.status === 200 ? { designId: ++designId } : {}) };
      requests.push({ product: req.product, model: !!req.model, bytes: JSON.stringify(body.model ?? null).length, objects: body.model?.objects.length ?? 0, params: (body.params as Record<string, unknown>) ?? null });
      return { status: r.status, body };
    }
    default: return null;
  }
}

const vite = await createServer({ configFile: resolve("desktop/vite.config.ts"), server: { port: PORT, strictPort: true }, logLevel: "error" });
await vite.listen();
const browser = await chromium.launch();
const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `desktop-3d-${name}.png`) });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector(".sidebar");

  const open = async (name: string) => {
    await page.locator(".sidebar").getByRole("button", { name: "Dashboard" }).first().click();
    await page.locator(".tile", { hasText: name }).first().click();
    await page.waitForSelector(".ws-head");
  };
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const ready3d = async () => {
    await page.waitForSelector(".v3 canvas.v3-gl", { state: "attached", timeout: 30000 }).catch(async (e) => {
      await shot(page, "debug");
      console.log(errors.join("\n"), await page.locator(".ws-canvas").innerHTML().then((h) => h.slice(0, 1500)));
      throw e;
    });
    await page.waitForFunction(() => !document.querySelector(".overlay[aria-busy]"), null, { timeout: 30000 });
    await page.waitForTimeout(900);
  };

  await open("Clock");
  await page.locator('img[alt="Preview of the cut file"]').waitFor();
  check(!requests.some((r) => r.model), "the 2D sheet does not ask for the 3D model");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await ready3d();
  const last = () => requests[requests.length - 1];
  check(last().model && last().objects > 0, `opening 3D asks for the model (${last().objects} objects, ${Math.round(last().bytes / 1024)} kB)`);
  const labels = await page.locator(".v3-pane:not([hidden]) .v3-label").allInnerTexts();
  check(labels.length === 4 && /Top/.test(labels[0]) && /Perspective/.test(labels[3]), `four views: ${labels.join(", ")}`);
  const dimTexts = () => page.locator(".v3-pane:not([hidden]) .v3-dims text").allTextContents();
  const dims = await dimTexts();
  check(dims.length >= 4 && dims.includes("300.0 mm"), `dimensions on the views: ${dims.join(", ")}`);
  await shot(page, "clock-quad");

  await page.locator(".v3").focus();
  await page.keyboard.press("Alt+w");
  await page.waitForTimeout(500);
  check(await page.locator(".v3-pane:not([hidden])").count() === 1, "Alt+W maximizes the active view");
  await shot(page, "clock-persp");

  const box = (await page.locator('.v3-pane[data-pane="persp"] .v3-hit').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);
  const picked = await page.locator(".v3-pick").innerText().catch(() => "");
  check(/Selected/.test(picked), `clicking a part selects it (${picked.replace(/\s+/g, " ")})`);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Edges", exact: true }).click();
  await page.locator('input[aria-label="Explode"]').fill("0.7");
  await page.waitForTimeout(500);
  check((await dimTexts()).length === 0, "no dimensions while exploded");
  await shot(page, "clock-exploded-edges");

  check(await page.getByRole("button", { name: /^Wire/ }).count() === 0, "there is no Wire display mode");
  await page.locator('input[aria-label="Explode"]').fill("0");
  await page.locator(".v3").focus();
  await page.keyboard.press("Alt+w");
  await page.waitForTimeout(500);
  check(await page.locator(".v3-pane:not([hidden])").count() === 4, "Alt+W again brings back the four views");
  check((await dimTexts()).length >= 4, "dimensions come back when assembled");
  await page.getByRole("button", { name: "Dimensions" }).click();
  await page.waitForTimeout(300);
  check((await dimTexts()).length === 0, "the ruler button hides the dimensions");
  await page.getByRole("button", { name: "Dimensions" }).click();
  await shot(page, "clock-edges-quad");
  await page.getByRole("button", { name: "Shaded", exact: true }).click();

  for (const name of ["Hinge Box", "Boxes", "Puzzle", "Sign", "Trophy"]) {
    await open(name);
    await ready3d();
    check(last().model && last().objects > 0, `${name}: 3D model (${last().objects} objects, ${Math.round(last().bytes / 1024)} kB)`);
    await shot(page, name.toLowerCase().replace(/\s+/g, "-"));
  }

  const before = requests.length;
  await page.locator(".ws-panel input").first().fill("120");
  await page.locator(".ws-panel input").first().press("Enter");
  await page.waitForTimeout(1500);
  check(requests.slice(before).every((r) => r.model), "edits in 3D keep asking for the model");

  // The 3D handles (D170/D171): click a part, drag a face, the setting follows.
  const hitOf = (pane: string) => page.locator(`.v3 .v3-pane[data-pane="${pane}"] .v3-hit`);
  const handlePoints = (pane: string) => hitOf(pane).evaluate((el: HTMLElement) => {
    const r = el.getBoundingClientRect(), pts: [number, number][] = [];
    for (let y = r.top + 3; y < r.bottom - 3; y += 5) for (let x = r.left + 3; x < r.right - 3; x += 5) {
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, buttons: 0, pointerId: 1 }));
      if (el.style.cursor === "grab") pts.push([x, y]);
    }
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 1, clientY: r.top + 1, bubbles: true, buttons: 0, pointerId: 1 }));
    return pts;
  });
  const handleAt = (pts: [number, number][], pick: (p: [number, number]) => number) => {
    if (!pts.length) return null;
    const best = pts.reduce((a, b) => (pick(b) > pick(a) ? b : a));
    const near = pts.filter((p) => Math.hypot(p[0] - best[0], p[1] - best[1]) < 22);
    return [near.reduce((s, p) => s + p[0], 0) / near.length, near.reduce((s, p) => s + p[1], 0) / near.length] as const;
  };
  const sizeDrag = async (name: string, key: string, pick: (p: [number, number]) => number, dx: number, dy: number) => {
    await open(name);
    await ready3d();
    await page.locator(".v3").focus();
    await page.keyboard.press("f");
    if (await page.locator(".v3.quad").count()) await page.keyboard.press("Alt+w");
    await page.waitForTimeout(800);
    check(await page.getByTestId("v3-grips").count() === 0, `${name}: no handles until a part is selected`);
    const b = (await hitOf("front").boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(600);
    check(await page.getByTestId("v3-grips").getByRole("button", { name: "Size" }).getAttribute("aria-pressed") === "true", `${name}: selecting a part shows its Size handles`);
    const h = handleAt(await handlePoints("front"), pick);
    check(!!h, `${name}: the Front view shows a handle`);
    if (!h) return;
    const v0 = getPath(last().params, key) as number;
    await page.mouse.move(h[0], h[1]);
    await page.mouse.down();
    await page.mouse.move(h[0] + dx / 2, h[1] + dy / 2, { steps: 4 });
    const tip = await page.getByTestId("v3-tip").innerText().catch(() => "");
    await page.mouse.move(h[0] + dx, h[1] + dy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(2000);
    const v1 = getPath(last().params, key) as number;
    check(tip.length > 0, `${name}: the pointer shows the size while dragging (${tip})`);
    check(v1 > v0 + 10, `${name}: dragging the face out sets ${key} (${v0} → ${v1} mm) and the server rebuilds it`);
    check(last().model, `${name}: the rebuilt design comes with its 3D model`);
    await shot(page, `${name.toLowerCase().replace(/\s+/g, "-")}-handles`);
  };
  await sizeDrag("Boxes", "box.width", (p) => p[0], 90, 0);
  await sizeDrag("Hinge Box", "H", (p) => -p[1], 0, -70);

  await page.getByRole("button", { name: "2D sheet", exact: true }).click();
  await page.locator('img[alt="Preview of the cut file"]').waitFor();
  check(true, "back to the 2D sheet");
  check(!errors.length, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  await vite.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
