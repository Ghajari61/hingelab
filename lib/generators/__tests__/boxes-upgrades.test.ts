import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { BOXES } from "../boxes";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { checkBoxes } from "../boxes/check";
import { napkinDrop } from "../boxes/home";
import { mergeBoxes, NAPKIN_SHAPES, type BoxesParams, type NapkinShape } from "../boxes/params";
import { bboxOf, pointInContour } from "../geom";
import { placePoint as world, unplacePoint as local, type V3 } from "../place";
import { PAPERBOX } from "../paperbox";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const issuesOf = (p: BoxesParams) => checkBoxes(p, buildBoxes(p, CTX) as BoxesOutput);
const codes = (raw: unknown) => issuesOf(mergeBoxes(raw)).map((i) => i.code);
const part = (out: BoxesOutput, id: string) => out.parts.find((q) => q.id === id)!;
const T = 3;

const inMaterial = (p: GenPart, u: number, v: number) => pointInContour([u, v], p.outer) && !p.holes.some((h) => pointInContour([u, v], h));
/** Parts whose material holds the world point P (each part as thick as its own `t`). */
const holders = (parts: GenPart[], P: V3) => parts.filter((p) => {
  const [u, v, h] = local(p.place!, P);
  return h > 0 && h < (p.t ?? T) && inMaterial(p, u, v);
});
/** Points of a part's material on a grid, at a quarter and three quarters of its thickness. */
function samples(p: GenPart, step: number): V3[] {
  const bb = bboxOf([p.outer]), out: V3[] = [];
  for (let v = bb.y0 + step * 0.37; v < bb.y1; v += step) for (let u = bb.x0 + step * 0.29; u < bb.x1; u += step) {
    if (!inMaterial(p, u, v)) continue;
    for (const k of [0.25, 0.75]) out.push(world(p.place!, u, v, k * (p.t ?? T)));
  }
  return out;
}
/** Every sampled bit of material is in exactly one part. */
function overlaps(out: BoxesOutput, step = 2.1) {
  const bad: string[] = [];
  for (const p of out.parts) for (const P of samples(p, step)) {
    const n = holders(out.parts, P).length;
    if (n !== 1) bad.push(`${p.id} (${P.map((x) => x.toFixed(1)).join(", ")}) in ${n} parts`);
  }
  return bad;
}
const centre = (c: Contour): [number, number] => { const b = bboxOf([c]); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };
const size = (c: Contour) => { const b = bboxOf([c]); return [b.x1 - b.x0, b.y1 - b.y0]; };

