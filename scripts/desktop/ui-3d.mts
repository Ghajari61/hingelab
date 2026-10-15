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

  // The scale gizmo (D170-D172): an axis sizes alone, a strip two axes, Shift keeps the proportions;
  // the design is scaled on screen while dragging and built once, on release.
  const hitOf = (pane: string) => page.locator(`.v3 .v3-pane[data-pane="${pane}"] .v3-hit`);
  type Pt = [number, number];
  const gizmoPoints = (pane: string) => hitOf(pane).evaluate((el: HTMLElement) => {
    const r = el.getBoundingClientRect(), out: Record<string, [number, number][]> = {};
    for (let y = r.top + 3; y < r.bottom - 3; y += 4) for (let x = r.left + 3; x < r.right - 3; x += 4) {
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, buttons: 0, pointerId: 1 }));
      const id = el.dataset.grip;
      if (id) (out[id] ??= []).push([x, y]);
    }
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 1, clientY: r.top + 1, bubbles: true, buttons: 0, pointerId: 1 }));
    return out;
  });
  const mid = (pts: Pt[]): Pt => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  const openFront = async (name: string) => {
    await open(name);
    await ready3d();
    await page.locator(".v3").focus();
    await page.keyboard.press("f");
    if (await page.locator(".v3.quad").count()) await page.keyboard.press("Alt+w");
    await page.waitForTimeout(800);
    check(await page.getByTestId("v3-grips").count() === 0, `${name}: no gizmo until a part is selected`);
    const b = (await hitOf("front").boundingBox())!;
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await page.waitForTimeout(600);
    check(await page.getByTestId("v3-grips").getByRole("button", { name: "Scale" }).getAttribute("aria-pressed") === "true", `${name}: selecting a part shows the scale gizmo`);
    const pts = await gizmoPoints("front");
    check(["scale-x", "scale-y", "scale-xy", "scale-all"].every((id) => pts[id]?.length), `${name}: the Front view shows the X and Y axes, their strip and the middle (${Object.keys(pts).join(", ")})`);
    return pts;
  };
  /** Drags from `a` to `b`; the requests sent while dragging and after, and the readout halfway. */
  const drag = async (a: Pt, b: Pt, o: { shift?: boolean; cancel?: boolean; shotName?: string } = {}) => {
    const n0 = requests.length;
    await page.mouse.move(a[0], a[1]);
    if (o.shift) await page.keyboard.down("Shift");
    await page.mouse.down();
    await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 5 });
    const tip = await page.getByTestId("v3-tip").innerText().catch(() => "");
    await page.mouse.move(b[0], b[1], { steps: 5 });
    await page.waitForTimeout(300);
    if (o.shotName) await shot(page, o.shotName);
    const during = requests.length - n0;
    if (o.cancel) await page.keyboard.press("Escape");
    await page.mouse.up();
    if (o.shift) await page.keyboard.up("Shift");
    await page.waitForTimeout(2000);
    return { tip, during, after: requests.length - n0 - during };
  };
  const val = (key: string) => getPath(last().params, key) as number;

  {
    const pts = await openFront("Boxes");
    const w0 = val("box.width"), d0 = val("box.depth"), h0 = val("box.height");
    const x = mid(pts["scale-x"]);
    const r = await drag(x, [x[0] + 60, x[1]], { shotName: "boxes-scale-drag" });
    check(/^Width \d/.test(r.tip), `Boxes: dragging X shows the width (${r.tip})`);
    check(r.during === 0, `Boxes: nothing is built while dragging (${r.during} requests)`);
    check(r.after === 1, `Boxes: one build when let go (${r.after})`);
    check(val("box.width") > w0 + 20 && val("box.depth") === d0 && val("box.height") === h0, `Boxes: X sizes the width alone (${w0} → ${val("box.width")} mm; depth ${val("box.depth")}, height ${val("box.height")})`);
    check(last().model, "Boxes: the rebuilt design comes with its 3D model");
    await shot(page, "boxes-scale");

    const p2 = await gizmoPoints("front");
    const w1 = val("box.width"), h1 = val("box.height");
    const xy = p2["scale-xy"], c: Pt = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[1]))], g = mid(xy);
    const plane = await drag(g, [g[0] + (g[0] - c[0]) * 0.4, g[1] + (g[1] - c[1]) * 0.4]);
    check(/Width .* · Height /.test(plane.tip), `Boxes: the strip shows width and height (${plane.tip})`);
    check(val("box.width") > w1 && val("box.height") > h1 && val("box.depth") === d0, `Boxes: the X-Y strip sizes width and height together (${w1}×${h1} → ${val("box.width")}×${val("box.height")}; depth ${val("box.depth")})`);

    const p3 = await gizmoPoints("front");
    const w2 = val("box.width"), y = mid(p3["scale-y"]);
    const esc = await drag(y, [y[0], y[1] - 50], { cancel: true });
    check(esc.after === 0 && val("box.width") === w2, `Boxes: Esc while dragging puts it back and builds nothing (${esc.after})`);
  }
  {
    const pts = await openFront("Hinge Box");
    const W0 = val("W"), D0 = val("D"), H0 = val("H");
    const y = mid(pts["scale-y"]);
    const r = await drag(y, [y[0], y[1] - 45], { shift: true });
    const W1 = val("W"), D1 = val("D"), H1 = val("H");
    check(r.during === 0 && r.after === 1, `Hinge Box: built once, on release (${r.during} while dragging, ${r.after} after)`);
    check(W1 > W0 && D1 > D0 && H1 > H0, `Hinge Box: Shift keeps the proportions, every size grows (${W0}×${D0}×${H0} → ${W1}×${D1}×${H1})`);
    check(Math.abs(H1 / H0 - W1 / W0) < 0.08, `Hinge Box: height and width grow alike (${(H1 / H0).toFixed(2)} and ${(W1 / W0).toFixed(2)})`);
    await shot(page, "hinge-box-scale");
  }

  await page.getByRole("button", { name: "2D sheet", exact: true }).click();
  await page.locator('img[alt="Preview of the cut file"]').waitFor();
  check(true, "back to the 2D sheet");
  check(!errors.length, `no page errors${errors.length ? ": " + errors.join(" | ") : ""}`);
} finally {
  await browser.close();
  await vite.close();
}
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
