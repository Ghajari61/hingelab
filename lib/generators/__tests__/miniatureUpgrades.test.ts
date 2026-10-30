import { describe, expect, it } from "vitest";
import { buildMiniature, type MiniOutput } from "../miniature/build";
import { mergeMiniature, type MiniatureParams } from "../miniature/params";
import { MINIATURE } from "../miniature";
import { checkMiniature } from "../miniature/check";
import { gardenBridge } from "../miniature/accessory";
import { bboxOf, distToContour, pointInContour } from "../geom";
import type { GenPart } from "../types";
import { CTX } from "./ctx";
import { placePoint as world, unplacePoint as local, type V3 } from "../place";
import type { Contour } from "../types";

const build = (raw: unknown) => buildMiniature(mergeMiniature(raw), CTX) as MiniOutput;
const codes = (q: MiniatureParams) => checkMiniature(q, buildMiniature(q, CTX)).map((i) => i.code);
const field = (key: string) => MINIATURE.sections.flatMap((s) => s.fields).find((f) => f.key === key) as unknown as { apply: (p: MiniatureParams, v: string) => MiniatureParams; show?: (p: MiniatureParams) => boolean };
const inMaterial = (p: GenPart, u: number, v: number) => pointInContour([u, v], p.outer) && !p.holes.some((h) => pointInContour([u, v], h));

// the shared-material and slot checks of miniature.test.ts
const T0 = 3;
const holders = (parts: GenPart[], P: V3) => parts.filter((p) => { const [u, v, h] = local(p.place!, P); return h > 0 && h < (p.t ?? T0) && inMaterial(p, u, v); });
function grid(c: Contour, step: number, keep: (u: number, v: number) => boolean) {
  const bb = bboxOf([c]); const out: [number, number][] = [];
  for (let v = bb.y0 + step * 0.37; v < bb.y1; v += step) for (let u = bb.x0 + step * 0.29; u < bb.x1; u += step) if (keep(u, v)) out.push([u, v]);
  return out;
}
/** Every bit of material belongs to exactly one part. */
function overlaps(out: MiniOutput, step = 2.3, max = 20) {
  const bad: string[] = [];
  for (const p of out.parts) for (const [u, v] of grid(p.outer, step, (u, v) => inMaterial(p, u, v))) for (const h of [0.3 * T0, 0.7 * T0]) {
    const n = holders(out.parts, world(p.place!, u, v, h));
    if (n.length !== 1 && bad.length < max) bad.push(`${p.id} (${u.toFixed(1)}, ${v.toFixed(1)}) in ${n.map((q) => q.id).join("+")}`);
  }
  return bad;
}
/** Each rectangular slot is filled by exactly one other part. */
function slotsFilled(out: MiniOutput) {
  const bad: string[] = [];
  // a slot is a rectangle one material thickness across (a clearance hole round a chimney is not)
  const slot = (h: Contour) => { const b = bboxOf([h]); return h.length === 4 && Math.min(b.x1 - b.x0, b.y1 - b.y0) < 1.6 * T0; };
  for (const p of out.parts) for (const hole of p.holes.filter(slot)) {
    const pts = grid(hole, 0.7, (u, v) => pointInContour([u, v], hole) && distToContour([u, v], hole) > 0.4);
    if (!pts.length) continue;
    let filled = 0;
    for (const [u, v] of pts) if (holders(out.parts.filter((q) => q !== p), world(p.place!, u, v, T0 / 2)).length === 1) filled++;
    if (filled !== pts.length && filled > 0) bad.push(`${p.id}: ${filled}/${pts.length}`);
  }
  return bad;
}


