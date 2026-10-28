/**
 * Desk holders on a tabbed frame: the business card holder and the coaster holders.
 *
 * The card holder and the coaster caddy stand on two side profiles. Between them run members (a
 * front, a floor, a back, and for a tiered card holder a second front and floor), each with a tab at
 * either end that passes through a slot in each side, like the phone stand. Dividers between card
 * bays stand on the floor with tabs through it. The other coaster holders are a base with upright
 * posts tabbed into it, or rings stacked and glued into a cup. The coasters themselves can be cut too,
 * engraved with a pattern and the lid engraving.
 *
 * Profiles are drawn y up from the desk, x from the front (0) to the back; in the assembly the front
 * faces the viewer (larger plan y), as in the phone stand.
 */
import { differenceShapes, makeShape, offsetShapes, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { circle, rect, roundedRect, signedArea, stadium } from "../geom";
import type { BuildContext, Contour, GenPart, Pt } from "../types";
import { band, engraveOn, flat, hasArt, lidArt, markLid, r1, wall, type V2Output } from "./more";
import type { BoxesParams, CardCrest, CardLip, CardProfile, CoasterDeco } from "./params";

type Place = NonNullable<GenPart["place"]>;

const biggest = (s: Shape[]) => s.reduce((a, b) => (b.area > a.area ? b : a), s[0]);
/** Contours wound alike, so a union never cancels where they overlap. */
const wound = (c: Contour): Contour => (signedArea(c) < 0 ? c.slice().reverse() : c);
const outerOf = (cs: Contour[]) => biggest(unionShapes(cs.map(wound), [], false, true)).outer;
/** Polygon given y up, in a frame of height h (v = h - y). */
const yUp = (pts: Pt[], h: number): Contour => pts.map(([x, y]) => [x, h - y] as Pt);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** How the side profile climbs from one wall's top to the next, for t from 0 to 1. */
const EASE: Record<CardProfile, (t: number) => number> = {
  slant: (t) => t,
  wave: (t) => (1 - Math.cos(Math.PI * t)) / 2,
  arch: (t) => Math.sin((Math.PI * t) / 2),
  scoop: (t) => 1 - Math.cos((Math.PI * t) / 2),
  step: (t) => { const s = clamp((t - 0.38) / 0.24, 0, 1); return s * s * (3 - 2 * s); },
};

/** An upright member standing in the sides: it fills x to x + T of the profile and reaches `top`. */
interface Station { x: number; top: number }

/** Height of the side profile at x: level over each wall, eased between walls. */
function heightAt(walls: Station[], T: number, ease: (t: number) => number, x: number): number {
  if (x <= walls[0].x + T) return walls[0].top;
  for (let i = 0; i + 1 < walls.length; i++) {
    const a = walls[i], b = walls[i + 1];
    if (x <= b.x) return a.top + (b.top - a.top) * ease(clamp((x - a.x - T) / Math.max(1e-6, b.x - a.x - T), 0, 1));
    if (x <= b.x + T) return b.top;
  }
  return walls[walls.length - 1].top;
}

/** The side outline (y up) over [0, L], its convex corners rounded by r. */
function sideOutline(L: number, T: number, walls: Station[], ease: (t: number) => number, r: number): Pt[] {
  const pts: Pt[] = [[0, 0], [L, 0]];
  const n = Math.max(8, Math.ceil(L));
  for (let i = n; i >= 0; i--) { const x = (L * i) / n; pts.push([x, heightAt(walls, T, ease, x)]); }
  if (r <= 0.2) return pts;
  const s = offsetShapes(offsetShapes([makeShape(pts, [])], -r), r);
  return s.length ? biggest(s).outer : pts;
}

/** A member's end tabs: through sides that stand W apart, from v0 + inset to v0 + h - inset. */
const endTabs = (W: number, T: number, h: number, inset: number, v0 = 0): Contour[] => [
  rect(0, v0 + inset, T + 1, h - 2 * inset),
  rect(W + T - 1, v0 + inset, T + 1, h - 2 * inset),
];

/** Bays across a member: their start (from the inside of the left side) and width. */
interface Bays { n: number; w: number }
const bayOf = (b: Bays, T: number, u: number): { i: number; s: number } | null => {
  const k = Math.floor(u / (b.w + T)), s = (u - k * (b.w + T)) / b.w;
  return k < b.n && s >= 0 && s <= 1 ? { i: k, s } : null;
};

/**
 * An upright member W wide (inside the sides) and h tall, its top edge raised by g(bay position)
 * across each bay (negative dips it), with a semicircular notch of radius `notch` in each bay.
 * Returns the outline, the body without tabs, and `lift`: how far the top edge rises above h.
 */
function upright(W: number, T: number, h: number, inset: number, bays: Bays, g: (s: number) => number, notch = 0) {
  const n = Math.max(16, Math.ceil(W));
  const top: Pt[] = [];
  let lift = 0;
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = (W * i) / n, b = bayOf(bays, T, u);
    const y = b ? g(b.s) : 0;
    ys.push(y);
    lift = Math.max(lift, y);
  }
  for (let i = 0; i <= n; i++) top.push([T + (W * i) / n, lift - ys[i]]);
  const body: Contour = [...top, [W + T, lift + h], [T, lift + h]];
  let outer = outerOf([body, ...endTabs(W, T, h, inset, lift)]);
  let bodyOut = body;
  if (notch > 0) {
    const cuts = Array.from({ length: bays.n }, (_, i) => circle(T + i * (bays.w + T) + bays.w / 2, lift, notch));
    outer = biggest(differenceShapes([outer], cuts)).outer;
    bodyOut = biggest(differenceShapes([body], cuts)).outer;
  }
  return { outer, body: bodyOut, lift };
}

