import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { BOXES } from "../boxes";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { checkBoxes } from "../boxes/check";
import { fingerCount, ownedSpans } from "../boxes/joints";
import { mergeBoxes, type BoxesParams } from "../boxes/params";
import { bboxOf, distToContour, pointInContour } from "../geom";
import { placePoint as world, unplacePoint as local, type V3 } from "../place";
import { arrangeGenerator, genSVG } from "../output";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const issuesOf = (p: BoxesParams) => checkBoxes(p, buildBoxes(p, CTX) as BoxesOutput);
const codes = (raw: unknown) => issuesOf(mergeBoxes(raw)).map((i) => i.code);
const D2R = Math.PI / 180;


const inMaterial = (p: GenPart, u: number, v: number) => pointInContour([u, v], p.outer) && !p.holes.some((h) => pointInContour([u, v], h));
const T0 = 3;
const holders = (parts: GenPart[], P: V3, T = T0) => parts.filter((p) => {
  const [u, v, h] = local(p.place!, P);
  return h > 0 && h < (p.t ?? T) && inMaterial(p, u, v);
});

/** Points of a region of a part's plane, on a grid, at two depths in the part. */
function grid(c: Contour, step: number, keep: (u: number, v: number) => boolean) {
  const bb = bboxOf([c]);
  const out: [number, number][] = [];
  for (let v = bb.y0 + step * 0.37; v < bb.y1; v += step) for (let u = bb.x0 + step * 0.29; u < bb.x1; u += step) if (keep(u, v)) out.push([u, v]);
  return out;
}

/** Every bit of material belongs to exactly one part. */
function overlaps(out: BoxesOutput, step = 2.3) {
  const bad: string[] = [];
  for (const p of out.parts) for (const [u, v] of grid(p.outer, step, (u, v) => inMaterial(p, u, v))) {
    for (const h of [0.25 * T0, 0.75 * T0]) {
      const n = holders(out.parts, world(p.place!, u, v, h)).length;
      if (n !== 1) bad.push(`${p.id} (${u.toFixed(1)}, ${v.toFixed(1)}) in ${n} parts`);
    }
  }
  return bad;
}

/** A point in one of a part's holes (entrances, vents), which a wall is meant to leave open. */
const inHole = (parts: GenPart[], P: V3) => parts.some((p) => {
  const [u, v, h] = local(p.place!, P);
  return h > 0 && h < (p.t ?? T0) && pointInContour([u, v], p.outer) && p.holes.some((c) => pointInContour([u, v], c));
});

/** Points of the walls of an outside W × D × H box (faces listed) are all filled exactly once. */
function shellGaps(parts: GenPart[], W: number, D: number, H: number, faces: string[], step = 1.3) {
  const bad: string[] = [];
  const at = (P: V3, what: string) => {
    const n = holders(parts, P).length;
    if (n !== 1 && !(n === 0 && inHole(parts, P))) bad.push(`${what} (${P.map((q) => q.toFixed(1)).join(", ")}) in ${n} parts`);
  };
  const ds = [0.3 * T0, 0.7 * T0];
  for (let a = step * 0.31; a < W; a += step) for (let b = step * 0.43; b < H; b += step) for (const d of ds) {
    if (faces.includes("front")) at([a, d, b], "front");
    if (faces.includes("back")) at([a, D - d, b], "back");
  }
  for (let a = step * 0.31; a < D; a += step) for (let b = step * 0.43; b < H; b += step) for (const d of ds) {
    if (faces.includes("left")) at([d, a, b], "left");
    if (faces.includes("right")) at([W - d, a, b], "right");
  }
  for (let a = step * 0.31; a < W; a += step) for (let b = step * 0.43; b < D; b += step) for (const d of ds) {
    if (faces.includes("bottom")) at([a, b, d], "bottom");
    if (faces.includes("top")) at([a, b, H - d], "top");
  }
  return bad;
}

