/**
 * Decorative motifs for toppers, signs, table numbers, trophies and box lids. Each is built from
 * circles, curves and polygons and unioned into clean filled regions (outers with holes), so it can
 * be cut, engraved or welded to text. Built once in a 100 mm frame and scaled on use.
 */
import { differenceShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import { arc, bboxOf, circle, ellipse, rect, regularPolygon, roundedRect, stadium, transform, TAU } from "./geom";
import { heartCurve, orient, starPolygon } from "./shapes";
import type { Contour, Pt } from "./types";
import { fitArt } from "./util";

export const MOTIF_IDS = [
  "heart", "hearts", "star", "stars", "sparkle", "balloon", "balloons", "crown", "rings", "moon", "moonstar",
  "lantern", "mosque", "cap", "feet", "stroller", "paw", "tree",
  "snowflake", "laurel", "flame", "cup", "gift", "cake", "cupcake", "flower", "butterfly", "note", "bell",
  "key", "house", "sun", "cloud", "infinity", "leaf", "gem",
] as const;
export type MotifId = (typeof MOTIF_IDS)[number];

export const MOTIF_NAMES: Record<MotifId, string> = {
  heart: "Heart", hearts: "Two hearts", star: "Star", stars: "Stars", sparkle: "Sparkle", balloon: "Balloon",
  balloons: "Balloons", crown: "Crown", rings: "Wedding rings", moon: "Crescent", moonstar: "Crescent and star",
  lantern: "Lantern", mosque: "Mosque",
  cap: "Graduation cap", feet: "Baby feet", stroller: "Pram", paw: "Paw",
  tree: "Christmas tree", snowflake: "Snowflake", laurel: "Laurel wreath", flame: "Flame", cup: "Trophy cup",
  gift: "Gift", cake: "Cake", cupcake: "Cupcake", flower: "Flower", butterfly: "Butterfly", note: "Music note",
  bell: "Bell", key: "Key", house: "House", sun: "Sun", cloud: "Cloud", infinity: "Infinity", leaf: "Leaf", gem: "Diamond",
};

export const isMotifId = (v: unknown): v is MotifId => typeof v === "string" && (MOTIF_IDS as readonly string[]).includes(v);

/** Choice options for a motif field, with "None" first. */
export const MOTIF_OPTIONS = [{ v: "none", text: "None" }, ...MOTIF_IDS.map((id) => ({ v: id, text: MOTIF_NAMES[id] }))];

interface Piece { add: Contour[]; sub?: Contour[] }

const poly = (pts: [number, number][]): Contour => pts.map(([x, y]) => [x, y] as Pt);
const mirror = (c: Contour): Contour => c.map(([x, y]) => [-x, y] as Pt);
const at = (c: Contour, x: number, y: number, rot = 0, s = 1) => transform(c, { x, y, rot, sx: s, sy: s });

/** A pointed leaf from the origin along +x. */
function leaf(L: number, W: number, n = 24): Contour {
  const top: Contour = [], bot: Contour = [];
  for (let i = 0; i <= n; i++) { const t = i / n, y = (W / 2) * Math.sin(Math.PI * t); top.push([L * t, -y]); bot.push([L * t, y]); }
  return [...top, ...bot.reverse().slice(1, -1)];
}

/** A strip of width w along a polyline (stadiums between the points). */
function band(pts: Pt[], w: number): Contour[] {
  const out: Contour[] = [];
  for (let i = 1; i < pts.length; i++) out.push(stadium(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], w));
  return out;
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 20): Contour {
  const out: Contour = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
  }
  return out;
}

const heart = (x: number, y: number, s: number) => transform(heartCurve(), { x, y, sx: s, sy: s });

