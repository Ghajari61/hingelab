import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as hb from "harfbuzzjs";
import { describe, expect, it } from "vitest";
import { colSegments, cutWidth, hingeSegments, mergesEdgeCuts } from "@/lib/hinge";
import {
  LETTER_DEFAULTS, Loop, computeLetterModel, concaveRadiusOf, cornerRadiusOf, curvatureZones, exportLetterSVG, facetContour, facetedWall,
  hingeParamsOf, layoutLetters, loadFont, makeShape, pointInShape, signedArea, windowRadius,
} from "@/lib/letters";
import type { Contour, LetterModel, LetterParams, LoadedFont, PanelPart, PlatePart, Point, StripPart, Wall } from "@/lib/letters";

function fixture(file: string, id: string, name: string): LoadedFont {
  const b = readFileSync(join(__dirname, "fonts", file));
  return loadFont(hb, id, name, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
}

const fredoka = fixture("Fredoka-Bold.ttf", "fredoka", "Fredoka Bold");
const vazir = fixture("Vazirmatn-Black.ttf", "vazirmatn", "Vazirmatn Black");
const isPersian = (t: string) => /[\u0600-\u06ff]/u.test(t);

const params = (text: string, extra: Partial<LetterParams> = {}): LetterParams => ({
  ...LETTER_DEFAULTS, text, mode: "box", fontId: isPersian(text) ? "vazirmatn" : "fredoka", ...extra,
});

function boxModel(p: LetterParams): LetterModel {
  const r = computeLetterModel(p, isPersian(p.text) ? vazir : fredoka, hb);
  if ("error" in r) throw new Error(r.error);
  if (!r.box) throw new Error("no box info");
  return r;
}

const TEXTS = ["O", "A", "S", "B", "e", "8", "Sam", "HingeLab", "س", "سام", "ایران", "۱۲۳"];
const LIDS = ["open", "fixed", "removable"] as const;
const CUTS = ["slot", "line"] as const;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The strips cut for one wall: named "<letter> · <contour>" plus a piece number when split. */
const stripsOf = (m: LetterModel, w: Wall) => {
  const re = new RegExp(`^${escapeRe(`${w.letter} · ${w.contour}`)}( \\d+)?$`, "u");
  return m.parts.filter((pt): pt is StripPart => pt.kind === "strip" && re.test(pt.name));
};

function distToPolyline(q: Point, c: Contour) {
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy));
  }
  return best;
}

const centroid = (c: Contour): Point => [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];

/** True when two segments properly cross or touch away from shared endpoints. */
function segsCross(a: Point, b: Point, c: Point, d: Point) {
  const o = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** No two non-adjacent edges of the contours intersect (sweep over x). */
function simplePolygons(cs: Contour[]) {
  const segs: { a: Point; b: Point; c: number; i: number; n: number; x0: number; x1: number }[] = [];
  cs.forEach((c, ci) => c.forEach((a, i) => {
    const b = c[(i + 1) % c.length];
    segs.push({ a, b, c: ci, i, n: c.length, x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]) });
  }));
  segs.sort((m, n) => m.x0 - n.x0);
  const active: typeof segs = [];
  for (const s of segs) {
    for (let k = active.length - 1; k >= 0; k--) if (active[k].x1 < s.x0) active.splice(k, 1);
    for (const t of active) {
      if (t.c === s.c && (Math.abs(t.i - s.i) <= 1 || Math.abs(t.i - s.i) === s.n - 1)) continue;
      if (segsCross(s.a, s.b, t.a, t.b)) return false;
    }
    active.push(s);
  }
  return true;
}

/**
 * Connected pieces of a strip: the outline filled, minus every hinge cut at its real width,
 * rasterised at 12 px/mm. Returns the pixel count of each component, largest first.
 */