/** Each mortise (rectangular hole) is filled by exactly one other part (sampled 0.4 mm inside its edge). */
function mortisesFilled(out: BoxesOutput, ids: string[]) {
  const bad: string[] = [];
  for (const p of out.parts.filter((q) => ids.includes(q.id))) for (const hole of p.holes.filter((h) => h.length === 4)) {
    const pts = grid(hole, 0.7, (u, v) => pointInContour([u, v], hole) && distToContour([u, v], hole) > 0.4);
    if (!pts.length) continue;
    let filled = 0;
    for (const [u, v] of pts) {
      const n = holders(out.parts.filter((q) => q !== p), world(p.place!, u, v, T0 / 2)).length;
      if (n === 1) filled++;
    }
    if (filled !== pts.length) bad.push(`${p.id}: ${filled}/${pts.length} filled`);
  }
  return bad;
}

describe("finger joints", () => {
  it("splits every edge into an odd number of fingers close to the target width", () => {
    for (const [L, f] of [[100, 10], [114, 10], [66, 10], [30, 10], [12, 10], [200, 7]]) {
      const n = fingerCount(L, f);
      expect(n % 2, `${L}/${f}`).toBe(1);
      expect(Math.abs(L / n - f), `${L}/${f}`).toBeLessThanOrEqual(f);
    }
  });

  it("the two panels of an edge own complementary fingers", () => {
    const L = 114, f = 10;
    const a = ownedSpans(L, f, { mate: true, ends: true }, 3), b = ownedSpans(L, f, { mate: true, ends: false }, 3);
    const all = [...a, ...b].sort((x, y) => x[0] - y[0]);
    expect(all[0][0]).toBeCloseTo(3);
    expect(all.at(-1)![1]).toBeCloseTo(3 + L);
    for (let i = 1; i < all.length; i++) expect(all[i][0]).toBeCloseTo(all[i - 1][1]);
    expect(a.length).toBe(b.length + 1);
  });
});