function balloonAt(x: number, y: number, s: number, string: Pt): Piece {
  const body = at(ellipse(0, -12, 30, 36), x, y, 0, s);
  const knot = at(poly([[-6, 27], [6, 27], [0, 20]]), x, y, 0, s);
  const k: Pt = [x, y + 26 * s];
  const pts: Pt[] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push([k[0] + (string[0] - k[0]) * t + 3 * s * Math.sin(t * 7), k[1] + (string[1] - k[1]) * t]); }
  return { add: [body, knot, ...band(pts, 2.6)] };
}

function foot(x: number, y: number, flip: boolean): Contour[] {
  const f = (c: Contour) => at(flip ? mirror(c) : c, x, y);
  return [
    f(transform(ellipse(0, 0, 12, 21), { rot: 8 })),
    f(circle(-8, -25, 5.2)), f(circle(0, -28.5, 4.4)), f(circle(7, -27.5, 3.8)), f(circle(12.5, -23.5, 3.3)), f(circle(16, -18, 2.9)),
  ];
}

const BUILD: Record<MotifId, () => Piece[]> = {
  heart: () => [{ add: [heart(0, 0, 3)] }],
  hearts: () => [{ add: [heart(-12, -4, 2.5), heart(20, 10, 1.7)] }],
  star: () => [{ add: [starPolygon(5, 50, 0.45)] }],
  stars: () => [{ add: [starPolygon(5, 34, 0.45, -10, 6), starPolygon(5, 15, 0.45, 30, -26), starPolygon(5, 10, 0.45, 32, 24)] }],
  sparkle: () => [{ add: [starPolygon(4, 46, 0.24, -6, 6), starPolygon(4, 15, 0.26, 32, -30)] }],
  balloon: () => [balloonAt(0, -6, 1, [0, 58])],
  balloons: () => [balloonAt(-22, -6, 0.62, [0, 52]), balloonAt(22, -6, 0.62, [0, 52]), balloonAt(0, -24, 0.62, [0, 52])],
  crown: () => [{
    add: [poly([[-45, 25], [45, 25], [48, -20], [24, 0], [0, -30], [-24, 0], [-48, -20]]), rect(-45, 23, 90, 14), circle(-48, -24, 6), circle(0, -35, 7), circle(48, -24, 6)],
    sub: [circle(0, 12, 5), circle(-24, 14, 3.5), circle(24, 14, 3.5)],
  }],
  rings: () => [
    { add: [circle(-15, 8, 28)], sub: [circle(-15, 8, 22)] },
    { add: [circle(15, 8, 28)], sub: [circle(15, 8, 22)] },
    { add: [poly([[15, -18], [25, -29], [20, -36], [10, -36], [5, -29]])] },
  ],
  moon: () => [{ add: [circle(0, 0, 45)], sub: [circle(20, -12, 38)] }],
  moonstar: () => [{ add: [circle(-6, 0, 45)], sub: [circle(14, -12, 38)] }, { add: [starPolygon(5, 15, 0.45, 22, 4)] }],
  lantern: () => [
    {
      add: [poly([[-20, -28], [20, -28], [28, -4], [22, 30], [-22, 30], [-28, -4]]), poly([[-16, -27], [16, -27], [0, -46]]), rect(-24, 29, 48, 8)],
      sub: [rect(-7, -8, 14, 26), circle(0, -8, 7), rect(-19, -2, 6, 20), rect(13, -2, 6, 20)],
    },
    { add: [circle(0, -50, 7)], sub: [circle(0, -50, 3.5)] },
  ],
  mosque: () => [
    {
      add: [circle(0, -5, 24), poly([[-12, -24], [12, -24], [0, -40]]), rect(-26, -2, 52, 18), rect(-38, 14, 76, 28),
        rect(-48, -20, 9, 62), rect(39, -20, 9, 62), poly([[-48, -20], [-39, -20], [-43.5, -34]]), poly([[39, -20], [48, -20], [43.5, -34]])],
      sub: [rect(-7, 26, 14, 12), circle(0, 26, 7)],
    },
    { add: [circle(0, -44, 6)], sub: [circle(2.6, -46, 5)] },
  ],
  cap: () => [{
    add: [poly([[-50, -12], [0, -32], [50, -12], [0, 8]]), poly([[-28, -2], [28, -2], [28, 20], [0, 28], [-28, 20]]), stadium(30, -14, 38, 22, 3), poly([[34, 20], [42, 20], [44, 34], [32, 34]])],
  }],
  feet: () => [{ add: [...foot(-16, 10, true), ...foot(16, -2, false)] }],
  stroller: () => [
    { add: [[[0, 0], ...arc(0, 0, 30, Math.PI, 1.5 * Math.PI)], roundedRect(-32, 0, 64, 20, 8), stadium(30, 4, 46, -22, 5), stadium(-18, 14, -18, 32, 4), stadium(18, 14, 18, 32, 4)] },
    { add: [circle(-18, 32, 10)], sub: [circle(-18, 32, 4)] },
    { add: [circle(18, 32, 10)], sub: [circle(18, 32, 4)] },
  ],
  paw: () => [{ add: [ellipse(0, 18, 24, 20), at(ellipse(0, 0, 9, 12), -29, -6, -25), at(ellipse(0, 0, 9, 12), -10, -24), at(ellipse(0, 0, 9, 12), 10, -24), at(ellipse(0, 0, 9, 12), 29, -6, 25)] }],
  tree: () => [{ add: [poly([[0, -46], [22, -18], [-22, -18]]), poly([[0, -30], [32, 6], [-32, 6]]), poly([[0, -10], [42, 30], [-42, 30]]), rect(-7, 28, 14, 16), starPolygon(5, 11, 0.45, 0, -48)] }],
  snowflake: () => {
    const add: Contour[] = [regularPolygon(6, 12)];
    for (let k = 0; k < 6; k++) {
      const r = (c: Contour) => transform(c, { rot: 60 * k });
      add.push(r(stadium(0, 0, 0, -46, 6)), r(stadium(0, -26, -12, -38, 5)), r(stadium(0, -26, 12, -38, 5)), r(stadium(0, -12, -8, -20, 4)), r(stadium(0, -12, 8, -20, 4)));
    }
    return [{ add, sub: [regularPolygon(6, 5)] }];
  },
  laurel: () => {
    const side: Contour[] = [];
    const a0 = 0.62 * Math.PI, a1 = 1.42 * Math.PI;
    side.push(...band(arc(0, 0, 40, a0, a1, 0.3), 3));
    for (let k = 0; k <= 6; k++) {
      const a = a0 + ((a1 - a0) * k) / 6, p: Pt = [40 * Math.cos(a), 40 * Math.sin(a)];
      const dir = ((a + Math.PI / 2) * 180) / Math.PI;
      side.push(at(leaf(17, 7), p[0], p[1], dir - 40), at(leaf(17, 7), p[0], p[1], dir + 40));
    }
    return [{ add: [...side, ...side.map(mirror)] }];
  },
  flame: () => {
    const outer: Contour = [[0, 45], ...cubic([0, 45], [-35, 45], [-35, 5], [-10, -20]), ...cubic([-10, -20], [-5, -30], [0, -40], [2, -50]), ...cubic([2, -50], [25, -25], [35, 0], [30, 20]), ...cubic([30, 20], [25, 40], [10, 45], [0, 45])];
    return [{ add: [outer], sub: [transform(outer, { sx: 0.42, sy: 0.42, y: 16 })] }];
  },
  cup: () => [
    {
      add: [[[-30, -40], [30, -40], ...cubic([30, -40], [30, -8], [14, 8], [0, 10]), ...cubic([0, 10], [-14, 8], [-30, -8], [-30, -40])], rect(-5, 6, 10, 18), roundedRect(-22, 23, 44, 8, 2), roundedRect(-28, 30, 56, 10, 2)],
      sub: [starPolygon(5, 9, 0.45, 0, -22)],
    },
    { add: [ellipse(-32, -25, 13, 14)], sub: [ellipse(-32, -25, 7, 8)] },
    { add: [ellipse(32, -25, 13, 14)], sub: [ellipse(32, -25, 7, 8)] },
  ],
  gift: () => [
    { add: [rect(-34, -8, 68, 48), rect(-40, -22, 80, 15), circle(0, -24, 6)], sub: [rect(-4, -4, 8, 40)] },
    { add: [at(ellipse(0, 0, 14, 9), -14, -31, -25)], sub: [at(ellipse(0, 0, 7.5, 3.8), -14, -31, -25)] },
    { add: [at(ellipse(0, 0, 14, 9), 14, -31, 25)], sub: [at(ellipse(0, 0, 7.5, 3.8), 14, -31, 25)] },
  ],
  cake: () => [{
    add: [roundedRect(-42, 8, 84, 32, 3), roundedRect(-30, -16, 60, 26, 3), rect(-17, -34, 6, 20), rect(-3, -36, 6, 22), rect(11, -34, 6, 20), ellipse(-14, -39, 3.5, 6), ellipse(0, -41, 3.5, 6), ellipse(14, -39, 3.5, 6)],
    sub: [...band([[-36, 22], [-24, 28], [-12, 22], [0, 28], [12, 22], [24, 28], [36, 22]], 2.4)],
  }],
  cupcake: () => [{
    add: [poly([[-28, 5], [28, 5], [20, 45], [-20, 45]]), circle(-20, 0, 14), circle(0, -8, 18), circle(20, 0, 14), circle(0, -24, 12), rect(-34, -2, 68, 9), circle(0, -40, 7)],
    sub: [stadium(-11, 14, -9, 38, 2.6), stadium(0, 14, 0, 38, 2.6), stadium(11, 14, 9, 38, 2.6)],
  }],
  flower: () => {
    const add: Contour[] = [circle(0, 0, 14)];
    for (let k = 0; k < 5; k++) { const a = (TAU * k) / 5 - Math.PI / 2; add.push(circle(22 * Math.cos(a), 22 * Math.sin(a), 16)); }
    return [{ add, sub: [circle(0, 0, 6)] }];
  },
  butterfly: () => {
    const wing = [at(ellipse(0, 0, 24, 17), -21, -14, -30), at(ellipse(0, 0, 15, 11), -16, 16, 30)];
    const hole = [at(ellipse(0, 0, 8, 5), -24, -16, -30)];
    return [{
      add: [...wing, ...wing.map(mirror), stadium(0, -22, 0, 30, 7), stadium(0, -22, -12, -44, 2.5), stadium(0, -22, 12, -44, 2.5), circle(-12, -44, 3), circle(12, -44, 3)],
      sub: [...hole, ...hole.map(mirror)],
    }];
  },
  note: () => [{ add: [at(ellipse(0, 0, 12, 8.5), -24, 32, -20), at(ellipse(0, 0, 12, 8.5), 16, 24, -20), rect(-16, -30, 5, 62), rect(24, -38, 5, 62), poly([[-16, -30], [29, -38], [29, -26], [-16, -18]])] }],
  bell: () => {
    const half: Contour = [[-1, -38], [0, -38], ...cubic([0, -38], [18, -38], [22, -20], [24, 0]), ...cubic([24, 0], [26, 18], [34, 26], [40, 32]), [40, 36], [-1, 36]];
    return [{ add: [half, mirror(half), circle(0, 41, 7)] }, { add: [circle(0, -44, 8)], sub: [circle(0, -44, 4)] }];
  },
  key: () => [{ add: [circle(-30, 0, 20), rect(-12, -5, 58, 10), rect(30, 4, 6, 12), rect(40, 4, 6, 8)], sub: [circle(-30, 0, 9)] }],
  house: () => [{
    add: [poly([[0, -45], [45, -5], [35, -5], [35, 40], [-35, 40], [-35, -5], [-45, -5]]), rect(18, -38, 9, 20)],
    sub: [roundedRect(-8, 12, 16, 22, 3), rect(-26, 0, 12, 12), rect(14, 0, 12, 12)],
  }],
  sun: () => {
    const add: Contour[] = [circle(0, 0, 25)];
    for (let k = 0; k < 12; k++) {
      const a = (TAU * k) / 12, b = 0.13;
      add.push(poly([[27 * Math.cos(a - b), 27 * Math.sin(a - b)], [48 * Math.cos(a), 48 * Math.sin(a)], [27 * Math.cos(a + b), 27 * Math.sin(a + b)], [20 * Math.cos(a), 20 * Math.sin(a)]]));
    }
    return [{ add, sub: [circle(0, 0, 15)] }, { add: [circle(0, 0, 11)] }];
  },
  cloud: () => [{ add: [circle(-24, 10, 22), circle(-3, -10, 30), circle(23, 2, 24), circle(36, 20, 14), roundedRect(-40, 5, 85, 30, 14)] }],
  infinity: () => {
    const pts: Pt[] = [];
    for (let i = 0; i <= 96; i++) { const t = (TAU * i) / 96, d = 1 + Math.sin(t) ** 2; pts.push([(48 * Math.cos(t)) / d, (48 * Math.sin(t) * Math.cos(t)) / d]); }
    return [{ add: band(pts, 8) }];
  },
  leaf: () => [{ add: [at(leaf(96, 44), -34, 34, -45), stadium(-34, 34, -46, 46, 4)], sub: [stadium(-20, 20, 16, -16, 2)] }],
  gem: () => [{ add: [poly([[-30, -22], [30, -22], [46, -6], [0, 40], [-46, -6]])], sub: [poly([[-10, -16], [10, -16], [16, -8], [0, 24], [-16, -8]])] }],
};

