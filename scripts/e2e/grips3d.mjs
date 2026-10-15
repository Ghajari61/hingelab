// End-to-end check of the 3D handles (D170): click a part in a 3D view, drag a face handle and the
// design's setting follows (Boxes width, Hinge Box height, Letters size); a ring turns the phone
// stand's lean; each drag is one undo step.
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

/** Points over a handle (the pointer turns into a hand there), found by moving over the view. */
function handlePoints(page, pane) {
  return hit(page, pane).evaluate((el) => {
    const r = el.getBoundingClientRect(), pts = [];
    for (let y = r.top + 3; y < r.bottom - 3; y += 5) for (let x = r.left + 3; x < r.right - 3; x += 5) {
      el.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, bubbles: true, buttons: 0, pointerId: 1 }));
      if (el.style.cursor === "grab") pts.push([x, y]);
    }
    el.dispatchEvent(new PointerEvent("pointermove", { clientX: r.left + 1, clientY: r.top + 1, bubbles: true, buttons: 0, pointerId: 1 }));
    return pts;
  });
}

/** The middle of the handle whose points are furthest along `pick` (e.g. rightmost). */
function handleAt(pts, pick) {
  if (!pts.length) return null;
  const best = pts.reduce((a, b) => (pick(b) > pick(a) ? b : a));
  const near = pts.filter((p) => Math.hypot(p[0] - best[0], p[1] - best[1]) < 22);
  return [near.reduce((s, p) => s + p[0], 0) / near.length, near.reduce((s, p) => s + p[1], 0) / near.length];
}

async function drag(page, from, dx, dy) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(from[0] + dx / 2, from[1] + dy / 2, { steps: 4 });
  const tip = await page.getByTestId("v3-tip").innerText().catch(() => "");
  await page.mouse.move(from[0] + dx, from[1] + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  return tip;
}

