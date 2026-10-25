import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { bboxOf, TAU } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import { POPUP } from "../popup";
import type { PopupOutput } from "../popup/build";
import { mergePopup } from "../popup/params";
import type { Contour, GenPart, Pt } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => POPUP.build(mergePopup(raw), CTX) as PopupOutput;
const arms = (out: PopupOutput) => out.parts.filter((p) => /^arm\d+$/.test(p.id));
const sheet = (out: PopupOutput) => out.parts[0];
const centreOf = (c: Contour): Pt => { let x = 0, y = 0; for (const q of c) { x += q[0]; y += q[1]; } return [x / c.length, y / c.length]; };
const pointIn = (p: Pt, c: Contour) => {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, yi] = c[i], [xj, yj] = c[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/** Whether any two non-adjacent edges of a closed outline cross. */
function selfCrosses(c: Contour): boolean {
  const n = c.length;
  const cross = (a: Pt, b: Pt, p: Pt, q: Pt) => {
    const d = (b[0] - a[0]) * (q[1] - p[1]) - (b[1] - a[1]) * (q[0] - p[0]);
    if (Math.abs(d) < 1e-12) return false;
    const t = ((p[0] - a[0]) * (q[1] - p[1]) - (p[1] - a[1]) * (q[0] - p[0])) / d;
    const u = ((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / d;
    return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
  };
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    if (cross(c[i], c[(i + 1) % n], c[j], c[(j + 1) % n])) return true;
  }
  return false;
}

/** The top of an arm's outline at x (y is down, so the smallest y the outline reaches there). */
function topAt(c: Contour, x: number): number {
  let top = Infinity;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [x1, y1] = c[j], [x2, y2] = c[i];
    if ((x1 <= x && x <= x2) || (x2 <= x && x <= x1)) {
      const y = Math.abs(x2 - x1) < 1e-12 ? Math.min(y1, y2) : y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
      top = Math.min(top, y);
    }
  }
  return top;
}

describe("pop-up", () => {
  it("builds the default bowl: a sheet, four arms, no problems", () => {
    const out = build({});
    expect(out.error).toBeUndefined();
    expect(arms(out)).toHaveLength(4);
    expect(POPUP.check(mergePopup({}), out).filter((i) => i.level !== "info")).toEqual([]);
    expect(POPUP.pro!(mergePopup({}), out)).toBeNull();
  });

  it("closes every outline and never crosses itself, for every outline shape", () => {
    for (const kind of ["circle", "ellipse", "rounded", "polygon", "star", "heart", "flower", "leaf", "pumpkin", "snowflake"]) {
      const out = build({ shape: { kind }, cut: { rings: 6 } });
      expect(out.error, kind).toBeUndefined();
      for (const p of out.parts) {
        expect(p.outer.length, `${kind} ${p.id}`).toBeGreaterThanOrEqual(3);
        expect(selfCrosses(p.id === "sheet" ? p.outer.filter((_, i) => i % 4 === 0) : p.outer), `${kind} ${p.id}`).toBe(false);
        for (const h of p.holes) expect(h.length, `${kind} ${p.id} hole`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("spaces round rings evenly between the centre and the rim", () => {
    const out = build({ shape: { kind: "circle", size: 240 }, cut: { rings: 9, centre: 70 } });
    expect(out.info!.n).toBe(9);
    expect(out.info!.minBand).toBeCloseTo((120 - 35) / 9, 1);
    expect(out.info!.centreR).toBeCloseTo(35, 1);
  });

  it("breaks every ring at the bridges, and leaves whole rings without them", () => {
    const held = build({ cut: { rings: 7 }, support: { arms: 4, hold: true } });
    const free = build({ cut: { rings: 7 }, support: { arms: 4, hold: false } });
    expect(sheet(held).cuts).toHaveLength(7 * 4);
    expect(sheet(free).cuts).toHaveLength(7);
    // A whole ring is a closed loop.
    for (const c of sheet(free).cuts!) { const a = c[0], b = c[c.length - 1]; expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9); }
  });

  it("cuts the arm slots as wide as the material plus the clearance (the shell adds the kerf)", () => {
    const out = build({ T: 4, support: { fit: 0.15, turn: 0 } });
    const slots = sheet(out).holes.filter((h) => h.length === 4);
    expect(slots.length).toBeGreaterThan(0);
    for (const s of slots) {
      const b = bboxOf([s]);
      // Arms at 0°, 90°, 180°, 270°: each slot is long along its arm and 4.15 mm across it.
      expect(Math.min(b.x1 - b.x0, b.y1 - b.y0)).toBeCloseTo(4.15, 6);
    }
  });

  it("puts every arm's tab under its ring's slot, at that ring's height", () => {
    for (const raw of [{}, { mode: "tower" }, { mode: "tiered", form: { profile: "stepped", tiers: 3 } }, { shape: { kind: "star" }, cut: { rings: 6 } }, { shape: { kind: "flower" }, cut: { rings: 6, edge: "wave" } }]) {
      const p = mergePopup(raw);
      const out = POPUP.build(p, CTX) as PopupOutput;
      const views = sheet(out).views3d!;
      arms(out).forEach((arm, i) => {
        const a = (p.support.turn * Math.PI) / 180 + (TAU * i) / p.support.arms;
        const slots = sheet(out).holes.filter((h) => {
          if (h.length !== 4) return false;
          const [x, y] = centreOf(h);
          return Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - a), Math.cos(Math.atan2(y, x) - a))) < 1e-6;
        });
        expect(slots.length, JSON.stringify(raw)).toBeGreaterThan(0);
        for (const s of slots) {
          const c = centreOf(s), r = Math.hypot(c[0], c[1]);
          const view = views.find((v) => pointIn(c, v.outer) && !v.holes.some((h) => h !== s && h.length > 4 && pointIn(c, h)));
          expect(view, `${JSON.stringify(raw)} slot at ${r}`).toBeTruthy();
          // The tab's top is flush with the ring's top face.
          expect(-topAt(arm.outer, r), `${JSON.stringify(raw)} arm ${i + 1} at ${r.toFixed(1)}`).toBeCloseTo(view!.place.z + p.T, 1);
        }
      });
    }
  });

  it("steps a spiral bowl's arms up steadily from the centre to the rim", () => {
    const p = mergePopup({ cut: { pattern: "spiral", rings: 7 }, form: { profile: "straight", depth: 70 } });
    const out = POPUP.build(p, CTX) as PopupOutput;
    for (const [i, arm] of arms(out).entries()) {
      const a = (p.support.turn * Math.PI) / 180 + (TAU * i) / p.support.arms;
      const tops = sheet(out).holes.filter((h) => h.length === 4).map(centreOf)
        .filter(([x, y]) => Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - a), Math.cos(Math.atan2(y, x) - a))) < 1e-6)
        .map(([x, y]) => Math.hypot(x, y)).sort((u, v) => u - v).map((r) => -topAt(arm.outer, r));
      expect(tops.length).toBeGreaterThan(4);
      for (let k = 1; k < tops.length; k++) expect(tops[k]).toBeGreaterThan(tops[k - 1]);
      // Seven rings make six turns, which climb the whole depth.
      expect(tops[2] - tops[1]).toBeCloseTo(70 / 6, 1);
    }
  });

  it("works out the scroll saw's tilt from the drop per ring and the blade", () => {
    const out = build({ T: 19, mode: "bowl", cut: { rings: 6 }, form: { depth: 60, profile: "straight" }, support: { kind: "saw", blade: 0.5, base: 0 } });
    expect(out.info!.meanDrop).toBeCloseTo(10, 6);
    expect(out.info!.tilt).toBeCloseTo((Math.atan(0.5 / 10) * 180) / Math.PI, 6);
    expect(arms(out)).toHaveLength(0);
    // One start hole for each ring, no bridges.
    expect(sheet(out).holes.filter((h) => bboxOf([h]).x1 - bboxOf([h]).x0 < 2)).toHaveLength(6);
    expect(sheet(out).cuts).toHaveLength(6);
  });

  it("flags rings that drop too far to wedge on a scroll saw", () => {
    const p = mergePopup({ T: 6, cut: { rings: 6 }, form: { depth: 60 }, support: { kind: "saw" } });
    const issues = POPUP.check(p, POPUP.build(p, CTX));
    const drop = issues.find((i) => i.code === "SAW_DROP")!;
    expect(drop.level).toBe("error");
    const fixed = drop.fixes[0].apply(p);
    expect(POPUP.check(fixed, POPUP.build(fixed, CTX)).some((i) => i.code === "SAW_DROP")).toBe(false);
  });

  it("lays a set of smaller sizes side by side in 3D without overlapping", () => {
    const out = build({ extras: { sizes: 3, step: 80 } });
    const sheets = out.parts.filter((p) => p.id.startsWith("sheet"));
    expect(sheets.map((s) => s.id)).toEqual(["sheet", "sheet-size 2", "sheet-size 3"]);
    const w = sheets.map((s) => bboxOf([s.outer]).x1 - bboxOf([s.outer]).x0);
    expect(w[1] / w[0]).toBeCloseTo(0.8, 2);
    expect(w[2] / w[0]).toBeCloseTo(0.64, 2);
    const span = (s: GenPart) => { const dx = s.views3d![0].place.m![3]; const b = bboxOf([s.outer]); return [b.x0 + dx, b.x1 + dx]; };
    const [a, b, c] = sheets.map(span);
    expect(b[0]).toBeGreaterThan(a[1]);
    expect(c[0]).toBeGreaterThan(b[1]);
  });

  it("cuts a spiral that winds steadily outward", () => {
    const out = build({ cut: { pattern: "spiral", rings: 6, starts: 1 }, support: { hold: false } });
    const cuts = sheet(out).cuts!;
    expect(cuts).toHaveLength(1);
    const r = cuts[0].map(([x, y]) => Math.hypot(x, y));
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1] - 1e-9);
    expect(build({ cut: { pattern: "spiral", rings: 6, starts: 3 }, support: { hold: false } }).parts[0].cuts).toHaveLength(3);
  });

  it("gives a sleeve a centre hole the object's size plus the clearance", () => {
    const out = build({ mode: "sleeve", shape: { size: 220 }, cut: { style: "round" }, extras: { object: 80, clear: 4 } });
    const hole = sheet(out).holes.reduce((a, h) => (h.length > a.length ? h : a));
    const b = bboxOf([hole]);
    expect(b.x1 - b.x0).toBeCloseTo(84, 1);
  });

  it("keeps a tealight hole clear of the arms' tabs", () => {
    const out = build({ cut: { centre: 70 }, extras: { tealight: true } });
    const slots = sheet(out).holes.filter((h) => h.length === 4);
    for (const s of slots) for (const [x, y] of s) expect(Math.hypot(x, y)).toBeGreaterThan(20);
  });

  it("makes a stepped profile into flat levels, the first round the centre", () => {
    const out = build({ mode: "tiered", cut: { rings: 10 }, form: { profile: "stepped", tiers: 2, depth: 100 } });
    const z = [...new Set(sheet(out).views3d!.map((v) => Math.round(v.place.z * 1000) / 1000))].sort((a, b) => a - b);
    expect(z).toHaveLength(2);
    expect(z[1] - z[0]).toBeCloseTo(100, 6);
  });

  it("opens from flat to the full form on the 3D slider", () => {
    const out = build({});
    expect(out.fold?.label).toBe("Open");
    for (const v of sheet(out).views3d!) {
      expect(v.frames).toHaveLength(2);
      expect(v.frames![1][11]).toBeCloseTo(v.place.z, 9);
    }
  });

  it("needs Pro for the Pro options only", () => {
    const out = build({});
    const pro = (raw: unknown) => POPUP.pro!(mergePopup(raw), out);
    expect(pro({ shape: { kind: "rounded" }, form: { profile: "straight" } })).toBeNull();
    expect(pro({ cut: { pattern: "spiral" } })).toMatch(/spiral.*Pro/);
    expect(pro({ shape: { kind: "star" } })).toMatch(/star outline/);
    expect(pro({ engrave: { text: "Hi" } })).toMatch(/engraving/);
    expect(pro({ support: { kind: "cords" } })).toMatch(/cords/);
  });

  it("offers fewer rings when they are too narrow, and the fix clears the check", () => {
    const p = mergePopup({ shape: { size: 200 }, cut: { rings: 30, centre: 40 } });
    const issue = POPUP.check(p, POPUP.build(p, CTX)).find((i) => i.code === "RINGS_NARROW")!;
    expect(issue).toBeTruthy();
    const fixed = issue.fixes.find((f) => f.id === "fewer")!.apply(p);
    expect(fixed.cut.rings).toBeLessThan(30);
    expect(POPUP.check(fixed, POPUP.build(fixed, CTX)).some((i) => i.code === "RINGS_NARROW")).toBe(false);
  });

  it("keeps counts whole and in range whatever a save holds", () => {
    const p = mergePopup({ cut: { rings: 1e6, starts: 9.6 }, support: { arms: 1, cords: 100 }, extras: { sizes: -3 } });
    expect(p.cut.rings).toBe(40);
    expect(p.cut.starts).toBe(4);
    expect(p.support.arms).toBe(3);
    expect(p.support.cords).toBe(8);
    expect(p.extras.sizes).toBe(1);
  });

  it("every preset's cut file stays the same", () => {
    const digests: Record<string, string> = {};
    for (const pr of POPUP.presets) {
      const p = POPUP.merge(pr.params);
      const a = arrangeGenerator(POPUP, p, CTX);
      const svg = genSVG(POPUP, p, a.lay!);
      digests[pr.id] = `${createHash("sha256").update(svg).digest("hex").slice(0, 16)} ${Math.round(svg.length / 1024)} kB`;
    }
    expect(digests).toMatchSnapshot();
  });
});
