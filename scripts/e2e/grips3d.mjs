// End-to-end check of the 3D handles (D170, D172): click a part in a 3D view and the scale gizmo
// appears. Its X axis sizes the width alone, the X-Y strip width and height together, Shift keeps
// the proportions, and Esc cancels; the design is scaled on screen while dragging and its settings
// change once, on release (one undo step). A ring turns the phone stand's lean. Letters and
// Parametric scale as a whole.
// Usage: a production server on SHOTS_BASE (default :3456), then node scripts/e2e/grips3d.mjs.
import path from "node:path";
import { BASE, withBrowser } from "../shots/lib.mjs";

const failures = [];
const check = (ok, what) => { console.log(`${ok ? "✓" : "✗"} ${what}`); if (!ok) failures.push(what); };
const field = (page, id) => page.locator(`.fld[data-id="${id}"] input`).first();
const num = async (page, id) => parseFloat(await field(page, id).inputValue());
const shot = (page, name) => process.env.E2E_SHOTS ? page.screenshot({ path: path.join(process.env.E2E_SHOTS, `grips3d-${name}.png`) }) : null;

let root = "#preview3d";

/** Opens the 3D view with one pane maximized. */
async function open3D(page, pane) {
  if (root === "#preview3d") await page.getByRole("tab", { name: "3D view" }).click();
  await page.locator(`${root} canvas`).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.locator(root).focus();
  await page.keyboard.press(pane[0]);
  if (await page.locator(`${root}.quad`).count()) await page.keyboard.press("Alt+w");
  await page.waitForTimeout(800);
}

const hit = (page, pane) => page.locator(`${root} .v3-pane[data-pane="${pane}"] .v3-hit`);

/** Points over each handle, by id, found by moving over the view. */
function gizmoPoints(page, pane) {
  return hit(page, pane).evaluate((el) => {
    const r = el.getBoundingClientRect(), out = {};
    for (let y = r.top + 3; y < r.bottom - 3; y += 4) for (let x = r.left + 3; x < r.right - 3; x += 4) {
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, buttons: 0, pointerId: 1 }));
      const id = el.dataset.grip;
      if (id) (out[id] ??= []).push([x, y]);
    }
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 1, clientY: r.top + 1, bubbles: true, buttons: 0, pointerId: 1 }));
    return out;
  });
}
const mid = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

/** Drags from `a` by (dx, dy); the readout halfway, and a field read while still dragging. */
async function drag(page, a, dx, dy, o = {}) {
  await page.mouse.move(a[0], a[1]);
  if (o.shift) await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(a[0] + dx / 2, a[1] + dy / 2, { steps: 5 });
  const tip = await page.getByTestId("v3-tip").innerText().catch(() => "");
  await page.mouse.move(a[0] + dx, a[1] + dy, { steps: 5 });
  await page.waitForTimeout(300);
  const during = o.watch ? await num(page, o.watch) : null;
  if (o.shotName) await shot(page, o.shotName);
  if (o.cancel) await page.keyboard.press("Escape");
  await page.mouse.up();
  if (o.shift) await page.keyboard.up("Shift");
  await page.waitForTimeout(1500);
  return { tip, during };
}