/** The front's top edge across a bay (s from 0 to 1): how far it dips, mm (negative). */
function lipEdge(kind: CardLip, dep: number, bw: number): (s: number) => number {
  switch (kind) {
    case "scallop": return (s) => -dep * Math.sin(Math.PI * s);
    case "wave": { const k = Math.max(1, Math.round(bw / 35)); return (s) => (-dep * (1 - Math.cos(2 * Math.PI * k * s))) / 2; }
    default: return () => 0;
  }
}

/** The back's crest across a bay: how far it rises above the sides, mm. */
function crestEdge(kind: CardCrest, c: number, bw: number): (s: number) => number {
  switch (kind) {
    case "arch": return (s) => c * Math.sqrt(Math.max(0, 1 - (2 * s - 1) ** 2));
    case "peak": return (s) => c * (1 - Math.abs(2 * s - 1));
    case "wave": { const k = Math.max(2, Math.round(bw / 30)); return (s) => (c * (1 - Math.cos(2 * Math.PI * k * s))) / 2; }
    default: return () => 0;
  }
}

/** Tab centres and width for a divider standing on a floor `d` deep. */
function floorTabs(d: number) {
  const n = d > 70 ? 2 : 1, w = clamp(d * 0.35, 6, 20);
  return { w, cs: Array.from({ length: n }, (_, i) => (d * (i + 0.5)) / n) };
}

/** Engraved card art on a member's body, below its dipped top edge. */
function artOnFront(p: BoxesParams, ctx: BuildContext, front: GenPart, body: Contour, W: number, T: number, top: number, h: number, dip: number) {
  if (!hasArt(p)) return { loading: false, missing: [] as string[], sizes: {} };
  const art = lidArt(p, ctx);
  const room = h - dip;
  markLid(front, p, engraveOn(p, art, body, T + W / 2, top + dip + room / 2));
  return { loading: art.loading, missing: art.missing, sizes: { textWidth: art.w, textRoom: W - 8, artHeight: art.h, artRoom: room - 4 } };
}