function stripComponents(pt: StripPart, p: LetterParams): number[] {
  const PX = 12;
  const hp = hingeParamsOf(p);
  const hs = hingeSegments(pt.hBody, p.slit, p.bridge);
  const w = cutWidth(hp);
  const cuts: { x: number; y1: number; y2: number }[] = [];
  for (const c of pt.cols) for (const [y1, y2] of colSegments(c.kind, hs, pt.hBody, p.bridge)) {
    if ((y1 < 0 || y2 > pt.hBody) && mergesEdgeCuts(hp)) continue;
    cuts.push({ x: c.x, y1, y2 });
  }
  const o = pt.outline, { x0, y0, x1, y1 } = pt.bbox;
  const W = Math.ceil((x1 - x0) * PX) + 2, H = Math.ceil((y1 - y0) * PX) + 2;
  type Run = { a: number; b: number; id: number };
  const parent: number[] = [];
  const find = (i: number): number => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const size: number[] = [];
  let prev: Run[] = [];
  for (let r = 0; r < H; r++) {
    const y = y0 + (r + 0.5) / PX - 1 / PX;
    const xs: number[] = [];
    for (let i = 0; i < o.length; i++) {
      const A = o[i], B = o[(i + 1) % o.length];
      if ((A[1] > y) !== (B[1] > y)) xs.push(A[0] + ((y - A[1]) * (B[0] - A[0])) / (B[1] - A[1]));
    }
    xs.sort((m, n) => m - n);
    let spans: [number, number][] = [];
    for (let i = 0; i + 1 < xs.length; i += 2) spans.push([xs[i], xs[i + 1]]);
    for (const c of cuts) {
      let hw: number;
      if (y >= c.y1 && y <= c.y2) hw = w / 2;
      else { const dy = y < c.y1 ? c.y1 - y : y - c.y2; if (dy >= w / 2) continue; hw = Math.sqrt((w / 2) ** 2 - dy * dy); }
      const ca = c.x - hw, cb = c.x + hw;
      spans = spans.flatMap(([a, b]): [number, number][] => (cb <= a || ca >= b ? [[a, b]] : [...(ca > a ? [[a, ca] as [number, number]] : []), ...(cb < b ? [[cb, b] as [number, number]] : [])]));
    }
    const runs: Run[] = [];
    for (const [a, b] of spans) {
      const pa = Math.ceil((a - x0) * PX - 0.5), pb = Math.floor((b - x0) * PX - 0.5);
      if (pb < pa) continue;
      const id = parent.length;
      parent.push(id);
      size.push(pb - pa + 1);
      runs.push({ a: pa, b: pb, id });
    }
    let k = 0;
    for (const run of runs) {
      while (k < prev.length && prev[k].b < run.a) k++;
      for (let j = k; j < prev.length && prev[j].a <= run.b; j++) {
        const ra = find(run.id), rb = find(prev[j].id);
        if (ra !== rb) { parent[ra] = rb; size[rb] += size[ra]; }
      }
    }
    prev = runs;
  }
  const comps: number[] = [];
  parent.forEach((_, i) => { if (find(i) === i) comps.push(size[i]); });
  return comps.sort((m, n) => n - m);
}

const circumradius = (a: Point, b: Point, c: Point) => {
  const A = Math.hypot(b[0] - c[0], b[1] - c[1]), B = Math.hypot(a[0] - c[0], a[1] - c[1]), C = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  return area2 > 0 ? (A * B * C) / (2 * area2) : Infinity;
};

/**
 * Smallest radius of a circle through three outline vertices about SPAN mm apart (the vertex,
 * and the first vertices at least SPAN before and after it). Vertices lie on the true curve, but
 * where a Clipper arc meets a glyph curve the polygon has a kink of a few hundredths of a degree
 * (about 5 µm); over a short span that reads as a radius a few percent too small. 5 mm keeps the
 * reading within 0.05 mm, and a short tight arc still reads tight.
 */
function minVertexRadius(c: Contour, SPAN = 5) {
  const n = c.length;
  const seg = c.map((q, i) => Math.hypot(c[(i + 1) % n][0] - q[0], c[(i + 1) % n][1] - q[1]));
  const best = { convex: Infinity, concave: Infinity };
  if (seg.reduce((s, l) => s + l, 0) < 4 * SPAN) return best;
  for (let i = 0; i < n; i++) {
    let j = i, back = 0;
    while (back < SPAN) { j = (j - 1 + n) % n; back += seg[j]; }
    let k = i, fwd = 0;
    while (fwd < SPAN) { fwd += seg[k]; k = (k + 1) % n; }
    const a = c[j], b = c[i], d = c[k];
    // material is on the left of outers and holes alike, so a left turn is a convex corner
    const cross = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
    const key = cross > 0 ? "convex" : "concave";
    best[key] = Math.min(best[key], circumradius(a, b, d));
  }
  return best;
}

