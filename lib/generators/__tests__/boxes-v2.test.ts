import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { BOXES } from "../boxes";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { checkBoxes } from "../boxes/check";
import { pinGeometry } from "../boxes/more";
import { BOXES_VERSION, migrateBoxes, mergeBoxes, type BoxesParams } from "../boxes/params";
import { bboxOf, pointInContour } from "../geom";
import { placePoint as world, unplacePoint as local, type V3 } from "../place";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const T0 = 3;
const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const issuesOf = (p: BoxesParams) => checkBoxes(p, buildBoxes(p, CTX) as BoxesOutput);
const codes = (raw: unknown) => issuesOf(mergeBoxes(raw)).map((i) => i.code);
const inMaterial = (p: GenPart, u: number, v: number) => pointInContour([u, v], p.outer) && !p.holes.some((h) => pointInContour([u, v], h));
const holders = (parts: GenPart[], P: V3) => parts.filter((p) => {
  const [u, v, h] = local(p.place!, P);
  return h > 0 && h < (p.t ?? T0) && inMaterial(p, u, v);
});

/** Every bit of material belongs to exactly one part (sampled on a grid in each part). */
function overlaps(out: BoxesOutput, step = 1.7) {
  const bad: string[] = [];
  for (const p of out.parts) {
    const bb = bboxOf([p.outer]);
    for (let v = bb.y0 + step * 0.37; v < bb.y1; v += step) for (let u = bb.x0 + step * 0.29; u < bb.x1; u += step) {
      if (!inMaterial(p, u, v)) continue;
      for (const h of [0.25 * T0, 0.75 * T0]) {
        const n = holders(out.parts, world(p.place!, u, v, h)).length;
        if (n !== 1) bad.push(`${p.id} (${u.toFixed(1)}, ${v.toFixed(1)}) in ${n} parts`);
      }
    }
  }
  return bad.slice(0, 8);
}

