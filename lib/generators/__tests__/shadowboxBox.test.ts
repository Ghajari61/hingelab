import { describe, expect, it } from "vitest";
import { bboxOf, circle, pointInContour, signedArea } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import type { ShadowBoxOutput } from "../shadowbox/build";
import { digits, drillPart, FOOT_PLAY, PIN_ANGLES, rayHit, WALL_PLAY } from "../shadowbox/enclosure";
import { mergeShadowBox, type ShadowBoxParams } from "../shadowbox/params";
import { arrangeGenerator, genSVG } from "../output";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

/** A laser-cut box: 3 mm board, a rectangle 200 × 160 with a 14 mm border, foam between layers. */
const LASER = { cutter: { kind: "laser" }, material: "custom", T: 3, K: 0, frame: { shape: "rect", width: 200, height: 160, border: 14, corner: 0 }, stack: { count: 6, back: false, spacer: "none", gap: 2 } };
const P = (over: Record<string, unknown> = {}) => mergeShadowBox({ ...LASER, ...over });
const build = (p: ShadowBoxParams) => SHADOWBOX.build(p, CTX) as ShadowBoxOutput;
const part = (out: ShadowBoxOutput, id: string) => out.parts.find((q) => q.id === id)!;
const area = (q: GenPart) => Math.abs(signedArea(q.outer)) - q.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
const codes = (p: ShadowBoxParams) => SHADOWBOX.check(p, build(p)).map((i) => i.code);