/** The desk business card holder. */
export function buildCard(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, c = p.card, cl = 1;
  const across = c.portrait ? c.cardH : c.cardW, tall = c.portrait ? c.cardW : c.cardH;
  const N = clamp(Math.round(c.bays), 1, 4), Wb = across + 2 * cl, W = N * Wb + (N - 1) * T;
  const d = Math.max(10, c.depth), hf = clamp(c.front, 6, tall), hb = clamp(c.back, hf + 4, tall * 1.5);
  const r = clamp(c.corner, 0, 20), m = Math.max(6, 2 * T, r), z0 = Math.max(3, T), inset = Math.max(2.5, T);
  const rise = c.tiered ? Math.max(hf + 4, Math.round(tall * 0.45)) : 0;
  const ease = EASE[c.profile] ?? EASE.wave;

  // Walls (upright members) and floors, along the profile from the front.
  const walls: (Station & { kind: "front" | "mid" | "back" })[] = [{ x: m, top: z0 + T + hf, kind: "front" }];
  const floors: { a: number; b: number; z: number }[] = [{ a: m + T, b: m + T + d, z: z0 }];
  if (c.tiered) {
    walls.push({ x: m + T + d, top: z0 + rise + T + hf, kind: "mid" });
    floors.push({ a: m + 2 * T + d, b: m + 2 * T + 2 * d, z: z0 + rise });
  }
  const last = floors[floors.length - 1];
  walls.push({ x: last.b, top: last.z + T + hb, kind: "back" });
  const Bx = last.b + T + m;
  const Hs = Math.max(...walls.map((w) => w.top));
  const bays: Bays = { n: N, w: Wb };

  // Side profile with a slot for every member.
  const side = yUp(sideOutline(Bx, T, walls, ease, r), Hs);
  const slots: Contour[] = [
    ...floors.map((f) => yUp(rect(f.a + inset, f.z, f.b - f.a - 2 * inset, T), Hs)),
    ...walls.map((w) => yUp(rect(w.x, inset, T, w.top - 2 * inset), Hs)),
  ];
  const sidePlace = (x: number): Place => ({ x, y: -Hs, z: Bx, upright: true, yaw: -90 });
  const parts: GenPart[] = [
    { id: "side-l", name: "Left side", outer: side, holes: slots, place: sidePlace(0) },
    { id: "side-r", name: "Right side", outer: side, holes: slots, place: sidePlace(W + T) },
  ];

  // Uprights: the front (and the tier's front) with the lip, the back with the crest.
  const dep = Math.min(hf * 0.45, 10), notch = Math.min(hf * 0.65, 13, Wb * 0.18), crest = Math.min(16, Wb * 0.18);
  const lip = (w: Station) => upright(W, T, w.top, inset, bays, lipEdge(c.lip, dep, Wb), c.lip === "notch" ? notch : 0);
  let front: GenPart | null = null, frontBody: Contour = [], frontLift = 0;
  for (const w of walls) {
    const u = w.kind === "back" ? upright(W, T, w.top, inset, bays, crestEdge(c.crest, crest, Wb)) : lip(w);
    const part: GenPart = {
      id: w.kind, name: w.kind === "front" ? "Front" : w.kind === "mid" ? "Back row front" : "Back",
      outer: u.outer, holes: [], place: wall(0, w.top + u.lift, Bx - w.x - T),
    };
    if (w.kind === "front") { front = part; frontBody = u.body; frontLift = u.lift; }
    parts.push(part);
  }

  // Floors, slotted for the dividers that stand on them.
  floors.forEach((f, k) => {
    const ft = floorTabs(f.b - f.a);
    const holes: Contour[] = [];
    for (let i = 0; i + 1 < N; i++) {
      const xi = T + i * (Wb + T) + Wb;
      for (const cc of ft.cs) holes.push(rect(xi, f.b - f.a - cc - ft.w / 2, T, ft.w));
    }
    parts.push({
      id: k ? "floor2" : "floor", name: k ? "Back row floor" : floors.length > 1 ? "Front row floor" : "Floor",
      outer: outerOf([rect(T, 0, W, f.b - f.a), ...endTabs(W, T, f.b - f.a, inset)]), holes, place: flat(0, Bx - f.b, f.z),
    });
    for (let i = 0; i + 1 < N; i++) {
      const xi = T + i * (Wb + T) + Wb;
      const n = Math.max(8, Math.ceil(f.b - f.a));
      const pts: Pt[] = [[f.b, f.z + T], [f.a, f.z + T]];
      for (let j = 0; j <= n; j++) { const x = f.a + ((f.b - f.a) * j) / n; pts.push([x, heightAt(walls, T, ease, x)]); }
      const tabsCs = ft.cs.map((cc) => rect(f.a + cc - ft.w / 2, f.z - 0.01, ft.w, T + 1));
      parts.push({
        id: `div${k + 1}-${i + 1}`, name: floors.length > 1 ? `Divider ${i + 1} (row ${k + 1})` : `Divider ${i + 1}`,
        outer: yUp(outerOf([pts, ...tabsCs]), Hs), holes: [], place: sidePlace(xi),
      });
    }
  });

  const f0 = front!, top0 = walls[0];
  const dip = c.lip === "notch" ? notch : c.lip === "straight" ? 0 : dep;
  const art = artOnFront(p, ctx, f0, frontBody, W, T, frontLift, top0.top, dip);
  const cards = Math.round(d * 2);
  const crestUp = c.crest === "flat" ? 0 : crest;
  return {
    parts,
    stats: [
      { label: "Outside", value: `${r1(W + 2 * T)} × ${r1(Bx)} × ${r1(Hs + crestUp)} mm` },
      { label: "Cards", value: `${r1(c.portrait ? c.cardH : c.cardW)} × ${r1(c.portrait ? c.cardW : c.cardH)} mm, ${c.portrait ? "upright" : "landscape"}` },
      { label: "Holds", value: `about ${cards} cards in each of ${N * floors.length} ${N * floors.length === 1 ? "bay" : "bays"}` },
    ],
    assembly: [
      "Push the tabs of the front, floor and back through one side, then press the other side on.",
      ...(N > 1 ? ["Stand the dividers in the slots of the floor before the second side goes on."] : []),
      ...(c.tiered ? ["The back row's floor sits higher, so the cards behind show over the front row."] : []),
      "A drop of glue in each slot keeps it square; sand the tab ends flush or leave them showing.",
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W + 2 * T, Bx, Hs + crestUp], ...art.sizes },
  };
}