describe("Napkin holder", () => {
  it("stands two plates in the base: tabs as thick as the sheet fill the slots, nothing overlaps", () => {
    for (const shape of Object.keys(NAPKIN_SHAPES) as NapkinShape[]) {
      const out = build({ design: "napkin", napkin: { shape } });
      expect(out.error, shape).toBeUndefined();
      expect(out.parts.map((q) => q.id).sort()).toEqual(["back", "base", "front"]);
      const base = part(out, "base");
      expect(base.holes.length).toBe(4);
      for (const slot of base.holes) {
        const [w, d] = size(slot);
        expect(d).toBeCloseTo(T, 6);
        expect(w).toBeGreaterThanOrEqual(15);
        const [u, v] = centre(slot);
        // the middle of every slot is filled by exactly one plate's tab
        const P = world(base.place!, u, v, T / 2);
        expect(holders(out.parts.filter((q) => q !== base), P).map((q) => q.id).length, shape).toBe(1);
      }
      expect(overlaps(out), shape).toEqual([]);
    }
  });

  it("shapes the top edge: a grip dip is lowest in the middle, an arch highest, a wave rises twice", () => {
    const dip = napkinDrop("dip", 190, 110), arch = napkinDrop("arch", 190, 110), wave = napkinDrop("wave", 190, 110);
    expect(dip(95)).toBeGreaterThan(30);
    expect(dip(5)).toBe(0);
    expect(arch(95)).toBeCloseTo(0);
    expect(arch(0)).toBeGreaterThan(30);
    expect(wave(0)).toBeCloseTo(0);
    expect(wave(95)).toBeCloseTo(0);
    expect(wave(47.5)).toBeGreaterThan(10);
    expect(napkinDrop("rounded", 190, 110)(95)).toBe(0);
    const out = build({ design: "napkin", napkin: { shape: "dip" } });
    const plate = part(out, "front").outer;
    const topAt = (x: number) => Math.min(...plate.filter(([u]) => Math.abs(u - x) < 2).map(([, v]) => v));
    expect(topAt(95)).toBeGreaterThan(Math.min(...plate.map(([, v]) => v)) + 20);
  });

  it("engraves the front plate below its dip and warns before tall plates tip, with a fix", () => {
    const out = build({ design: "napkin", engrave: { text: "Napkins", fontId: "pacifico", size: 14 } });
    const art = part(out, "front").engrave!;
    expect(art.length).toBeGreaterThan(0);
    expect(bboxOf(art).y0).toBeGreaterThan(napkinDrop("dip", 190, 110)(95));
    expect(part(out, "back").engrave ?? []).toEqual([]);
    const tall = { design: "napkin", napkin: { height: 220, gap: 20, margin: 6 } };
    expect(codes(tall)).toContain("NAPKIN_TIPS");
    const fixed = autoFixAll(mergeBoxes(tall), issuesOf).params;
    expect(fixed.napkin.margin).toBeGreaterThan(6);
    expect(issuesOf(fixed).map((i) => i.code)).not.toContain("NAPKIN_TIPS");
  });

  it("takes the cut-out pattern on the plates, clear of the tabs", () => {
    const out = build({ design: "napkin", pierce: { pattern: "lattice", on: "walls", cell: 14, bar: 3 } });
    expect(part(out, "front").holes.length).toBeGreaterThan(10);
    expect(part(out, "back").holes.length).toBeGreaterThan(10);
    expect(part(out, "base").holes.length).toBe(4);
  });
});

describe("Tissue box cover", () => {
  it("is a box turned over: walls and a top with the opening, open underneath, every bit in one part", () => {
    for (const opening of ["slot", "oval", "round"] as const) {
      const out = build({ design: "tissue", tissue: { opening, openL: opening === "round" ? 70 : 140 } });
      expect(out.error, opening).toBeUndefined();
      expect(out.parts.map((q) => q.id).sort()).toEqual(["back", "front", "left", "right", "top"]);
      const top = part(out, "top");
      expect(top.holes.length).toBe(1);
      expect(top.place!.z).toBeCloseTo(out.info!.size[2] - T);
      expect(overlaps(out, 2.6), opening).toEqual([]);
      // nothing at the bottom: a point just above z = 0 inside the walls is empty, the wall corners are wood
      const [W, D] = out.info!.size;
      expect(holders(out.parts, [W / 2, D / 2, 0.5] as V3)).toEqual([]);
      expect(holders(out.parts, [1, D / 2, 0.5] as V3).length + holders(out.parts, [W / 2, 1, 0.5] as V3).length).toBeGreaterThan(0);
    }
  });

  it("fits the tissue box measured inside and keeps wood round the opening", () => {
    const out = build({ design: "tissue" });
    expect(out.info!.size).toEqual([256, 136, 98]);
    const [w, h] = size(part(out, "top").holes[0]);
    expect(w).toBeCloseTo(140, 0);
    expect(h).toBeCloseTo(36, 0);
    const wide = { design: "tissue", tissue: { openL: 300, openW: 200 } };
    expect(codes(wide)).toContain("TISSUE_OPENING");
    const fixed = autoFixAll(mergeBoxes(wide), issuesOf).params;
    expect(fixed.tissue.openL).toBeLessThan(300);
    expect(issuesOf(fixed).filter((i) => i.level !== "info")).toEqual([]);
  });

  it("engraves the front wall", () => {
    const out = build({ design: "tissue", engrave: { text: "Tissues", fontId: "pacifico", size: 18 } });
    expect(part(out, "front").engrave!.length).toBeGreaterThan(0);
    expect(part(out, "top").engrave ?? []).toEqual([]);
  });
});

