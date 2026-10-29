import { describe, expect, it } from "vitest";
import { buildMiniature, type MiniOutput } from "../miniature/build";
import { FURNITURE_REAL, mergeMiniature, type FurnitureKind } from "../miniature/params";
import { MINIATURE } from "../miniature";
import { checkMiniature } from "../miniature/check";
import { MINIATURE_PRESETS } from "../miniature/presets";
import { TRADITIONS } from "../miniature/traditions";
import { bboxOf, distToContour, pointInContour } from "../geom";
import { placePoint as world, unplacePoint as local, type V3 } from "../place";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const T0 = 3;
const build = (raw: unknown) => buildMiniature(mergeMiniature(raw), CTX) as MiniOutput;
const inMaterial = (p: GenPart, u: number, v: number) => pointInContour([u, v], p.outer) && !p.holes.some((h) => pointInContour([u, v], h));
const holders = (parts: GenPart[], P: V3) => parts.filter((p) => { const [u, v, h] = local(p.place!, P); return h > 0 && h < (p.t ?? T0) && inMaterial(p, u, v); });
function grid(c: Contour, step: number, keep: (u: number, v: number) => boolean) {
  const bb = bboxOf([c]); const out: [number, number][] = [];
  for (let v = bb.y0 + step * 0.37; v < bb.y1; v += step) for (let u = bb.x0 + step * 0.29; u < bb.x1; u += step) if (keep(u, v)) out.push([u, v]);
  return out;
}
/** Every bit of material belongs to exactly one part. */
export function overlaps(out: MiniOutput, step = 2.3, max = 20) {
  const bad: string[] = [];
  for (const p of out.parts) for (const [u, v] of grid(p.outer, step, (u, v) => inMaterial(p, u, v))) for (const h of [0.3 * T0, 0.7 * T0]) {
    const n = holders(out.parts, world(p.place!, u, v, h));
    if (n.length !== 1 && bad.length < max) bad.push(`${p.id} (${u.toFixed(1)}, ${v.toFixed(1)}) in ${n.map((q) => q.id).join("+")}`);
  }
  return bad;
}
/** Each rectangular slot is filled by exactly one other part. */
export function slotsFilled(out: MiniOutput) {
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

/** Params with a house theme applied, as the Theme field does. */
const theme = (v: string, raw: unknown = {}) => {
  const f = MINIATURE.sections.flatMap((x) => x.fields).find((x) => x.key === "house.theme") as unknown as { apply: (p: unknown, v: string) => unknown };
  return f.apply(mergeMiniature(raw), v);
};

describe("miniature geometry", () => {
  const CASES: unknown[] = [
    {},
    { house: { roof: "flat", tower: true, floors: 1, front: "panel" } },
    { house: { roof: "shed", rooms: 3, floors: 3 } },
    { house: { roof: "gambrel" } },
    { house: { roof: "hip", front: "panel", panes: "lattice" } },
    { house: { roof: "mansard", floors: 3, opening: "pointed" } },
    { design: "nook" },
    { design: "nook", nook: { scene: "arches", mirror: true } },
    ...["chair", "table", "bed", "bookshelf", "cabinet", "desk", "dresser", "bench"].map((kind) => ({ design: "furniture", furniture: { kind } })),
    ...["sofa", "armchair", "wardrobe", "nightstand", "fireplace", "counter"].map((kind) => ({ design: "furniture", furniture: { kind, ...FURNITURE_REAL[kind as FurnitureKind] } })),
    ...["tree", "pine", "bush", "lamp", "fence", "planter"].flatMap((kind) => [true, false].map((base) => ({ design: "accessory", accessory: { kind, base, height: kind === "fence" ? 30 : kind === "planter" ? 25 : 90, width: kind === "lamp" ? 14 : kind === "planter" ? 30 : 50, length: 90 } }))),
    theme("rural"), theme("urban"), theme("rural", { house: { floors: 1, roof: "hip" } }), theme("urban", { house: { roof: "flat", parapet: 12 } }),
    ...["gable", "shed", "gambrel", "hip", "mansard", "flat"].map((roof) => ({ house: { roof, chimney: true } })),
    { house: { front: "panel", balcony: "full", floors: 3, porch: "canopy", rail: "lattice", door: "glazed", step: true } },
    { house: { front: "panel", balcony: "centre", floors: 2, porch: "veranda", rail: "solid", door: "panelled", shopfront: true } },
    ...["picket", "rail", "lattice", "wall"].map((fence) => ({ house: { grounds: "garden", fence, yard: 90, yardSides: 30, trees: 4, treeKind: fence === "wall" ? "pine" : "bush", front: "panel", porch: "canopy", door: "planked" } })),
    { house: { grounds: "street", yard: 50, lamps: 4, trees: 2, front: "panel", shopfront: true, door: "glazed" } },
  ];
  it.each(CASES.map((c) => [JSON.stringify(c), c]))("%s: builds, no shared material, slots filled", (_l, raw) => {
    const out = build(raw);
    expect(out.error).toBeUndefined();
    expect(overlaps(out)).toEqual([]);
    expect(slotsFilled(out)).toEqual([]);
  }, 60_000);
});

describe("miniature presets", () => {
  it.each(MINIATURE_PRESETS.map((pr) => [pr.id, pr] as const))("%s builds without warnings or overlaps", (id, pr) => {
    const p = mergeMiniature(pr.params);
    const out = buildMiniature(p, CTX);
    expect(out.error, id).toBeUndefined();
    const warns = checkMiniature(p, out).filter((i) => i.level !== "info");
    expect(warns.map((w) => w.code), id).toEqual([]);
    expect(overlaps(out as MiniOutput, 4, 4), id).toEqual([]);
  }, 60000);
  it("traditions are marked unverified and carry a kit", () => {
    for (const t of TRADITIONS) { expect(t.verification).toBe("unverified"); expect(t.kit.roof).toBeTruthy(); }
  });
});