describe("miniature upgrades: geometry", () => {
  const CASES: unknown[] = [
    { design: "nook", nook: { scene: "forest" } },
    { design: "nook", nook: { scene: "forest", buildings: 5, mirror: true, battery: false } },
    { design: "nook", nook: { scene: "forest", buildings: 2, light: false, width: 80 } },
    { design: "furniture", furniture: { kind: "rocker", width: 550, depth: 600, height: 1050, scale: "12" } },
    { design: "furniture", furniture: { kind: "rocker", width: 550, depth: 600, height: 1050, scale: "6" } },
    { design: "accessory", accessory: { kind: "bridge", height: 45, width: 50, length: 170 } },
    { design: "accessory", accessory: { kind: "bridge", height: 30, width: 40, length: 90 } },
    { design: "accessory", accessory: { kind: "fairydoor", height: 100, width: 56 } },
    { design: "accessory", accessory: { kind: "fairydoor", height: 50, width: 40 } },
  ];
  it.each(CASES.map((c) => [JSON.stringify(c), c]))("%s: builds, no shared material, slots filled", (_l, raw) => {
    const out = build(raw);
    expect(out.error).toBeUndefined();
    expect(overlaps(out)).toEqual([]);
    expect(slotsFilled(out)).toEqual([]);
  }, 60_000);
});

describe("miniature upgrades: forest book nook", () => {
  it("each tree layer is one piece with the sky and the path cut out, and the layers grow toward the front", () => {
    const out = build({ design: "nook", nook: { scene: "forest", buildings: 4 } });
    const layers = out.parts.filter((p) => /^trees\d$/.test(p.id));
    expect(layers).toHaveLength(4);
    const open = layers.map((p) => p.holes.reduce((s, h) => { const b = bboxOf([h]); return Math.max(s, b.y1 - b.y0); }, 0));
    for (const p of layers) {
      const b = bboxOf([p.outer]);
      // a rail along the top and a strip along the bottom stay solid
      expect(inMaterial(p, (b.x0 + b.x1) / 2, b.y0 + 2)).toBe(true);
      expect(inMaterial(p, (b.x0 + b.x1) / 2, b.y1 - 0.7)).toBe(true);
      // the path: open low down in the middle; the trees: solid low down near the sides
      expect(inMaterial(p, (b.x0 + b.x1) / 2, b.y1 - 4)).toBe(false);
      expect(inMaterial(p, b.x0 + 12, b.y1 - 4)).toBe(true);
    }
    // the clearing at the front is wider than at the back (forced perspective)
    const clear = (p: GenPart) => { const b = bboxOf([p.outer]), v = b.y1 - 8, cx = (b.x0 + b.x1) / 2; let w = 0; while (!inMaterial(p, cx + w, v) && w < 60) w += 0.25; return w; };
    expect(clear(layers[3])).toBeGreaterThan(clear(layers[0]));
    expect(open.every((h) => h > 0)).toBe(true);
    expect(out.stats.find((s) => s.label === "Scene")!.value).toMatch(/Enchanted forest/);
  });

  it("opening shape hides for the forest, and the buildings count is the layers", () => {
    const q = mergeMiniature({ design: "nook", nook: { scene: "forest" } });
    expect(field("nook.opening").show!(q)).toBe(false);
    expect(field("nook.opening").show!(mergeMiniature({ design: "nook" }))).toBe(true);
  });
});

describe("miniature upgrades: rocking chair", () => {
  it("stands on rockers that reach further behind than in front, and keeps the space under the seat open", () => {
    const out = build({ design: "furniture", furniture: { kind: "rocker", width: 550, depth: 600, height: 1050, scale: "12" } });
    const side = out.parts.find((p) => p.id === "end-l")!;
    const b = bboxOf([side.outer]);
    // the chair's own depth is 50 mm; the rockers make the side longer
    expect(b.x1 - b.x0).toBeGreaterThan(50 * 1.5);
    expect(side.holes.some((h) => { const hb = bboxOf([h]); return hb.x1 - hb.x0 > 20 && hb.y1 - hb.y0 > 10; })).toBe(true);
    // the bottom is a curve: the middle is lower than the ends
    const bottomAt = (u: number) => { let v = b.y1; while (v > b.y0 && !inMaterial(side, u, v)) v -= 0.1; return v; };
    expect(bottomAt((b.x0 + b.x1) / 2)).toBeGreaterThan(bottomAt(b.x0 + 2) + 2);
    expect(out.info!.size[2]).toBeCloseTo(1050 / 12, 0);
  });

  it("the plain chair is unchanged by the rocker option", () => {
    const out = build({ design: "furniture", furniture: { kind: "chair" } });
    const side = out.parts.find((p) => p.id === "end-l")!;
    expect(side.holes.every((h) => { const hb = bboxOf([h]); return Math.min(hb.x1 - hb.x0, hb.y1 - hb.y0) <= 3.01; })).toBe(true);
  });
});