/** A coaster outline, size across, with its frame at (0, 0). */
const coasterOutline = (p: BoxesParams): Contour => {
  const s = p.coaster;
  return s.shape === "round" ? circle(s.size / 2, s.size / 2, s.size / 2) : roundedRect(0, 0, s.size, s.size, clamp(s.corner, 0, s.size / 2));
};

/** The coaster's decoration, engraved, centred on its frame. */
function decoration(kind: CoasterDeco, outline: Contour, size: number, art: boolean): Contour[] {
  const R = size / 2, cx = R, cy = R;
  switch (kind) {
    case "rings": return [5, 9, 13].flatMap((i) => band(outline, i, 1));
    case "sunburst": {
      const r0 = R * (art ? 0.5 : 0.24), r2 = R * 0.84, n = 24;
      return Array.from({ length: n }, (_, k) => {
        const a = (2 * Math.PI * k) / n, w0 = 0.5 / r0, w1 = 1.4 / r2;
        const at = (r: number, b: number): Pt => [cx + r * Math.cos(a + b), cy + r * Math.sin(a + b)];
        return [at(r0, -w0), at(r2, -w1), at(r2, w1), at(r0, w0)];
      });
    }
    case "dots": return [
      ...Array.from({ length: 20 }, (_, k) => circle(cx + R * 0.82 * Math.cos((2 * Math.PI * k) / 20), cy + R * 0.82 * Math.sin((2 * Math.PI * k) / 20), 1.8)),
      ...Array.from({ length: 12 }, (_, k) => circle(cx + R * 0.68 * Math.cos((2 * Math.PI * (k + 0.5)) / 12), cy + R * 0.68 * Math.sin((2 * Math.PI * (k + 0.5)) / 12), 1.2)),
    ];
    default: return [];
  }
}