/** A rounded rectangle flattened like a glyph curve (chord error 0.02 mm). */
function roundedRect(w: number, h: number, r: number): Contour {
  const pts: Contour = [];
  const step = 2 * Math.acos(1 - 0.02 / r);
  const n = Math.max(1, Math.ceil(Math.PI / 2 / step));
  for (const [cx, cy, a0] of [[w - r, r, -90], [w - r, h - r, 0], [r, h - r, 90], [r, r, 180]] as const) {
    for (let i = 0; i <= n; i++) { const a = ((a0 + (90 * i) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return pts;
}

describe("curvature", () => {
  it("reads a flattened arc within 4 % of its radius, never above it", () => {
    for (const R of [5, 12, 30]) {
      const loop = new Loop(roundedRect(200, 150, R));
      let lo = Infinity;
      for (let s = 0; s < loop.length; s += 0.25) lo = Math.min(lo, windowRadius(loop, s));
      expect(lo).toBeGreaterThan(0.96 * R);
      expect(lo).toBeLessThanOrEqual(R + 1e-6);
    }
  });

  it("a rounded rectangle has four flats and four curves", () => {
    const zones = curvatureZones(new Loop(roundedRect(200, 150, 12)), 16);
    expect(zones.filter(z => z.kind === "flat").length).toBe(4);
    expect(zones.filter(z => z.kind === "curve").length).toBe(4);
    for (const z of zones.filter(z => z.kind === "curve")) expect(z.s1 - z.s0).toBeGreaterThan((Math.PI / 2) * 12 - 1);
  });
});

describe("letter box (living-hinge walls, corners rounded): tests 1-7", () => {
  for (const text of TEXTS) for (const lid of LIDS) for (const cutStyle of CUTS) {
    it(`${text} · ${lid} lid · ${cutStyle}`, () => {
      const p = params(text, { lid, cutStyle, corners: "round" });
      const m = boxModel(p);
      const box = m.box!;
      const f = 1 + p.stretch / 100;
      const a = p.tabW;
      expect(box.walls.length).toBeGreaterThanOrEqual(1);

      for (const w of box.walls) {
        if (w.style === "faceted") {
          // a counter too small to bend around: flat panels, one per side
          expect(w.contour).toMatch(/^hole/);
          expect(w.pieceLengths.length).toBe(w.centerline.length);
          continue;
        }
        // 1. every contour produces at least one strip
        const strips = stripsOf(m, w);
        expect(strips.length, `${w.letter} · ${w.contour}`).toBe(w.pieceLengths.length);
        expect(strips.length).toBeGreaterThanOrEqual(1);

        // 2. strip lengths = centerline length with curve zones shortened by the stretch
        const expected = w.zones.reduce((s, z) => s + (z.s1 - z.s0) / (z.kind === "curve" ? f : 1), 0);
        expect(Math.abs(w.zones.reduce((s, z) => s + z.s1 - z.s0, 0) - w.length)).toBeLessThan(1e-6);
        expect(Math.abs(strips.reduce((s, st) => s + st.w, 0) - expected)).toBeLessThan(1e-6);

        // 3. tabs = slots, slot centres on the centerline
        expect(strips.reduce((s, st) => s + st.tabs.length, 0)).toBe(w.slots.length);
        expect(w.tabs.length).toBe(w.slots.length);
        for (const sl of w.slots) expect(distToPolyline(centroid(sl), w.centerline)).toBeLessThan(1e-6);

        // 4. no hinge column within 1.5 mm of a tab, no tab in a curve zone
        for (const st of strips) for (const c of st.cols) for (const t of st.tabs) {
          expect(Math.abs(c.x - t) - a / 2).toBeGreaterThanOrEqual(1.5 - 1e-6);
        }
        const curves = w.zones.filter(z => z.kind === "curve");
        for (const t of w.tabs) for (const z of curves) expect(t + a / 2 <= z.s0 + 1e-6 || t - a / 2 >= z.s1 - 1e-6).toBe(true);

        // 6. every strip stays in one piece
        for (const st of strips) {
          const comps = stripComponents(st, p);
          expect(comps.length).toBeGreaterThanOrEqual(1);
          expect(comps.slice(1).every(n => n < 0.05 * 144), `${st.name}: ${comps.slice(0, 4).join(", ")}`).toBe(true);
        }
      }

      // 5. the rounded letters have no convex radius below the corner radius and no concave
      //    radius below the concave radius (counters with flat panels are polygons)
      const r = cornerRadiusOf(p), rc = concaveRadiusOf(p);
      const panelHoles = box.walls.filter(w => w.style === "faceted").map(w => w.centerline);
      for (const s of box.filleted) for (const c of [s.outer, ...s.holes]) {
        if (c !== s.outer && panelHoles.some(ph => pointInShape(centroid(ph), makeShape(c, [])))) continue;
        const m = minVertexRadius(c);
        expect(m.convex).toBeGreaterThanOrEqual(r - 0.05);
        expect(m.concave).toBeGreaterThanOrEqual(rc - 0.05);
      }

      // 7. plates are simple, holes inside the outer contour, slots inside the material
      const plates = m.parts.filter((pt): pt is PlatePart => pt.kind === "plate");
      expect(plates.filter(pt => pt.name.endsWith("· base") || / · base \d+$/.test(pt.name)).length).toBeGreaterThanOrEqual(1);
      for (const pt of plates) {
        expect(signedArea(pt.outer)).toBeGreaterThan(0);
        expect(simplePolygons([pt.outer, ...pt.holes])).toBe(true);
        const shape = makeShape(pt.outer, pt.holes);
        for (const h of pt.holes) expect(h.every(q => pointInShape(q, makeShape(pt.outer, [])))).toBe(true);
        for (const sl of pt.slots) expect(sl.every(q => pointInShape(q, shape))).toBe(true);
      }
      expect(plates.some(pt => pt.name.includes("lid"))).toBe(lid !== "open");
    });
  }
});

describe("letter box (flat-panel walls)", () => {
  for (const text of TEXTS) for (const lid of LIDS) {
    it(`${text} · ${lid} lid`, () => {
      const p = params(text, { lid, wallStyle: "faceted" });
      const m = boxModel(p);
      const box = m.box!;
      const panels = m.parts.filter((pt): pt is PanelPart => pt.kind === "panel");
      expect(box.walls.length).toBeGreaterThanOrEqual(1);
      expect(panels.length).toBe(box.walls.reduce((s, w) => s + w.joints.length, 0));
      expect(panels.reduce((s, pt) => s + pt.tabs.length, 0)).toBe(box.walls.reduce((s, w) => s + w.slots.length, 0));
      for (const w of box.walls) {
        expect(w.tabs.length).toBe(w.slots.length);
        for (const sl of w.slots) expect(distToPolyline(centroid(sl), w.centerline)).toBeLessThan(1e-6);
        expect(w.centerline.length).toBeGreaterThanOrEqual(3);
      }
      for (const pt of panels) {
        expect(pt.w).toBeGreaterThan(0);
        expect(simplePolygons([pt.outline])).toBe(true);
        expect(pt.outline.flat().every(Number.isFinite)).toBe(true);
      }
      const plates = m.parts.filter((pt): pt is PlatePart => pt.kind === "plate");
      for (const pt of plates) {
        expect(simplePolygons([pt.outer, ...pt.holes])).toBe(true);
        const shape = makeShape(pt.outer, pt.holes);
        for (const sl of pt.slots) expect(sl.every(q => pointInShape(q, shape))).toBe(true);
      }
    });
  }

  for (const wallStyle of ["faceted", "hinge"] as const) it(`base rim moves the slots in from the plate edge (${wallStyle})`, () => {
    const edgeGap = (pt: PlatePart) => Math.min(...pt.slots.flatMap(sl => sl.map(q => Math.min(...[pt.outer, ...pt.holes].map(c => distToPolyline(q, c))))));
    const platesOf = (rim: number) => boxModel(params("A", { wallStyle, lid: "fixed", baseRim: rim })).parts.filter((pt): pt is PlatePart => pt.kind === "plate");
    const flush = platesOf(0), rimmed = platesOf(4);
    expect(rimmed.map(pt => pt.slots.length)).toEqual(flush.map(pt => pt.slots.length));
    expect(Math.min(...flush.map(edgeGap))).toBeLessThan(0.5);
    for (const pt of rimmed) {
      expect(pt.slots.length).toBeGreaterThan(0);
      expect(edgeGap(pt), pt.name).toBeGreaterThanOrEqual(4 - 0.05);
      expect(simplePolygons([pt.outer, ...pt.holes])).toBe(true);
    }
  });

  const wallOf = (c: Contour, extra: Partial<LetterParams> = {}) =>
    facetedWall(facetContour(c, 1, 15), { letter: "T", contour: "outer", p: params("T", { wallStyle: "faceted", ...extra }), hBody: 54, topTabs: false, panelNo: 1 });

  it("a rectangle becomes four panels with finger joints", () => {
    const fw = wallOf([[0, 0], [100, 0], [100, 60], [0, 60]]);
    expect(fw.parts.length).toBe(4);
    expect(fw.wall.joints.every(j => j.kind === "finger" && Math.abs(Math.abs(j.turn) - 90) < 1e-9)).toBe(true);
    // fingers reach T/2 past the corner on alternate bands: every panel is its side ± T/2
    const T = LETTER_DEFAULTS.T;
    expect(fw.parts.map(pt => Math.round(pt.w * 1000) / 1000)).toEqual([100 + T, 60 + T, 100 + T, 60 + T]);
    expect(fw.parts.reduce((s, pt) => s + pt.tabs.length, 0)).toBe(fw.wall.slots.length);
    expect(fw.marks.map(m => m.text)).toEqual(["T1", "T2", "T3", "T4"]);
    for (const m of fw.marks) expect(pointInShape([m.x, m.y], makeShape([[0, 0], [100, 0], [100, 60], [0, 60]], []))).toBe(true);
  });

  it("a hexagon gets butt joints, shortened so the inner faces meet", () => {
    const hex: Contour = Array.from({ length: 6 }, (_, i) => [50 + 40 * Math.cos((i * Math.PI) / 3), 50 + 40 * Math.sin((i * Math.PI) / 3)] as Point);
    const fw = wallOf(hex);
    expect(fw.parts.length).toBe(6);
    expect(fw.wall.joints.every(j => j.kind === "butt")).toBe(true);
    const T = LETTER_DEFAULTS.T, e = (T / 2) * Math.tan(Math.PI / 6);
    for (const pt of fw.parts) expect(pt.w).toBeCloseTo(40 - 2 * e, 6);
  });

  it("a flattened circle becomes panels no shorter than the shortest panel", () => {
    const circle: Contour = Array.from({ length: 360 }, (_, i) => [60 * Math.cos((i * Math.PI) / 180), 60 * Math.sin((i * Math.PI) / 180)] as Point);
    const q = facetContour(circle, 1, 15);
    for (let i = 0; i < q.length; i++) expect(Math.hypot(q[(i + 1) % q.length][0] - q[i][0], q[(i + 1) % q.length][1] - q[i][1])).toBeGreaterThanOrEqual(15 - 1e-9);
    // merging panels shorter than the minimum stretches the tolerance a little: chords up to about 24 mm
    // on R 60 sag 1.2 mm
    for (const v of circle) expect(distToPolyline(v, q)).toBeLessThanOrEqual(1.5);
  });
});

describe("letter box counters (living-hinge walls, corners rounded)", () => {
  const rounded = (text: string) => params(text, { corners: "round" });
  const holesOf = (m: LetterModel) => m.box!.filleted.reduce((n, s) => n + s.holes.length, 0);

  it("counters wide enough for the concave radius keep a hinge wall", () => {
    for (const text of ["6", "9", "ه", "م", "و"]) {
      const m = boxModel(rounded(text));
      expect(holesOf(m), text).toBe(1);
      expect(m.box!.walls.filter(w => w.contour.startsWith("hole")).every(w => w.style === "hinge"), text).toBe(true);
    }
  });

  it("the stroke between a counter and the outline stays, so the letter keeps its shape", () => {
    const p = { ...rounded("A"), fontId: "vazirmatn", size: 100 };
    const solid = computeLetterModel({ ...p, mode: "solid" }, vazir, hb);
    const box = computeLetterModel(p, vazir, hb);
    if ("error" in solid || "error" in box) throw new Error("model error");
    const area = (s: { area: number }[]) => s.reduce((a, x) => a + x.area, 0);
    const outline = box.box!.filleted.map(s => makeShape(s.outer, []));
    // R 11.7 corners on a 100 mm letter round off about a fifth; rounding it as one solid lost 45 %
    expect(area(outline)).toBeGreaterThan(0.75 * area(solid.shapes.map(s => makeShape(s.outer, []))));
    // an "A" is symmetric: the rounded outline's centroid stays on the glyph's axis
    const { x0, x1 } = solid.shapes[0].bbox;
    const c = centroid(box.box!.filleted[0].outer);
    expect(Math.abs(c[0] - (x0 + x1) / 2)).toBeLessThan(1);
  });

  // A: the counter is too small; e: the bar is too thin to keep and the eye too small to bend around
  for (const text of ["A", "e"]) it(`${text}: a counter too small to bend around gets flat panels and stays a hole in the base`, () => {
    const m = boxModel(rounded(text));
    const panelWalls = m.box!.walls.filter(w => w.style === "faceted");
    expect(panelWalls.length).toBe(1);
    expect(panelWalls[0].contour).toBe("hole 1");
    const panels = m.parts.filter((pt): pt is PanelPart => pt.kind === "panel");
    expect(panels.length).toBe(panelWalls[0].pieceLengths.length);
    // seams and panels never share an engraved number
    const seamNames = m.parts.filter((pt): pt is StripPart => pt.kind === "strip").flatMap(st => st.marks.map(mk => mk.text));
    expect(seamNames.length).toBeGreaterThan(0);
    for (const pt of panels) expect(seamNames).not.toContain(pt.name);
    const base = m.parts.find((pt): pt is PlatePart => pt.kind === "plate" && pt.name === `${text} · base`)!;
    expect(base.holes.length).toBe(1);
    expect(m.box!.letters[0].panels).toBe(panels.length);
    expect(m.issues.some(i => i.lvl === "info" && i.msg.includes("flat panels"))).toBe(true);
  });
});

describe("letter box (living-hinge walls, corners kept)", () => {
  const bebasFile = readFileSync(join(process.cwd(), "public/fonts/BebasNeue-Regular.ttf"));
  const bebas = loadFont(hb, "bebas-neue", "Bebas Neue", bebasFile.buffer.slice(bebasFile.byteOffset, bebasFile.byteOffset + bebasFile.byteLength) as ArrayBuffer);
  /** Vertex turns over 168° are folds: the path doubles back on itself. */
  const folds = (c: Contour) => c.filter((b, i) => {
    const a = c[(i - 1 + c.length) % c.length], d = c[(i + 1) % c.length];
    let t = Math.atan2(d[1] - b[1], d[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]);
    while (t > Math.PI) t -= 2 * Math.PI;
    while (t < -Math.PI) t += 2 * Math.PI;
    return Math.abs(t) > (168 * Math.PI) / 180;
  }).length;

  it("is the default for living-hinge walls", () => {
    expect(LETTER_DEFAULTS.corners).toBe("joint");
    expect(boxModel(params("L")).box!.walls[0].joints.length).toBeGreaterThan(0);
  });

  for (const text of ["L", "A", "S", "B", "e", "8", "Sam", "HingeLab", "سام", "۱۲۳"]) for (const lid of ["open", "removable"] as const) {
    it(`${text} · ${lid} lid: corners kept, pieces whole, slots on the walls, plates simple`, () => {
      const p = params(text, { lid, size: 120 });
      const m = boxModel(p);
      const box = m.box!;
      const a = p.tabW;
      for (const w of box.walls) {
        if (w.style === "faceted") continue;
        const strips = stripsOf(m, w);
        expect(strips.length, `${w.letter} · ${w.contour}`).toBe(w.pieceLengths.length);
        // a wall broken at its corners: one strip per stretch between joints (longer ones split at flats)
        if (w.joints.length) expect(strips.length).toBeGreaterThanOrEqual(w.joints.length);
        expect(folds(w.centerline), `${w.letter} · ${w.contour}`).toBe(0);
        for (const j of w.joints) expect(["lap", "butt"]).toContain(j.kind);
        // pieces are long enough to handle
        for (const len of w.pieceLengths) expect(len, `${w.letter} · ${w.contour}`).toBeGreaterThan(5);
        expect(Math.abs(w.zones.reduce((s, z) => s + z.s1 - z.s0, 0) - w.length)).toBeLessThan(1e-6);
        expect(strips.reduce((s, st) => s + st.tabs.length, 0)).toBe(w.slots.length);
        expect(w.tabs.length).toBe(w.slots.length);
        for (const sl of w.slots) expect(distToPolyline(centroid(sl), w.centerline)).toBeLessThan(1e-6);
        for (const st of strips) for (const c of st.cols) for (const t of st.tabs) expect(Math.abs(c.x - t) - a / 2).toBeGreaterThanOrEqual(1.5 - 1e-6);
        for (const t of w.tabs) for (const z of w.zones.filter(z => z.kind === "curve")) expect(t + a / 2 <= z.s0 + 1e-6 || t - a / 2 >= z.s1 - 1e-6).toBe(true);
        for (const st of strips) {
          const comps = stripComponents(st, p);
          expect(comps.slice(1).every(n => n < 0.05 * 144), `${st.name}: ${comps.slice(0, 4).join(", ")}`).toBe(true);
        }
      }
      const plates = m.parts.filter((pt): pt is PlatePart => pt.kind === "plate");
      for (const pt of plates) {
        expect(signedArea(pt.outer)).toBeGreaterThan(0);
        expect(simplePolygons([pt.outer, ...pt.holes])).toBe(true);
        const shape = makeShape(pt.outer, pt.holes);
        for (const sl of pt.slots) expect(sl.every(q => pointInShape(q, shape))).toBe(true);
      }
      expect(plates.some(pt => pt.name.includes("lid"))).toBe(lid !== "open");
    });
  }

  it("the letters keep their shape: the base matches the glyph outline", () => {
    for (const text of ["L", "E", "Sam"]) {
      const p = { ...params(text), fontId: "bebas-neue", size: 150 };
      const m = computeLetterModel(p, bebas, hb);
      if ("error" in m) throw new Error(m.error);
      const glyph = m.shapes.reduce((s, x) => s + Math.abs(signedArea(x.outer)), 0);
      const bases = m.parts.filter((pt): pt is PlatePart => pt.kind === "plate" && / · base( \d+)?$/.test(pt.name));
      const base = bases.reduce((s, pt) => s + Math.abs(signedArea(pt.outer)), 0);
      // the base reaches baseRim past the outer walls; its outline still follows the glyph closely
      expect(Math.abs(base / glyph - 1), text).toBeLessThan(0.08);
    }
  });

  it("Bebas Neue “Sam” at 150 mm keeps every corner with no warnings", () => {
    const p = { ...params("Sam"), fontId: "bebas-neue", size: 150, lid: "removable" as const };
    const m = computeLetterModel(p, bebas, hb);
    if ("error" in m) throw new Error(m.error);
    expect(m.issues.filter(i => i.lvl === "warn").map(i => i.msg)).toEqual([]);
    for (const w of m.box!.walls) expect(w.zones.every(z => z.verdict !== "crack"), `${w.letter} · ${w.contour}`).toBe(true);
    expect(m.box!.walls.reduce((n, w) => n + w.joints.length, 0)).toBeGreaterThan(10);
  });

  it("a letter too narrow for walls along its corners is rounded instead, with a warning", () => {
    const m = boxModel(params("Sam", { size: 30 }));
    expect(m.issues.some(i => i.msg.includes("rounded instead"))).toBe(true);
  });

  it("Round off gives the old one-strip-per-outline walls", () => {
    const m = boxModel(params("L", { corners: "round" }));
    expect(m.box!.walls.every(w => w.joints.length === 0)).toBe(true);
    expect(m.parts.filter(pt => pt.kind === "strip").length).toBe(1);
  });
});

describe("letter box export", () => {
  it("SVG has every layer and no NaN", () => {
    for (const wallStyle of ["hinge", "faceted"] as const) {
      const p = params("Sam", { wallStyle, labels: true });
      const m = boxModel(p);
      const svg = exportLetterSVG(layoutLetters(m, p), p, "Fredoka Bold");
      expect(svg).not.toMatch(/NaN|undefined|Infinity/);
      expect(svg).toContain('width="');
      expect(svg).toMatch(/mm"/);
      expect(svg.includes("01 Hinge slits")).toBe(wallStyle === "hinge");
    }
  });

  it("hinge strips are shorter than the bed allows", () => {
    const p = params("O", { size: 400, bedW: 300 });
    const m = boxModel(p);
    for (const pt of m.parts) if (pt.kind === "strip") expect(pt.w).toBeLessThanOrEqual(280 + 1e-6);
    expect(m.box!.walls[0].pieceLengths.length).toBeGreaterThan(1);
  });
});
