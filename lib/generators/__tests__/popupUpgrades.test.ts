import { describe, expect, it } from "vitest";
import { POPUP } from "../popup";
import { dropOutline, eggOutline, outlineOf, ringPlan } from "../popup/build";
import { mergePopup } from "../popup/params";
import { bboxOf, pointInContour } from "../geom";
import { CTX } from "./ctx";

const p = (raw: unknown) => mergePopup(raw);
const RIBS = { support: { kind: "ribs", ribs: 2 }, rings: { width: 12, center: 50 }, profile: { kind: "flat-bottom", depth: 24 } };

describe("Pop-up upgrades: outlines", () => {
  it.each(["egg", "drop", "cloud"])("%s: a single outline round the centre, the size asked, and every ring inside the last", (shape) => {
    const q = p({ ...RIBS, outline: { shape, width: 220, height: 260 } });
    const o = outlineOf(q), b = bboxOf([o]);
    expect(pointInContour([0, 0], o)).toBe(true);
    expect(b.x1 - b.x0).toBeGreaterThan(220 * 0.95);
    expect(b.y1 - b.y0).toBeCloseTo(260, 0);
    const plan = ringPlan(q);
    expect(plan.collapsed).toBe(false);
    for (let i = 1; i < plan.loops.length; i++) for (const v of plan.loops[i]) expect(pointInContour(v, plan.loops[i - 1])).toBe(true);
    const out = POPUP.build(q, CTX);
    expect(out.error).toBeUndefined();
    expect(POPUP.check(q, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
    expect(POPUP.art!("outline.shape", shape).length).toBeGreaterThan(0);
  });
  it("the egg's narrow end is at the top and the drop's point is", () => {
    const width = (c: [number, number][], y: number) => { const xs = c.filter((v) => Math.abs(v[1] - y) < 4).map((v) => v[0]); return Math.max(...xs) - Math.min(...xs); };
    const egg = eggOutline(200, 260);
    expect(width(egg, -100)).toBeLessThan(width(egg, 100));
    const drop = dropOutline(200, 260);
    expect(width(drop, -120)).toBeLessThan(30);
  });
});

describe("Pop-up upgrades: square-wave edge", () => {
  it("the rings' edges swing out and in by the amplitude, flatter at the extremes than a sine", () => {
    const q = p({ outline: { shape: "circle", width: 260 }, pattern: { edge: "square", amplitude: 1.5, frequency: 24 }, rings: { width: 13, center: 60 }, support: { ribs: 3 } });
    const plan = ringPlan(q), loop = plan.loops[2];
    const r = loop.map((v) => Math.hypot(v[0], v[1]));
    const lo = Math.min(...r), hi = Math.max(...r);
    expect(hi - lo).toBeGreaterThan(2);
    // a square wave spends most of its length near the extremes
    const near = r.filter((v) => v > hi - (hi - lo) * 0.2 || v < lo + (hi - lo) * 0.2).length / r.length;
    expect(near).toBeGreaterThan(0.6);
    const sine = ringPlan(p({ ...q, pattern: { ...q.pattern, edge: "wave" } })).loops[2].map((v) => Math.hypot(v[0], v[1]));
    const sl = Math.min(...sine), sh = Math.max(...sine);
    expect(sine.filter((v) => v > sh - (sh - sl) * 0.2 || v < sl + (sh - sl) * 0.2).length / sine.length).toBeLessThan(near);
    expect(POPUP.build(q, CTX).error).toBeUndefined();
  });
});

describe("Pop-up upgrades: motifs", () => {
  it.each(["pomegranates", "eggs"])("%s engrave in the centre, and twelve round the rim between the rib joints", (motif) => {
    const centre = POPUP.build(p({ engraving: { motif }, support: { ribs: 3, labels: false } }), CTX);
    const rim = POPUP.build(p({ engraving: { motif, fill: true }, support: { ribs: 3, labels: false } }), CTX);
    expect(centre.parts[0].engrave!.length).toBeGreaterThan(0);
    expect(rim.parts[0].engrave!.length).toBeGreaterThanOrEqual(centre.parts[0].engrave!.length * 10);
    // nothing engraved at 0° on the rim, where a rib joint sits
    const R = 120 - 6;
    const hit = rim.parts[0].engrave!.some((c) => c.some((v) => Math.hypot(v[0] - R, v[1]) < 5));
    expect(hit).toBe(false);
  });
});

describe("Pop-up upgrades: presets", () => {
  it.each(["easter-egg-basket", "yalda-pomegranate-bowl", "cloud-nursery-tray", "crenellated-fruit-bowl", "drop-catch-all"])("%s builds without warnings", (id) => {
    const pr = POPUP.presets.find((x) => x.id === id)!;
    const q = POPUP.merge(pr.params), out = POPUP.build(q, CTX);
    expect(out.error).toBeUndefined();
    expect(out.notice).toBeUndefined();
    expect(POPUP.check(q, out).filter((i) => i.level !== "info").map((i) => i.code)).toEqual([]);
  }, 30000);
});