describe("Boxes in 3D", () => {
  it("a closed box is a solid shell: every wall point is in exactly one panel", () => {
    const out = build({});
    const [W, D, H] = out.info!.size;
    expect(shellGaps(out.parts, W, D, H, ["front", "back", "left", "right", "bottom", "top"])).toEqual([]);
    expect(overlaps(out, 1.6)).toEqual([]);
  });

  it("open and lift-off boxes, odd sizes and outside sizes still close up", () => {
    for (const raw of [
      { box: { lid: "open", width: 73, depth: 151, height: 37 } },
      { box: { lid: "liftoff" } },
      { joint: { outside: true, finger: 7 }, box: { width: 90, depth: 90, height: 90 } },
      { T: 6, joint: { finger: 15 }, box: { width: 200, depth: 140, height: 110 } },
    ]) {
      const p = mergeBoxes(raw);
      const out = buildBoxes(p, CTX) as BoxesOutput;
      const [W, D, H] = out.info!.size;
      const faces = ["front", "back", "left", "right", "bottom", ...(p.box.lid === "closed" ? ["top"] : [])];
      const parts = out.parts.map((q) => ({ ...q, t: p.T }));
      const T = p.T;
      const n = (P: V3) => holders(parts, P, T).length;
      // Thickness-aware spot checks, then the full shell at 3 mm.
      expect(n([W / 2, T / 2, H / 2]), JSON.stringify(raw)).toBe(1);
      expect(n([T / 2, T / 2, T / 2]), JSON.stringify(raw)).toBe(1);
      expect(n([W / 2, D / 2, H / 2]), JSON.stringify(raw)).toBe(0);
      if (T === T0) expect(shellGaps(parts, W, D, H, faces), JSON.stringify(raw)).toEqual([]);
    }
  });

  it("measures inside sizes by default and outside sizes when asked", () => {
    expect(build({}).info!.size).toEqual([126, 86, 66]);
    expect(build({ joint: { outside: true } }).info!.size).toEqual([120, 80, 60]);
    expect(build({ box: { lid: "open" } }).info!.size).toEqual([126, 86, 63]);
    expect(build({}).stats.find((s) => s.label === "Inside")!.value).toBe("120 × 80 × 60 mm");
  });

  it("a lift-off lid's lip fits inside the walls with the clearance", () => {
    const out = build({ box: { lid: "liftoff", clearance: 0.3 } });
    const lip = out.parts.find((p) => p.id === "lip")!;
    const bb = bboxOf([lip.outer]);
    expect(bb.x1 - bb.x0).toBeCloseTo(120 - 0.6);
    expect(bb.y1 - bb.y0).toBeCloseTo(80 - 0.6);
    expect(overlaps(out)).toEqual([]);
  });

  it("tray dividers half-lap through each other and fill the tray without overlaps", () => {
    const out = build({ design: "tray" });
    const [W, D, H] = out.info!.size;
    expect(shellGaps(out.parts, W, D, H, ["front", "back", "left", "right", "bottom"], 2)).toEqual([]);
    expect(overlaps(out)).toEqual([]);
    // A point in the crossing of two dividers is in exactly one of them, high or low.
    const t = mergeBoxes({ design: "tray" }).tray, T = 3;
    const cx = (W - 2 * T - 2 * T) / 3, cy = (D - 2 * T - T) / 2;
    const hd = (H - T) * t.dividers / 100;
    for (const z of [T + hd * 0.2, T + hd * 0.8]) {
      const hit = holders(out.parts, [T + cx + T / 2, T + cy + T / 2, z]);
      expect(hit.length).toBe(1);
      expect(hit[0].id).toBe(z < T + hd / 2 ? "divy1" : "divx1");
    }
  });

  it("a bird house's roof sits on the gables and the panels never overlap", () => {
    for (const pitch of [25, 40, 45, 55]) {
      const p = mergeBoxes({ design: "bird", bird: { pitch } });
      const out = buildBoxes(p, CTX) as BoxesOutput;
      const W = 126, H = 153, g = (W / 2) * Math.tan(pitch * D2R);
      expect(overlaps(out), `pitch ${pitch}`).toEqual([]);
      // Just under each roof's underside, halfway down the slope, is the back gable (y = 0).
      for (const id of ["roof-l", "roof-r"]) {
        const r = out.parts.find((q) => q.id === id)!;
        const bb = bboxOf([r.outer]);
        // The long panel runs back to front, so the front is at the far end of its width.
        const u = id === "roof-l" ? 20 + 1.5 : bb.x1 - 20 - 1.5;
        const P = world(r.place!, u, (bb.y1 - bb.y0) * 0.5, -0.3);
        expect(P[2], `${id} ${pitch}`).toBeLessThan(H + g);
        expect(holders(out.parts, P).map((q) => q.id), `${id} ${pitch}`).toEqual(["back"]);
      }
      expect(shellGaps(out.parts, W, 126, H, ["front", "back", "left", "right", "bottom"], 2)).toEqual([]);
    }
  });

  it("the tabs of the sign, frame stand, phone stand and key hooks fill their slots", () => {
    expect(mortisesFilled(build({ design: "sign" }), ["base"])).toEqual([]);
    // The frame stands in its slot (whose ends are left clear by the frame's rounded corners).
    const fr = build({ design: "frame" });
    const base = fr.parts.find((p) => p.id === "base")!;
    const slot = bboxOf(base.holes);
    const mid = world(base.place!, (slot.x0 + slot.x1) / 2, (slot.y0 + slot.y1) / 2, T0 / 2);
    expect(holders(fr.parts, mid).map((p) => p.id)).toEqual(["middle"]);
    expect(mortisesFilled(build({ design: "stand" }), ["side-l", "side-r"])).toEqual([]);
    expect(mortisesFilled(build({ design: "stand", stand: { angle: 50, width: 120, height: 150, slot: 10 } }), ["side-l", "side-r"])).toEqual([]);
    expect(mortisesFilled(build({ design: "keys" }), ["plate"])).toEqual([]);
    for (const design of ["sign", "frame", "stand", "keys"]) expect(overlaps(build({ design })), design).toEqual([]);
  });

  it("fronts face the viewer (larger y in the 3D view)", () => {
    const y = (out: BoxesOutput, id: string, u: number, v: number, h = T0 / 2) => world(out.parts.find((p) => p.id === id)!.place!, u, v, h)[1];
    const bird = build({ design: "bird" });
    expect(y(bird, "front", 63, 60)).toBeGreaterThan(y(bird, "back", 63, 60));
    const stand = build({ design: "stand" });
    const side = bboxOf([stand.parts[0].outer]);
    expect(y(stand, "side-l", 1, side.y1 - 1)).toBeGreaterThan(y(stand, "side-l", side.x1 - 1, side.y1 - 1));
    const keys = build({ design: "keys" });
    expect(y(keys, "hook1", 30, 20)).toBeGreaterThan(T0);
    const frame = build({ design: "frame" });
    expect(y(frame, "front", 5, 5)).toBeGreaterThan(y(frame, "back", 5, 5));
  });

  it("every preset builds without overlapping parts", () => {
    for (const pr of BOXES.presets) expect(overlaps(build(pr.params), 3), pr.id).toEqual([]);
  });
});