describe("Hand holes", () => {
  it("cuts one hole in each end wall, below the top and clear of the bottom's fingers", () => {
    for (const lid of ["open", "closed", "liftoff", "sliding", "inset"] as const) {
      const out = build({ design: "box", box: { width: 300, depth: 200, height: 120, lid, handles: true } });
      for (const id of ["left", "right"]) {
        const w = part(out, id);
        expect(w.holes.length, `${lid} ${id}`).toBe(1);
        const b = bboxOf(w.holes), wb = bboxOf([w.outer]);
        expect(b.y0, lid).toBeGreaterThanOrEqual(2 * T);
        expect(b.y1, lid).toBeLessThanOrEqual(wb.y1 - T - 6 + 1e-6);
        expect(b.x1 - b.x0).toBeCloseTo(90, 0);
      }
      expect(part(out, "front").holes.length, lid).toBe(0);
      expect(overlaps(out, 4), lid).toEqual([]);
    }
    expect(build({ design: "box", box: { lid: "pin", handles: true, depth: 120 } }).parts.find((q) => q.id === "left")!.holes.length).toBe(1);
  });

  it("keeps a tray's dividers below the holes", () => {
    const out = build({ design: "tray", tray: { cols: 3, rows: 2, height: 80, dividers: 100, handles: true } });
    const hole = bboxOf(part(out, "left").holes);
    const H = out.info!.size[2];
    const dividers = out.parts.filter((q) => q.id.startsWith("div"));
    expect(dividers.length).toBe(3);
    // upright parts hang from their top edge at z = -y; the hole's lowest point is at z = H - its bottom
    for (const d of dividers) expect(-d.place!.y!, d.id).toBeLessThanOrEqual(H - hole.y1 + 1e-6);
  });

  it("warns when the walls are too low and fixes it by raising them", () => {
    const low = { design: "box", box: { height: 25, lid: "open", handles: true } };
    expect(build(low).parts.find((q) => q.id === "left")!.holes.length).toBe(0);
    expect(codes(low)).toContain("HANDLE_ROOM");
    const fixed = autoFixAll(mergeBoxes(low), issuesOf).params;
    expect(fixed.box.height).toBeGreaterThan(25);
    expect(build(fixed).parts.find((q) => q.id === "left")!.holes.length).toBe(1);
    expect(issuesOf(fixed).filter((i) => i.level !== "info")).toEqual([]);
    const shallow = { design: "box", box: { depth: 50, height: 100, lid: "open", handles: true } };
    expect(codes(shallow)).toContain("HANDLE_ROOM");
    expect(autoFixAll(mergeBoxes(shallow), issuesOf).params.box.handles).toBe(false);
  });
});