/** Clicks the middle of a view (or the given fractions of it) and waits for the gizmo. */
async function selectPart(page, pane, fx = 0.5, fy = 0.5) {
  const b = await hit(page, pane).boundingBox();
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
  await page.waitForTimeout(600);
}

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // ---- Boxes: X sizes the width alone, the X-Y strip width and height, Esc cancels.
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.locator(".canvas svg path").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const w0 = await num(page, "box.width"), d0 = await num(page, "box.depth"), h0 = await num(page, "box.height");
  await open3D(page, "front");
  check(await page.getByTestId("v3-grips").count() === 0, "no gizmo until a part is selected");
  await selectPart(page, "front");
  check(/Selected:/.test(await page.locator("#preview3d .v3-pick").innerText().catch(() => "")), "clicking the box selects a part");
  check(await page.getByTestId("v3-grips").getByRole("button", { name: "Scale" }).getAttribute("aria-pressed") === "true", "and shows the scale gizmo");
  let pts = await gizmoPoints(page, "front");
  check(["scale-x", "scale-y", "scale-xy", "scale-all"].every((id) => pts[id]?.length) && !pts["scale-z"], `the Front view shows X, Y, their strip and the middle, not Z end-on (${Object.keys(pts).join(", ")})`);
  await shot(page, "1-boxes-gizmo");
  if (pts["scale-x"]) {
    const r = await drag(page, mid(pts["scale-x"]), 60, 0, { watch: "box.width", shotName: "2-boxes-dragging" });
    check(/^Width \d/.test(r.tip), `the pointer shows the width while dragging (${r.tip})`);
    check(r.during === w0, `the setting waits for the release: nothing is rebuilt while dragging (${r.during})`);
    const w1 = await num(page, "box.width");
    check(w1 > w0 + 20 && await num(page, "box.depth") === d0 && await num(page, "box.height") === h0, `X sizes the width alone (${w0} → ${w1} mm)`);
    await shot(page, "3-boxes-wider");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1000);
    check(await num(page, "box.width") === w0, "one Ctrl+Z puts the width back");
  }
  await selectPart(page, "front");
  pts = await gizmoPoints(page, "front");
  if (pts["scale-xy"]) {
    const xy = pts["scale-xy"], c = [Math.min(...xy.map((p) => p[0])), Math.max(...xy.map((p) => p[1]))], g = mid(xy);
    const r = await drag(page, g, (g[0] - c[0]) * 0.4, (g[1] - c[1]) * 0.4);
    const w2 = await num(page, "box.width"), h2 = await num(page, "box.height");
    check(/Width .* · Height /.test(r.tip) && w2 > w0 && h2 > h0 && await num(page, "box.depth") === d0, `the X-Y strip sizes width and height together (${w0}×${h0} → ${w2}×${h2} mm, "${r.tip}")`);
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1000);
    check(await num(page, "box.width") === w0 && await num(page, "box.height") === h0, "and one Ctrl+Z puts both back");
  }
  await selectPart(page, "front");
  pts = await gizmoPoints(page, "front");
  if (pts["scale-y"]) {
    await drag(page, mid(pts["scale-y"]), 0, -50, { cancel: true });
    check(await num(page, "box.height") === h0, "Esc while dragging puts the size back");
  }

  // ---- Boxes phone stand: the ring sets the lean.
  await page.getByRole("tablist", { name: "View" }).getByRole("tab").first().click();
  await page.getByRole("group", { name: "Design" }).locator('.gcard[data-v="stand"]').click();
  await page.waitForTimeout(1500);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const a0 = await num(page, "stand.angle");
  await open3D(page, "left");
  await selectPart(page, "left", 0.5, 0.62);
  const grips = page.getByTestId("v3-grips");
  check(await grips.getByRole("button", { name: "Turn" }).count() === 1, "the phone stand offers Turn handles");
  await page.keyboard.press("e");
  check(await grips.getByRole("button", { name: "Turn" }).getAttribute("aria-pressed") === "true", "E switches to them");
  const ring = (await gizmoPoints(page, "left"))["turn-x-stand.angle"] ?? [];
  check(ring.length > 20, `the Left view shows the lean ring (${ring.length} points)`);
  if (ring.length) {
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, R = (Math.max(...xs) - Math.min(...xs)) / 2 - 3;
    await page.mouse.move(cx, cy - R);
    await page.mouse.down();
    // 10° clockwise in the Left view (the x axis points away): the rest stands 10° more upright.
    for (let deg = 2; deg <= 10; deg += 2) {
      const t = -Math.PI / 2 + (deg * Math.PI) / 180;
      await page.mouse.move(cx + R * Math.cos(t), cy + R * Math.sin(t));
    }
    const tip = await page.getByTestId("v3-tip").innerText().catch(() => "");
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const a1 = await num(page, "stand.angle");
    check(tip === `Lean ${a0 + 10}°` && a1 === a0 + 10, `dragging 10° round the ring turns the lean 10° (${a0}° → ${a1}°, "${tip}")`);
    await shot(page, "4-stand-turn");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1000);
    check(await num(page, "stand.angle") === a0, "Ctrl+Z puts the lean back");
  }

  // ---- Hinge Box: Shift keeps the proportions.
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForTimeout(2500);
  const W0 = await num(page, "W"), D0 = await num(page, "D"), H0 = await num(page, "H");
  await open3D(page, "front");
  await selectPart(page, "front", 0.5, 0.6);
  pts = await gizmoPoints(page, "front");
  check(!!pts["scale-y"], "the Hinge Box shows the gizmo once a part is selected");
  if (pts["scale-y"]) {
    const r = await drag(page, mid(pts["scale-y"]), 0, -40, { shift: true });
    const W1 = await num(page, "W"), D1 = await num(page, "D"), H1 = await num(page, "H");
    check(W1 > W0 && D1 > D0 && H1 > H0 && Math.abs(H1 / H0 - W1 / W0) < 0.08, `with Shift every size grows alike (${W0}×${D0}×${H0} → ${W1}×${D1}×${H1}, "${r.tip}")`);
    await shot(page, "5-hinge-proportional");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check(await page.getByTestId("v3-grips").count() === 0, "Esc clears the selection and its gizmo");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1500);
    check(await num(page, "W") === W0 && await num(page, "H") === H0, "one Ctrl+Z puts every size back");
  }

  // ---- Letters: X scales the text.
  await page.goto(`${BASE}/app/editor/local?p=letters`);
  await page.waitForTimeout(3000);
  const s0 = await num(page, "size");
  await open3D(page, "top");
  for (const [fx, fy] of [[0.5, 0.5], [0.35, 0.5], [0.65, 0.5], [0.5, 0.58], [0.2, 0.5], [0.8, 0.5]]) {
    await selectPart(page, "top", fx, fy);
    if (await page.getByTestId("v3-grips").count()) break;
  }
  pts = await gizmoPoints(page, "top");
  check(!!pts["scale-x"], "Letters show the gizmo once a letter is selected");
  if (pts["scale-x"]) {
    await drag(page, mid(pts["scale-x"]), 40, 0);
    const s1 = await num(page, "size");
    check(s1 > s0, `dragging X out makes the letters bigger (${s0} → ${s1} mm)`);
    await shot(page, "6-letters-bigger");
  }

  // ---- Parametric: with a part selected, the gizmo scales the model and a ring turns it.
  root = '[data-testid="parametric-view"]';
  await page.goto(`${BASE}/app/editor/local?p=parametric`);
  await page.locator(".dock details").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(8000);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const sc0 = await num(page, "uniformScale");
  await open3D(page, "front");
  await selectPart(page, "front");
  const pg = page.getByTestId("v3-grips");
  check(await pg.getByRole("button", { name: "Scale" }).count() === 1 && await pg.getByRole("button", { name: "Turn" }).count() === 1, "a selected Parametric part offers Scale and Turn handles");
  await page.keyboard.press("r");
  pts = await gizmoPoints(page, "front");
  check(!!pts["scale-all"], "and shows the model's scale gizmo");
  if (pts["scale-all"]) {
    const r = await drag(page, mid(pts["scale-all"]), 0, -40);
    const sc1 = await num(page, "uniformScale");
    check(/^Scale /.test(r.tip) && sc1 > sc0, `dragging the middle up scales the model up (${sc0} → ${sc1}, "${r.tip}")`);
    await page.waitForTimeout(4000);
    await shot(page, "7-parametric-scaled");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(800);
    check(await num(page, "uniformScale") === sc0, "Ctrl+Z puts the scale back");
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll 3D handle checks passed.");