describe("Boxes checks", () => {
  it("every preset is free of warnings and errors", () => {
    for (const pr of BOXES.presets) {
      const p = BOXES.merge(pr.params);
      expect(issuesOf(p).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("flags thin and too few fingers, with fixes that clear them", () => {
    expect(codes({ joint: { finger: 3 } })).toContain("FINGER_SMALL");
    expect(codes({ joint: { finger: 30 }, box: { height: 40 } })).toContain("FEW_FINGERS");
    for (const raw of [{ joint: { finger: 3 } }, { joint: { finger: 30 }, box: { height: 40 } }]) {
      const fixed = autoFixAll(mergeBoxes(raw), issuesOf).params;
      expect(issuesOf(fixed).filter((i) => i.level !== "info"), JSON.stringify(raw)).toEqual([]);
    }
  });

  it("flags small compartments, wide text, close hooks, a thin phone slot, a big entrance and a loose photo", () => {
    const cases: [unknown, string][] = [
      [{ design: "tray", tray: { width: 100, cols: 6 } }, "SMALL_COMPARTMENTS"],
      [{ design: "sign", sign: { text: "Welcome to our home", size: 30 } }, "TEXT_WIDE"],
      [{ design: "keys", keys: { hooks: 9 } }, "HOOK_SPACING"],
      [{ design: "stand", stand: { slot: 7 } }, "PHONE_SLOT"],
      [{ design: "bird", bird: { width: 90, hole: 80 } }, "BIRD_HOLE"],
      [{ design: "frame", frame: { overlap: 1 } }, "FRAME_OVERLAP"],
      [{ design: "frame", frame: { border: 8, overlap: 4 } }, "FRAME_BORDER"],
    ];
    for (const [raw, code] of cases) {
      const p = mergeBoxes(raw);
      expect(issuesOf(p).map((i) => i.code), code).toContain(code);
      const fixed = autoFixAll(p, issuesOf).params;
      expect(issuesOf(fixed).filter((i) => i.level !== "info").map((i) => i.code), code).toEqual([]);
    }
  });

  it("reports missing glyphs and offers a font that has them", () => {
    const p = mergeBoxes({ design: "sign", sign: { text: "سلام", fontId: "fredoka" } });
    const is = issuesOf(p).find((i) => i.code === "MISSING_GLYPHS");
    expect(is?.level).toBe("error");
    expect(is!.fixes[0].apply(p).sign.fontId).toBe("vazirmatn");
  });
});

describe("Boxes output", () => {
  it("names files after the design", () => {
    expect(BOXES.fileName(BOXES.defaults())).toBe("finger-joint-box-126x86x66mm");
    expect(BOXES.fileName(mergeBoxes({ design: "bird", name: "Bird house" }))).toBe("birdhouse-bird-house-32mm");
  });

  it("the default box's SVG matches the golden file", async () => {
    const p = BOXES.defaults();
    const svg = genSVG(BOXES, p, arrangeGenerator(BOXES, p, CTX).lay!);
    expect(svg).not.toMatch(/NaN|Infinity/);
    await expect(svg).toMatchFileSnapshot("./golden/boxes-default.svg");
  });
});