/** The coaster holders: a caddy, a base with posts, or stacked rings. */
export function buildCoaster(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, s = p.coaster;
  const size = Math.max(40, s.size), cl = clamp(s.clearance, 0, 5), count = clamp(Math.round(s.count), 1, 16);
  const tc = s.set ? T : Math.max(1, s.thick), stack = count * tc, Hin = stack + Math.max(0, s.extra);
  const S = size + 2 * cl, R = S / 2;
  const parts: GenPart[] = [];
  const stats: { label: string; value: string }[] = [];
  const assembly: string[] = [];
  let centre: [number, number] = [0, 0], floorZ = T, size3: [number, number, number] = [0, 0, 0];
  const inset = Math.max(2.5, T);

  if (s.style === "caddy") {
    const m = Math.max(6, 2 * T), z0 = Math.max(3, T), W = S;
    const lipTop = z0 + T + Math.max(10, Math.min(Hin, stack * 0.5)), backTop = z0 + T + Hin;
    const walls: Station[] = [{ x: m, top: lipTop }, { x: m + T + S, top: backTop }];
    const Bx = m + 2 * T + S + m;
    const Hend = backTop + (s.handle ? 34 : 0), Rr = s.handle ? Math.min(Bx * 0.3, 30) : Math.min(8, m);
    const endY = outerOf([rect(0, 0, Bx, Hend - Rr), roundedRect(0, 0, Bx, Hend, Rr)]);
    const end = yUp(endY, Hend);
    const holes: Contour[] = [
      yUp(rect(m + T + inset, z0, S - 2 * inset, T), Hend),
      ...walls.map((w) => yUp(rect(w.x, inset, T, w.top - 2 * inset), Hend)),
    ];
    if (s.handle) holes.push(yUp(stadium(Bx / 2 - Math.min(Bx * 0.28, 40), Hend - 16, Bx / 2 + Math.min(Bx * 0.28, 40), Hend - 16, 20), Hend));
    if (s.open) {
      const x0 = m + T + 8, x1 = Bx - m - T - 8, y0 = z0 + T + 6, y1 = Math.min(backTop, s.handle ? Hend - 28 : backTop) - 8;
      if (x1 - x0 >= 20 && y1 - y0 >= 12) holes.push(yUp(roundedRect(x0, y0, x1 - x0, y1 - y0, Math.min(6, (y1 - y0) / 2)), Hend));
    }
    const endPlace = (x: number): Place => ({ x, y: -Hend, z: Bx, upright: true, yaw: -90 });
    const bays: Bays = { n: 1, w: W };
    const lip = upright(W, T, lipTop, inset, bays, (q) => -Math.min((lipTop - z0) * 0.5, 14) * Math.sin(Math.PI * q));
    const back = upright(W, T, backTop, inset, bays, () => 0);
    parts.push(
      { id: "end-l", name: "Left end", outer: end, holes, place: endPlace(0) },
      { id: "end-r", name: "Right end", outer: end, holes, place: endPlace(W + T) },
      { id: "front", name: "Front", outer: lip.outer, holes: [], place: wall(0, lipTop + lip.lift, Bx - m - T) },
      { id: "back", name: "Back", outer: back.outer, holes: [], place: wall(0, backTop, Bx - (m + T + S) - T) },
      { id: "floor", name: "Floor", outer: outerOf([rect(T, 0, W, S), ...endTabs(W, T, S, inset)]), holes: [], place: flat(0, Bx - (m + T + S), z0) },
    );
    centre = [T + S / 2, Bx - (m + T + S / 2)];
    floorZ = z0 + T;
    size3 = [W + 2 * T, Bx, Hend];
    stats.push({ label: "Outside", value: `${r1(W + 2 * T)} × ${r1(Bx)} × ${r1(Hend)} mm` });
    assembly.push("Push the tabs of the front, floor and back through one end, then press the other end on; a drop of glue in each slot keeps it square.");
  } else if (s.style === "posts") {
    const flange = 6, Rb = R + T + flange;
    const base = s.shape === "round" ? circle(Rb, Rb, Rb) : roundedRect(0, 0, 2 * Rb, 2 * Rb, clamp(s.corner + T + flange, 2, Rb));
    const ph = Hin, baseHoles: Contour[] = [];
    // Posts in a ring (round), or on the sides in the order left, right, back, front (square).
    const n = s.shape === "round" ? clamp(Math.round(s.posts), 3, 8) : clamp(Math.round(s.posts), 2, 4);
    const angles = s.shape === "round"
      ? Array.from({ length: n }, (_, k) => 90 + 180 / n + (360 * k) / n)
      : [180, 0, -90, 90].slice(0, n);
    const maxW = s.shape === "round" ? Math.min(R, 2 * R * Math.tan(Math.PI / n) * 0.85) : S - 2;
    const pw = clamp(s.postWidth, 10, maxW), tw = Math.max(6, pw * 0.5), rt = Math.min(pw / 2, 12);
    const post = outerOf([roundedRect(0, 0, pw, ph, rt), rect(0, rt, pw, ph - rt), rect(pw / 2 - tw / 2, ph - 1, tw, T + 1)]);
    const postHoles: Contour[] = s.open && pw >= 22 && ph >= 36 ? [roundedRect(pw * 0.27, ph * 0.18, pw * 0.46, ph * 0.5, pw * 0.23)] : [];
    angles.forEach((deg, k) => {
      const a = (deg * Math.PI) / 180, nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx;
      // Thickness runs inward (toward the stack) so the placement turns without mirroring.
      const ox = Rb + nx * (R + T) - tx * (pw / 2), oy = Rb + ny * (R + T) - ty * (pw / 2);
      parts.push({ id: `post${k + 1}`, name: `Post ${k + 1}`, outer: post, holes: postHoles, place: { x: 0, y: 0, z: 0, m: [tx, 0, -nx, ox, ty, 0, -ny, oy, 0, -1, 0, T + ph] } });
      const at = (rr: number, w: number): Pt => [Rb + nx * rr + tx * w, Rb + ny * rr + ty * w];
      baseHoles.push([at(R, -tw / 2), at(R, tw / 2), at(R + T, tw / 2), at(R + T, -tw / 2)]);
    });
    if (s.push) baseHoles.push(circle(Rb, Rb, Math.min(15, size * 0.15)));
    parts.unshift({ id: "base", name: "Base", outer: base, holes: baseHoles, place: flat(0, 0, 0) });
    centre = [Rb, Rb];
    size3 = [2 * Rb, 2 * Rb, T + ph];
    stats.push({ label: "Outside", value: `${r1(2 * Rb)} × ${r1(2 * Rb)} × ${r1(T + ph)} mm` }, { label: "Posts", value: `${n}, ${r1(pw)} mm wide` });
    assembly.push("Push each post's tab into its slot in the base and glue it, all facing the middle.");
    if (s.push) assembly.push("The hole in the base lets you push the stack up from below.");
  } else {
    const w = clamp(s.wall, 4, 30), Rb = R + w;
    const outer = s.shape === "round" ? circle(Rb, Rb, Rb) : roundedRect(0, 0, 2 * Rb, 2 * Rb, clamp(s.corner + w, 2, Rb));
    const inner = s.shape === "round" ? circle(Rb, Rb, R) : roundedRect(w, w, S, S, clamp(s.corner + cl, 0, R));
    const layers = Math.max(1, Math.ceil(Hin / T));
    const ow = Math.min(size * 0.45, 50);
    const gap = s.open ? [rect(Rb - ow / 2, Rb, ow, Rb + 1)] : [];
    const ring = biggest(differenceShapes([outer], [inner, ...gap]));
    parts.push({ id: "base", name: "Base", outer, holes: s.push ? [circle(Rb, Rb, Math.min(15, size * 0.15))] : [], place: flat(0, 0, 0) });
    for (let i = 0; i < layers; i++) parts.push({ id: `ring${i + 1}`, name: `Ring ${i + 1}`, outer: ring.outer, holes: ring.holes.map((h) => h), place: flat(0, 0, T * (i + 1)) });
    centre = [Rb, Rb];
    size3 = [2 * Rb, 2 * Rb, T * (layers + 1)];
    stats.push({ label: "Outside", value: `${r1(2 * Rb)} × ${r1(2 * Rb)} × ${r1(T * (layers + 1))} mm` }, { label: "Rings", value: `${layers} on the base` });
    assembly.push("Glue the rings on the base one at a time, lining up their edges (and their openings).");
  }

  // The coasters, stacked in the holder.
  let loading = false, missing: string[] = [], sizes = {};
  if (s.set) {
    const outline = coasterOutline(p);
    const art = hasArt(p) ? lidArt(p, ctx) : null;
    const marks = [...decoration(s.deco, outline, size, !!art), ...(art ? engraveOn(p, art, outline, size / 2, size / 2) : [])];
    for (let i = 0; i < count; i++) {
      const part: GenPart = { id: `coaster${i + 1}`, name: `Coaster ${i + 1}`, outer: outline, holes: [], place: flat(centre[0] - size / 2, centre[1] - size / 2, floorZ + i * T) };
      if (marks.length) markLid(part, p, marks);
      parts.push(part);
    }
    if (art) {
      loading = art.loading; missing = art.missing;
      sizes = { textWidth: art.w, textRoom: size * (s.shape === "round" ? 0.68 : 0.8), artHeight: art.h, artRoom: size * (s.shape === "round" ? 0.6 : 0.75) };
    }
    assembly.push(`Cut the ${count} coasters from the same sheet; seal them with oil or varnish so drinks do not mark them.`);
  }
  stats.push({ label: "Coasters", value: `${count} × ${s.shape === "round" ? "⌀" : ""}${r1(size)} mm${s.shape === "square" ? " square" : ""}, ${r1(tc)} mm thick` });
  return {
    parts, stats, assembly,
    notice: loading ? "Loading the font." : undefined,
    missing,
    info: { size: size3, ...sizes },
  };
}