describe("Clear lids", () => {
  const ARTLESS = { text: "", motif: "none", border: 0 };

  it("cuts a window in the lid with a pane of the second material glued under it, larger by the glue lap", () => {
    for (const lid of ["closed", "liftoff", "pin", "inset"] as const) {
      const out = build({ design: "box", box: { width: 180, depth: 130, height: 60, lid, glass: "window", window: 70, paneT: 2 }, engrave: ARTLESS });
      const face = part(out, lid === "closed" ? "top" : "lid");
      const pane = part(out, "pane");
      const win = face.holes.find((h) => h.length > 4) ?? face.holes[face.holes.length - 1];
      const [ww, wh] = size(win), [pw, ph] = size(pane.outer);
      expect(pw - ww, lid).toBeCloseTo(12, 6);
      expect(ph - wh, lid).toBeCloseTo(12, 6);
      expect(pane.material).toBe("second");
      expect(pane.t).toBe(2);
      // the pane sits right under the lid, centred on the window
      expect(pane.place!.z! + 2).toBeCloseTo(face.place!.z!, 6);
      const [wx, wy] = centre(win);
      const Pw = world(face.place!, wx, wy, 0), Pp = world(pane.place!, pw / 2, ph / 2, 0);
      expect(Pp[0]).toBeCloseTo(Pw[0], 6);
      expect(Pp[1]).toBeCloseTo(Pw[1], 6);
      expect(out.materials?.second).toMatch(/acrylic/i);
      expect(overlaps(out, 3.1), lid).toEqual([]);
    }
  });

  it("frames a lift-off lid's lip round the pane and moves the lid's engraving to the front wall", () => {
    const out = build({ design: "box", box: { width: 160, depth: 110, height: 70, lid: "liftoff", glass: "window" }, engrave: { text: "Memories", fontId: "pacifico", size: 14, motif: "none", border: 0 } });
    const lip = part(out, "lip"), pane = part(out, "pane");
    expect(lip.holes.length).toBe(1);
    expect(size(lip.holes[0])[0]).toBeGreaterThan(size(pane.outer)[0]);
    expect(part(out, "lid").engrave ?? []).toEqual([]);
    expect(part(out, "front").engrave!.length).toBeGreaterThan(0);
    expect((out.assembly ?? []).join(" ")).toMatch(/front wall/);
  });

  it("cuts a sliding, lift-off or inset lid whole from clear acrylic as thick as the wood", () => {
    for (const lid of ["sliding", "liftoff", "inset"] as const) {
      const out = build({ design: "box", box: { lid, glass: "clear" } });
      const l = part(out, "lid");
      expect(l.material, lid).toBe("second");
      expect(l.t).toBe(T);
      expect(out.parts.filter((q) => q.material === "second").length).toBe(1);
      expect(codes({ design: "box", box: { lid, glass: "clear" } })).not.toContain("GLASS_LID");
    }
  });

  it("flags glass a lid cannot take and a lid too small for a window, with fixes that clear them", () => {
    for (const raw of [
      { design: "box", box: { lid: "closed", glass: "clear" } },
      { design: "box", box: { lid: "sliding", glass: "window" } },
      { design: "box", box: { lid: "liftoff", glass: "window", width: 30, depth: 30, height: 30 } },
    ]) {
      const cs = codes(raw);
      expect(cs.some((c) => c === "GLASS_LID" || c === "WINDOW_SMALL"), JSON.stringify(raw)).toBe(true);
      const fixed = autoFixAll(mergeBoxes(raw), issuesOf).params;
      expect(issuesOf(fixed).filter((i) => i.level !== "info").map((i) => i.code), JSON.stringify(raw)).toEqual([]);
    }
    expect(autoFixAll(mergeBoxes({ design: "box", box: { lid: "sliding", glass: "window" } }), issuesOf).params.box.glass).toBe("clear");
  });

  it("leaves boxes without the new options exactly as before", () => {
    const a = build({ design: "box", box: { lid: "liftoff" } }), b = build({ design: "box", box: { lid: "liftoff", glass: "none", handles: false } });
    expect(b.parts).toEqual(a.parts);
    expect(mergeBoxes({ box: { glass: "frosted", window: 500, paneT: -1 } }).box).toMatchObject({ glass: "none", window: 95, paneT: 0.5 });
  });
});

describe("New Boxes presets", () => {
  const NEW = ["napkin-cafe", "napkin-floral", "napkin-cocktail", "tissue-cover", "tissue-cube", "tissue-engraved", "storage-crate", "serving-tray", "caddy-tray", "memory-window-box", "display-case", "clear-wine-box",
    "packaging-window-gift-box", "packaging-chocolate-display", "packaging-clear-soap-box", "packaging-gift-crate"];
  it("build without errors or warnings, and the old packaging ids open them", () => {
    for (const id of NEW) {
      const pr = BOXES.presets.find((x) => x.id === id);
      expect(pr, id).toBeDefined();
      const p = BOXES.merge(pr!.params), out = BOXES.build(p, CTX);
      expect(out.error, id).toBeUndefined();
      expect(BOXES.check!(p, out).filter((i) => i.level !== "info").map((i) => i.code), id).toEqual([]);
    }
    for (const id of ["window-gift-box", "gift-crate"]) expect(PAPERBOX.presets.some((x) => x.id === `packaging-${id}`)).toBe(true);
  }, 120000);

  it("has rail pictures for the new designs", () => {
    for (const v of ["napkin", "tissue"]) expect(BOXES.art!("design", v).length, v).toBeGreaterThan(0);
  });
});