/** Each rectangular slot (4-point hole) is filled by exactly one other part. */
function slotsFilled(out: BoxesOutput, ids: string[]) {
  const bad: string[] = [];
  for (const p of out.parts.filter((q) => ids.includes(q.id))) for (const hole of p.holes.filter((h) => h.length === 4)) {
    const bb = bboxOf([hole]);
    const c = world(p.place!, (bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, T0 / 2);
    const n = holders(out.parts.filter((q) => q !== p), c).length;
    if (n !== 1) bad.push(`${p.id}: slot at ${bb.x0.toFixed(1)}, ${bb.y0.toFixed(1)} in ${n} parts`);
  }
  return bad;
}

describe("Boxes version 2", () => {
  it("new lids, joint styles and designs never overlap", () => {
    const cases: unknown[] = [
      { box: { lid: "sliding", notch: true } },
      { box: { lid: "pin", notch: true } },
      { box: { lid: "inset" }, engrave: { motif: "heart" } },
      { joint: { style: "tabs" } },
      { joint: { style: "tabs" }, box: { lid: "open" } },
      { joint: { style: "tabs" }, box: { lid: "pin" } },
      { design: "tray", tray: { lid: "sliding" } },
      { design: "tray", tray: { lid: "pin" } },
      { design: "tray", tray: { lid: "inset" } },
      { design: "tray", joint: { style: "tabs" } },
      { design: "drawer" },
      { design: "drawer", drawer: { drawers: 3, pull: "knob" } },
      { design: "hex" },
      { design: "insert" },
      { design: "money" },
      { design: "money", joint: { style: "tabs" } },
      { design: "stack" },
    ];
    for (const raw of cases) expect(overlaps(build(raw)), JSON.stringify(raw)).toEqual([]);
  }, 60_000);

  it("tabs fill their slots", () => {
    expect(slotsFilled(build({ joint: { style: "tabs" } }), ["bottom", "top"])).toEqual([]);
    expect(slotsFilled(build({ design: "money", joint: { style: "tabs" } }), ["bottom", "top"])).toEqual([]);
    expect(slotsFilled(build({ box: { lid: "pin" } }), ["lid"])).toEqual([]);
  });

  it("a hexagon box's tabs go through its bottom", () => {
    const out = build({ design: "hex" });
    const bottom = out.parts.find((p) => p.id === "bottom")!;
    expect(bottom.holes.length).toBe(6);
    expect(build({ design: "hex", hex: { width: 140 } }).parts.find((p) => p.id === "bottom")!.holes.length).toBe(12);
    for (const hole of bottom.holes) {
      const cx = hole.reduce((a, q) => a + q[0], 0) / 4, cy = hole.reduce((a, q) => a + q[1], 0) / 4;
      expect(holders(out.parts.filter((q) => q !== bottom), [cx, cy, T0 / 2]).map((q) => q.id)[0]).toMatch(/^wall/);
    }
  });

  it("the pin hinge's lid swings open without hitting the hinge strip or the back wall", () => {
    const p = mergeBoxes({ box: { lid: "pin" } });
    const out = buildBoxes(p, CTX) as BoxesOutput;
    const T = p.T, g = pinGeometry(T, p.box.pin);
    const H = out.info!.size[2], za = H - T - g.a, ya = g.ya;
    const lid = out.parts.find((q) => q.id === "lid")!, fixed = out.parts.filter((q) => !["lid", "cheek-l", "cheek-r"].includes(q.id));
    const bb = bboxOf([lid.outer]);
    for (let deg = 5; deg <= 90; deg += 5) {
      const a = (deg * Math.PI) / 180;
      for (let v = 0.2; v < Math.min(30, bb.y1); v += 1) for (const h of [0.2, 1.5, 2.8]) for (const u of [bb.x0 + 10, (bb.x0 + bb.x1) / 2]) {
        const [x, y, z] = world(lid.place!, u, v, h);
        // Opening lifts the front: rotate about the pin axis (x along it).
        const dy = y - ya, dz = z - za;
        const P: V3 = [x, ya + dy * Math.cos(a) - dz * Math.sin(a), za + dy * Math.sin(a) + dz * Math.cos(a)];
        expect(holders(fixed, P).map((q) => q.id), `${deg}° at ${v.toFixed(1)}`).toEqual([]);
      }
    }
  });

  it("drawers fit their bays and the front of each is flush with the cabinet", () => {
    const out = build({ design: "drawer", drawer: { drawers: 3 } });
    const [W, D, H] = out.info!.size;
    for (let i = 1; i <= 3; i++) {
      const f = out.parts.find((q) => q.id === `d${i}-front`)!;
      expect(world(f.place!, 1, 1, T0)[1]).toBeCloseTo(D);
    }
    expect(holders(out.parts, [W / 2, D / 2, H - 1.5]).map((q) => q.id)).toEqual(["cab-top"]);
  });

  it("the money box's plug fills its hole and the slot is in the top", () => {
    const out = build({ design: "money" });
    const [W, D] = out.info!.size;
    expect(holders(out.parts, [W / 2, D / 2, 1.5]).map((q) => q.id)).toEqual(["plug"]);
    const top = out.parts.find((q) => q.id === "top")!;
    expect(top.holes.length).toBe(1);
  });

  it("migrates version 1 saves to the same box", () => {
    expect(BOXES.version).toBe(BOXES_VERSION);
    const v1 = { design: "box", box: { width: 100, lid: "liftoff" } };
    const a = build(v1), b = buildBoxes(BOXES.merge(migrateBoxes(v1, 1)), CTX);
    expect(JSON.stringify(b.parts)).toBe(JSON.stringify(a.parts));
    expect(migrateBoxes(v1, 2)).toBe(v1);
    expect(BOXES.merge({ design: "nope", box: { lid: "nope" } }).design).toBe("box");
  });

  it("flags engravings that do not fit, low drawers, a long coin slot, a shallow hinged box and a small hexagon", () => {
    const cases: [unknown, string][] = [
      [{ box: { lid: "sliding" }, engrave: { text: "A very long engraving", size: 30 } }, "LID_ART_WIDE"],
      [{ box: { lid: "liftoff", height: 40 }, engrave: { motif: "heart", motifSize: 120 } }, "LID_ART_TALL"],
      [{ design: "drawer", drawer: { height: 60, drawers: 4 } }, "DRAWER_LOW"],
      [{ design: "money", money: { slot: 90, width: 60 } }, "COIN_SLOT"],
      [{ design: "money", money: { plug: 100 } }, "PLUG_BIG"],
      [{ box: { lid: "pin", depth: 25 } }, "PIN_DEPTH"],
      [{ design: "hex", hex: { width: 40 } }, "HEX_SMALL"],
      [{ design: "insert", insert: { width: 100, cols: 6 } }, "SMALL_COMPARTMENTS"],
    ];
    for (const [raw, code] of cases) {
      const p = mergeBoxes(raw);
      expect(issuesOf(p).map((i) => i.code), code).toContain(code);
      const fixed = autoFixAll(p, issuesOf).params;
      expect(issuesOf(fixed).filter((i) => i.level !== "info").map((i) => i.code), code).toEqual([]);
    }
    expect(codes({ box: { lid: "sliding" }, engrave: { text: "Tea" } })).not.toContain("LID_ART_WIDE");
  });
});
