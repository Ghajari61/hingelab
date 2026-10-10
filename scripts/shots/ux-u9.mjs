// UX U9 (D88): pages and editors are interactive within 2.5 s, and text shaping (HarfBuzz, fonts)
// loads only when a Parametric Text source is picked. Bundle budgets: node scripts/perf/budgets.mjs.
import { BASE, shot, withBrowser } from "./lib.mjs";

const check = (ok, msg) => { if (!ok) throw new Error("FAILED: " + msg); console.log("ok", msg); };
const TTI_MS = 2500;

/** Milliseconds from navigation start until `sel` is on screen and hydrated by React. */
const interactiveAt = (page, sel) => page.waitForFunction((s) => {
  const el = document.querySelector(s);
  if (!el || !el.getClientRects().length) return false;
  return Object.keys(el).some((k) => k.startsWith("__reactProps")) ? performance.now() : false;
}, sel, { polling: "raf", timeout: 30000 }).then((h) => h.jsonValue());

const waitSliced = async (page) => {
  await page.waitForTimeout(400);
  await page.waitForFunction(() => /\d+ parts/.test(document.querySelector(".pe-stage")?.textContent ?? "") && !document.querySelector(".pe-progress"), null, { timeout: 120000 });
  return page.locator(".pe-stage").textContent();
};

await withBrowser(async (page, context) => {
  const pages = [
    ["landing page", "/", "a[href], button"],
    ["home page", "/home", "a[href], button"],
    ["start gallery", "/app/editor/local", ".start-tile"],
    ["help centre", "/help", 'input[aria-label="Search help"]'],
    ["Hinge Box editor", "/app/editor/local?p=hinge", ".dock button"],
  ];
  // Cold loads with the CPU slowed 4× (a mid-range laptop rather than the build machine).
  for (const [name, path, sel] of pages) {
    const p = await context.newPage();
    const cdp = await context.newCDPSession(p);
    await cdp.send("Network.enable");
    await cdp.send("Network.clearBrowserCache");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await p.goto(`${BASE}${path}`, { waitUntil: "commit" });
    const ms = await interactiveAt(p, sel);
    check(ms < TTI_MS, `${name} is interactive in ${Math.round(ms)} ms at 4× CPU slowdown (< ${TTI_MS})`);
    await p.close();
  }

  await page.addInitScript(() => { if (!sessionStorage.getItem("u9")) { localStorage.clear(); sessionStorage.setItem("u9", "1"); } });
  const requested = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Parametric", exact: true }).click();
  await page.getByRole("group", { name: "Slicing method" }).waitFor();
  const dockMs = Date.now() - t0;
  check(dockMs < TTI_MS, `the Parametric controls are ready ${dockMs} ms after the click (< ${TTI_MS})`);
  const s = await waitSliced(page);
  console.log("   first slice:", s);
  check(!requested.some((u) => u.includes("/hb/") || u.includes("/fonts/")), "HarfBuzz and fonts are not loaded for the default model source");

  await page.getByRole("group", { name: "Model from" }).getByRole("button", { name: "Text" }).click();
  const t = await waitSliced(page);
  check(requested.some((u) => u.includes("/hb/")) && requested.some((u) => u.includes("/fonts/")), "picking Text loads HarfBuzz and the font");
  check(/\d+ parts/.test(t), `the text is shaped and sliced (${t})`);
  await shot(page, "ux-u9-text-source");
});