function solve(pieces: Piece[]): Contour[] {
  const cs = pieces.flatMap((pc) => {
    const add = pc.add.map(orient);
    return shapeContours(pc.sub?.length ? differenceShapes(add, pc.sub.map(orient)) : unionShapes(add));
  });
  return shapeContours(unionShapes(cs));
}

const cache = new Map<MotifId, Contour[]>();

/** The motif's filled regions (outers and holes, union orientation) in a 100 mm box centred on (0, 0). */
function unitMotif(id: MotifId): Contour[] {
  let cs = cache.get(id);
  if (!cs) {
    const raw = solve(BUILD[id]());
    const b = bboxOf(raw), s = 100 / Math.max(b.x1 - b.x0, b.y1 - b.y0);
    cs = raw.map((c) => transform(c, { x: -((b.x0 + b.x1) / 2) * s, y: -((b.y0 + b.y1) / 2) * s, sx: s, sy: s }));
    cache.set(id, cs);
  }
  return cs;
}

/** The motif scaled so its larger side is `size` mm, centred on (cx, cy); `flip` mirrors it. */
export function motif(id: MotifId, size: number, cx = 0, cy = 0, flip = false): Contour[] {
  const s = size / 100;
  const cs = unitMotif(id).map((c) => transform(c, { x: cx, y: cy, sx: flip ? -s : s, sy: s }));
  return flip ? cs.map((c) => c.slice().reverse()) : cs;
}

/** Width and height of the motif at `size`. */
export function motifSize(id: MotifId, size: number): { w: number; h: number } {
  const b = bboxOf(unitMotif(id));
  return { w: ((b.x1 - b.x0) * size) / 100, h: ((b.y1 - b.y0) * size) / 100 };
}

/** Rail picture for a motif. */
export function motifArt(id: string): { d: string; fill?: boolean }[] {
  if (!isMotifId(id)) return [{ d: "M20,14 L44,30 M44,14 L20,30" }];
  return [{ d: fitArt(motif(id, 38), 34).join(" "), fill: true }];
}