describe("miniature upgrades: garden bridge", () => {
  it("every plank sits level with m of rail under its slot, and the rail is taller than the deck", () => {
    const out = build({ design: "accessory", accessory: { kind: "bridge", height: 45, width: 50, length: 170 } });
    const planks = out.parts.filter((p) => /^plank\d+$/.test(p.id));
    expect(planks.length).toBeGreaterThanOrEqual(8);
    // the middle planks sit higher than the end ones
    const z = planks.map((p) => p.place!.z);
    expect(Math.max(...z)).toBeGreaterThan(Math.min(...z) + 10);
    // each plank spans the clear width plus a tab into each rail
    for (const p of planks) { const b = bboxOf([p.outer]); expect(b.x1 - b.x0).toBeCloseTo(50, 1); }
    expect(out.stats.find((s) => s.label === "Deck")!.value).toMatch(/planks/);
  });

  it("a steep bridge is flagged, and both fixes bring its ends under the limit", () => {
    const q = mergeMiniature({ design: "accessory", accessory: { kind: "bridge", height: 80, width: 50, length: 100 } });
    const iss = checkMiniature(q, buildMiniature(q, CTX)).find((i) => i.code === "BRIDGE_STEEP")!;
    expect(iss.level).toBe("warn");
    for (const f of iss.fixes) {
      const r = f.apply(q);
      expect(codes(r), f.id).not.toContain("BRIDGE_STEEP");
      expect(buildMiniature(r, CTX).error).toBeUndefined();
    }
    expect(gardenBridge(3, 170, 50, 45).slope).toBeLessThan(0.58);
  });

  it("picking the bridge or the fairy door starts from sizes that suit it", () => {
    const k = field("accessory.kind");
    const br = k.apply(mergeMiniature({ design: "accessory" }), "bridge");
    expect(br.accessory.length).toBeGreaterThan(br.accessory.height * 2);
    expect(codes(br)).not.toContain("BRIDGE_STEEP");
    expect(k.apply(mergeMiniature({ design: "accessory" }), "fairydoor").accessory.height).toBe(100);
    // other pieces keep their sizes
    expect(k.apply(mergeMiniature({ design: "accessory", accessory: { height: 77 } }), "pine").accessory.height).toBe(77);
  });
});

describe("miniature upgrades: fairy door", () => {
  it("is a back plate, a frame round a door leaf a hair smaller than its opening, hinges, a knob and a step", () => {
    const out = build({ design: "accessory", accessory: { kind: "fairydoor", height: 100, width: 56 } });
    expect(out.parts.map((p) => p.id)).toEqual(["door-back", "door-frame", "door-leaf", "door-hinge-1", "door-hinge-2", "door-knob", "door-step"]);
    const back = out.parts[0], frame = out.parts[1], leaf = out.parts[2];
    const bb = bboxOf([back.outer]), lb = bboxOf([leaf.outer]);
    expect(bb.x1 - bb.x0).toBeCloseTo(56, 1);
    expect(bb.y1 - bb.y0).toBeCloseTo(100, 1);
    // the leaf sits in the frame's opening with a gap: no point of the leaf is in the frame
    for (const [u, v] of leaf.outer.filter((_, i) => i % 3 === 0)) expect(inMaterial(frame, u, v)).toBe(false);
    expect(lb.x1 - lb.x0).toBeLessThan(56 - 2 * 6);
    expect(leaf.holes.length).toBeGreaterThanOrEqual(4);
    expect(leaf.score!.length).toBeGreaterThan(2);
    expect(frame.score!.length).toBeGreaterThan(6);
    expect(field("accessory.base").show!(mergeMiniature({ design: "accessory", accessory: { kind: "fairydoor" } }))).toBe(false);
  });
});