describe("shadow box enclosure", () => {
  it("adds nothing by default", () => {
    const out = build(P());
    expect(out.parts.map((q) => q.id).filter((id) => !/^layer\d+$/.test(id))).toEqual([]);
    expect(part(out, "layer1").place!.z).toBe(0);
    expect(out.materials).toBeUndefined();
  });

  it("builds a light box with a cable notch and a diffuser under the stack", () => {
    const p = P({ light: { on: true, depth: 12, cable: 6, diffuser: true, diffT: 2 }, box: { back: "glued" } });
    const out = build(p);
    const rings = out.parts.filter((q) => q.id.startsWith("ring"));
    expect(rings).toHaveLength(4);
    expect(rings.map((r) => r.place!.z)).toEqual([3, 6, 9, 12]);
    // The first two rings (6 mm of cable in 3 mm board) are notched at the bottom.
    expect(area(rings[0])).toBeCloseTo(area(rings[2]) - 6 * 14, 0);
    expect(area(rings[1])).toBeCloseTo(area(rings[0]), 3);
    const back = part(out, "backboard"), diff = part(out, "diffuser");
    expect(back.place!.z).toBe(0);
    expect(diff).toMatchObject({ material: "second", t: 2, place: { z: 15 } });
    expect(part(out, "layer1").place!.z).toBe(17);
    expect(out.info!.depth).toBeCloseTo(17 + 6 * 3 + 5 * 2, 6);
    expect(out.stats.find((s) => s.label === "Light box")?.value).toBe("4 rings, 12 mm deep");
    expect(out.materials?.second).toMatch(/^Diffuser 2 mm/);
    expect(out.assembly!.some((a) => /LED strip/.test(a) && /notch/.test(a))).toBe(true);
    // The rings leave the window open for the light.
    const wb = bboxOf([rings[2].holes[0]]);
    expect(wb.x1 - wb.x0).toBeCloseTo(172, 0);
  });

  it("warns when a solid back layer blocks the light", () => {
    const p = P({ stack: { ...LASER.stack, back: true }, light: { on: true } });
    const issue = SHADOWBOX.check(p, build(p)).find((i) => i.code === "LIGHT_BLOCKED")!;
    expect(issue.fixes.map((f) => f.id)).toEqual(["pattern", "hole"]);
    expect(codes(issue.fixes[0].apply(p))).not.toContain("LIGHT_BLOCKED");
    expect(codes(issue.fixes[1].apply(p))).not.toContain("LIGHT_BLOCKED");
  });

  it("screws the back board on with clearance and pilot holes", () => {
    const lit = build(P({ light: { on: true, depth: 6, cable: 0 }, box: { back: "screwed", screw: 3 } }));
    expect(part(lit, "backboard").holes).toHaveLength(4);
    for (const r of lit.parts.filter((q) => q.id.startsWith("ring"))) expect(r.holes).toHaveLength(1 + 4);
    const d = (c: [number, number][]) => bboxOf([c]).x1 - bboxOf([c]).x0;
    expect(d(part(lit, "backboard").holes[0])).toBeCloseTo(3, 1);
    expect(d(part(lit, "ring1").holes.find((h) => d(h) < 5)!)).toBeCloseTo(2.1, 1);
    // Without a light box the pilot holes go in Layer 1.
    const plain = build(P({ box: { back: "screwed" } }));
    expect(part(plain, "layer1").holes.filter((h) => d(h) < 5)).toHaveLength(4);
  });

  it("pins every part that shares the border, at points that are not symmetric", () => {
    const p = P({ stack: { ...LASER.stack, spacer: "frames", per: 1 }, box: { back: "glued", pins: true, pin: 3 } });
    const out = build(p), off = build({ ...p, box: { ...p.box, pins: false } });
    const flat = out.parts.filter((q) => !q.place?.upright);
    for (const q of flat) expect(q.holes.length, q.id).toBe(part(off, q.id).holes.length + 2);
    const pins = part(out, "backboard").holes.map((h) => { const b = bboxOf([h]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; });
    const c = [100, 80];
    // Turned half a turn, neither pin lands on the other.
    expect(Math.hypot(2 * c[0] - pins[0][0] - pins[1][0], 2 * c[1] - pins[0][1] - pins[1][1])).toBeGreaterThan(5);
    // Each sits in the middle of the border band.
    for (const [x, y] of pins) expect(Math.min(x, 200 - x, y, 160 - y)).toBeCloseTo(7, 0);
    expect(PIN_ANGLES).toHaveLength(2);
  });

  it("puts keyholes in a light box's window, or in the border with room for the heads", () => {
    const cavity = build(P({ light: { on: true, depth: 9, cable: 0 }, box: { back: "glued", hang: "keyhole", head: 8 } }));
    const back = part(cavity, "backboard");
    expect(back.holes).toHaveLength(2);
    for (const h of back.holes) {
      const b = bboxOf([h]);
      expect(b.y0).toBeGreaterThan(14);
      expect(b.x1 - b.x0).toBeCloseTo(8, 1);
    }
    expect(cavity.info!.keyBorder).toBeUndefined();
    // In a 14 mm border there is no room: the check offers a wider border, which then fits.
    const tight = P({ box: { hang: "keyhole", head: 8 } });
    const issue = SHADOWBOX.check(tight, build(tight)).find((i) => i.code === "KEYHOLE_ROOM")!;
    const wide = issue.fixes[0].apply(tight);
    expect(wide.frame.border).toBeGreaterThan(14);
    const out = build(wide);
    expect(out.info!.keyBorder).toBeUndefined();
    expect(part(out, "layer1").holes.length).toBe(part(build({ ...wide, box: { ...wide.box, hang: "none" } }), "layer1").holes.length + 2);
    // Layer 2 sits 5 mm up (3 mm board, 2 mm foam): just past the heads' room.
    const near = build({ ...wide, stack: { ...wide.stack, gap: 0.5 } });
    expect(part(near, "layer2").holes.length).toBe(part(build({ ...wide, stack: { ...wide.stack, gap: 0.5 }, box: { ...wide.box, hang: "none" } }), "layer2").holes.length + 2);
    expect(out.assembly!.some((a) => /keyholes/.test(a))).toBe(true);
  });

  it("builds four finger-jointed walls round everything", () => {
    const p = P({ light: { on: true, depth: 9, cable: 6 }, box: { back: "glued", walls: true, lip: 4, finger: 10 } });
    const out = build(p);
    const ws = out.parts.filter((q) => q.id.startsWith("wall"));
    expect(ws.map((q) => q.name)).toEqual(["Box top", "Box bottom", "Box left side", "Box right side"]);
    const D = out.info!.depth + 4;
    expect(out.info!.boxD).toBeCloseTo(D, 1);
    const top = bboxOf([ws[0].outer]), side = bboxOf([ws[2].outer]);
    expect(top.x1 - top.x0).toBeCloseTo(200 + 2 * WALL_PLAY + 6, 6);
    expect(side.x1 - side.x0).toBeCloseTo(160 + 2 * WALL_PLAY + 6, 6);
    expect(top.y1 - top.y0).toBeCloseTo(D, 6);
    expect(ws[0].outer.length).toBeGreaterThan(8);
    // Along the corner, the top wall's fingers and the side wall's fill the depth between them, once.
    const col = (q: GenPart, v: number) => pointInContour([1.5, v], q.outer);
    let both = 0, none = 0;
    for (let v = 0.25; v < D; v += 0.5) {
      const a = col(ws[0], v), b = col(ws[2], v);
      if (a && b) both++;
      if (!a && !b) none++;
    }
    expect(both).toBe(0);
    expect(none).toBe(0);
    // The bottom wall has a hole for the cable, level with the notched rings.
    expect(ws[1].holes).toHaveLength(1);
    expect(ws[0].holes).toHaveLength(0);
    expect(out.stats.find((s) => s.label === "Box")?.value).toBe(`207 × 167 × ${Math.round(D)} mm`);
    expect(ws.every((q) => q.place?.upright)).toBe(true);
    const svg = genSVG(SHADOWBOX, p, arrangeGenerator(SHADOWBOX, p, CTX).lay!);
    expect(svg).toContain("Box left side");
    // Thin card cannot make walls.
    expect(codes(P({ T: 0.5, box: { walls: true } }))).toContain("BOX_THIN");
    expect(codes(p)).not.toContain("BOX_THIN");
  });

  it("stands in two slotted feet the box's depth wide", () => {
    const p = P({ box: { hang: "stand" } });
    const out = build(p), D = out.info!.depth;
    const fs = out.parts.filter((q) => q.id.startsWith("foot"));
    expect(fs).toHaveLength(2);
    for (const f of fs) {
      const b = bboxOf([f.outer]);
      expect(b.y1 - b.y0).toBeCloseTo(D + 60, 6);
      // The slot: open at the foot's edge, the box's depth plus play across.
      const inSlot = (y: number) => !pointInContour([2, y], f.outer);
      const mid = (b.y0 + b.y1) / 2;
      expect(inSlot(mid + (D + FOOT_PLAY) / 2 - 0.05)).toBe(true);
      expect(inSlot(mid + (D + FOOT_PLAY) / 2 + 0.05)).toBe(false);
    }
  });

  it("scores layer numbers under the front layer, and narrows spacer frames", () => {
    const out = build(P({ box: { numbers: true } }));
    for (let k = 1; k <= 5; k++) expect(part(out, `layer${k}`).score?.length, `layer ${k}`).toBeGreaterThan(0);
    expect(part(out, "layer6").score).toBeUndefined();
    expect(digits(18, 0, 0, 6)).toHaveLength(2 + 7);
    const p = P({ stack: { ...LASER.stack, spacer: "frames", per: 1, spacerW: 5 } });
    const narrow = build(p), wide = build({ ...p, stack: { ...p.stack, spacerW: 0 } });
    expect(area(part(narrow, "spacer1"))).toBeLessThan(area(part(wide, "spacer1")) * 0.5);
    expect(narrow.info!.band).toBe(5);
    // Pins need 3 + 2 × 1.5 mm: the narrow spacers are widened by the fix.
    const pinned = { ...p, box: { ...p.box, pins: true, pin: 3 } };
    const issue = SHADOWBOX.check(pinned, build(pinned)).find((i) => i.code === "BAND_TIGHT")!;
    expect(issue.fixes[0].label).toBe("Spacer frames 6 mm wide");
    expect(codes(issue.fixes[0].apply(pinned))).not.toContain("BAND_TIGHT");
  });

  it("keeps only valid settings", () => {
    expect(mergeShadowBox({ light: { on: "yes", depth: 999, cable: -1, diffT: 0 }, box: { back: "nailed", hang: "rope", head: 1, walls: 1, lip: -5, finger: 100, pins: true, pin: 50 }, stack: { spacerW: -3 } }))
      .toMatchObject({ light: { on: false, depth: 60, cable: 0, diffT: 0.1 }, box: { back: "none", hang: "none", head: 4, walls: false, lip: 0, finger: 40, pins: true, pin: 8 }, stack: { spacerW: 0 } });
  });

  it("geometry helpers: rays and drilling", () => {
    expect(rayHit([[0, 0], [10, 0], [10, 10], [0, 10]], 5, 5, 0)).toEqual([10, 5]);
    const sq: GenPart = { id: "a", name: "A", outer: [[0, 0], [20, 0], [20, 20], [0, 20]], holes: [] };
    expect(drillPart(sq, circle(10, 10, 2)).holes).toHaveLength(1);
    // A hole that would break the edge is not cut.
    expect(drillPart(sq, circle(19.5, 10, 2))).toBe(sq);
  });
});