await withBrowser(async (page) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  // ---- Boxes: a side face sets the width.
  await page.goto(`${BASE}/app/editor/local?p=boxes`);
  await page.locator(".canvas svg path").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const w0 = await num(page, "box.width");
  await open3D(page, "front");
  check(await page.getByTestId("v3-grips").count() === 0, "no handles until a part is selected");
  const box = await hit(page, "front").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  check(/Selected:/.test(await page.locator("#preview3d .v3-pick").innerText().catch(() => "")), "clicking the box selects a part");
  check(await page.getByTestId("v3-grips").getByRole("button", { name: "Size" }).getAttribute("aria-pressed") === "true", "and shows its Size handles");
  let pts = await handlePoints(page, "front");
  const right = handleAt(pts, (p) => p[0]);
  check(!!right, `the Front view shows handles (${pts.length} points)`);
  await shot(page, "1-boxes-handles");
  if (right) {
    const tip = await drag(page, right, 90, 0);
    check(/^Width \d/.test(tip), `the pointer shows the width while dragging (${tip})`);
    const w1 = await num(page, "box.width");
    check(w1 > w0 + 10, `dragging the right face out widens the box (${w0} → ${w1} mm)`);
    check(await num(page, "box.depth") === 80, "and leaves the depth");
    await shot(page, "2-boxes-wider");
    pts = await handlePoints(page, "front");
    const right2 = handleAt(pts, (p) => p[0]);
    check(!!right2 && right2[0] > right[0] + 10, "the view keeps its framing, so the face moved out on screen");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1000);
    check(await num(page, "box.width") === w0, "one Ctrl+Z puts the width back");
  }

  // ---- Boxes phone stand: the ring sets the lean.
  await page.getByRole("tablist", { name: "View" }).getByRole("tab").first().click();
  await page.getByRole("group", { name: "Design" }).locator('.gcard[data-v="stand"]').click();
  await page.waitForTimeout(1500);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const a0 = await num(page, "stand.angle");
  await open3D(page, "left");
  const lb = await hit(page, "left").boundingBox();
  await page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height * 0.62);
  await page.waitForTimeout(600);
  const grips = page.getByTestId("v3-grips");
  check(await grips.getByRole("button", { name: "Turn" }).count() === 1, "the phone stand offers Turn handles");
  await page.keyboard.press("e");
  check(await grips.getByRole("button", { name: "Turn" }).getAttribute("aria-pressed") === "true", "E switches to them");
  pts = await handlePoints(page, "left");
  check(pts.length > 20, `the Left view shows the lean ring (${pts.length} points)`);
  if (pts.length) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
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
    await shot(page, "3-stand-turn");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1000);
    check(await num(page, "stand.angle") === a0, "Ctrl+Z puts the lean back");
  }

  // ---- Hinge Box: the top face sets the height.
  await page.goto(`${BASE}/app/editor/local?p=hinge`);
  await page.waitForTimeout(2500);
  const h0 = await num(page, "H");
  await open3D(page, "front");
  const hb = await hit(page, "front").boundingBox();
  await page.mouse.click(hb.x + hb.width / 2, hb.y + hb.height * 0.6);
  await page.waitForTimeout(600);
  pts = await handlePoints(page, "front");
  const top = handleAt(pts, (p) => -p[1]);
  check(!!top, "the Hinge Box shows handles once a part is selected");
  if (top) {
    const tip = await drag(page, top, 0, -70);
    const h1 = await num(page, "H");
    check(/^Height \d/.test(tip) && h1 > h0 + 5, `dragging the top up makes the box taller (${h0} → ${h1} mm)`);
    await shot(page, "4-hinge-taller");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    check(await page.getByTestId("v3-grips").count() === 0, "Esc clears the selection and its handles");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(1500);
    check(await num(page, "H") === h0, "Ctrl+Z puts the height back");
  }

  // ---- Letters: a side face scales the text.
  await page.goto(`${BASE}/app/editor/local?p=letters`);
  await page.waitForTimeout(3000);
  const s0 = await num(page, "size");
  await open3D(page, "top");
  const tb = await hit(page, "top").boundingBox();
  const centre = [tb.x + tb.width / 2, tb.y + tb.height / 2];
  // Somewhere on the letters: try a few points until something is selected.
  for (const [fx, fy] of [[0, 0], [-0.15, 0], [0.15, 0], [0, 0.08], [-0.3, 0], [0.3, 0]]) {
    await page.mouse.click(centre[0] + fx * tb.width, centre[1] + fy * tb.height);
    await page.waitForTimeout(400);
    if (await page.getByTestId("v3-grips").count()) break;
  }
  pts = await handlePoints(page, "top");
  const lr = handleAt(pts, (p) => p[0]);
  check(!!lr, "Letters show handles once a letter is selected");
  if (lr) {
    await drag(page, lr, 60, 0);
    const s1 = await num(page, "size");
    check(s1 > s0, `dragging the side out makes the letters bigger (${s0} → ${s1} mm)`);
    await shot(page, "5-letters-bigger");
  }

  // ---- Parametric: with a part selected, a face scales the model and a ring turns it.
  root = '[data-testid="parametric-view"]';
  await page.goto(`${BASE}/app/editor/local?p=parametric`);
  await page.locator(".dock details").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(8000);
  await page.locator(".dock details").evaluateAll((els) => { for (const d of els) d.open = true; });
  const sc0 = await num(page, "uniformScale");
  await open3D(page, "front");
  const pb = await hit(page, "front").boundingBox();
  await page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.waitForTimeout(600);
  const pg = page.getByTestId("v3-grips");
  check(await pg.getByRole("button", { name: "Size" }).count() === 1 && await pg.getByRole("button", { name: "Turn" }).count() === 1, "a selected Parametric part offers Size and Turn handles");
  await page.keyboard.press("r");
  pts = await handlePoints(page, "front");
  const pr = handleAt(pts, (p) => p[0]);
  check(!!pr, "and shows the model's size handles");
  if (pr) {
    const tip = await drag(page, pr, 60, 0);
    const sc1 = await num(page, "uniformScale");
    check(/^Width \d/.test(tip) && sc1 > sc0, `dragging a side out scales the model up (${sc0} → ${sc1})`);
    await page.waitForTimeout(4000);
    await shot(page, "6-parametric-scaled");
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(800);
    check(await num(page, "uniformScale") === sc0, "Ctrl+Z puts the scale back");
  }

  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
}, { width: 1440, height: 900 });

if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log("\nAll 3D handle checks passed.");
