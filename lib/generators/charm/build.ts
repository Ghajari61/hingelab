/**
 * Name Charms: one blank per name (or the welded name itself), with its hanging hole or loop, the
 * name fitted inside the blank's safe area, and the extra parts each kind needs: a clip round a
 * glass stem, a slotted foot for a place card, a strap slot for a bag tag.
 *
 * Engineering rules:
 * - A hole keeps `wall` of material all round it, measured to the real outline (it moves inwards
 *   on stars and hearts until it has it); a loop is a ring of the same wall on the outline.
 * - The name never runs closer than `margin` to the edge, nor into the hole's keep-out; it shrinks
 *   from its set height to fit, and the checks say when it gets too small to read.
 * - A glass clip's arms flex open by half the difference between the stem and the opening; the
 *   root strain (a curved cantilever, ε ≈ 1.5·w·δ/L²) is checked against the stock.
 */
import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, distToContour, ellipse, pointInContour, rect, roundedRect, signedArea, stadium, transform } from "../geom";
import { tagMarks } from "../items";
import { material2 } from "../material2";
import { motif } from "../motifs";
import { motifRef } from "../motifRef";
import { fitBox, orient, orientHole, shapeOutline, type ShapeKind } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock, weld } from "../weld";
import { overlapScores } from "../weldScore";
import { charmNames, type CharmParams } from "./params";
import { characterIn, isCharacter, type Character } from "./characters";

export interface CharmInfo {
  count: number;
  /** One charm's size, mm. */
  width: number;
  height: number;
  /** Smallest letter height the names were fitted at, mm (0: no names). */
  letter: number;
  /** A name had to shrink below half its set height. */
  squeezed: string[];
  /** Hole: the wall it really has, mm (smallest over the charms). */
  wall: number;
  /** Earrings: weight of one, g. */
  grams: number;
  /** Drink markers: strain at the clip arm's root as it opens, and what the stock takes. */
  clipStrain: number;
  allowed: number;
  /** Card holders: how far the card shows above the pocket (negative: below the edge), and the narrowest arm round the pocket, mm. */
  card: number;
  arm: number;
  /** Smallest words on a dangle, mm (Infinity: none). */
  dangleLetter: number;
}

export type CharmOutput = GenOutput & { info?: CharmInfo };

const r1 = (v: number) => Math.round(v * 10) / 10;
const closed = (c: Contour): Contour => [...c, c[0]];
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const scaleAbout = (cs: Contour[], s: number) => cs.map((c) => c.map(([x, y]) => [x * s, y * s] as Pt));
const largest = (ss: Shape[]): Shape | null => (ss.length ? ss.reduce((a, b) => (b.area > a.area ? b : a)) : null);

/** Surface strain the stock takes before it cracks (fraction). */
export function charmStrainLimit(p: CharmParams): number {
  const m = `${p.material} ${MATERIALS[p.material]?.name ?? ""}`.toLowerCase();
  if (/leather|felt|cork/.test(m)) return 0.08;
  if (/acr|mirror|perspex|plexi/.test(m)) return 0.006;
  if (/mdf|card/.test(m)) return 0.004;
  return 0.01;
}

/** Density of the stock, g/cm³. */
export function charmDensity(p: CharmParams): number {
  const m = `${p.material} ${MATERIALS[p.material]?.name ?? ""}`.toLowerCase();
  if (/acr|mirror|perspex|plexi/.test(m)) return 1.19;
  if (/mdf/.test(m)) return 0.75;
  if (/leather/.test(m)) return 0.9;
  if (/felt/.test(m)) return 0.3;
  if (/cork/.test(m)) return 0.25;
  if (/card|paper/.test(m)) return 0.8;
  return 0.68;
}

/** A teardrop with its point at the top, in a w × h box. */
function teardrop(w: number, h: number): Contour {
  const pts: Contour = [];
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    pts.push([Math.sin(t) * Math.pow(Math.sin(t / 2), 1.3), -Math.cos(t)]);
  }
  return fitBox(pts, w, h);
}

/** A bauble: a round body under a small cap. */
function bauble(w: number, h: number): Contour {
  const d = Math.min(w, h * 0.86), capH = Math.max(h - d, d * 0.12), capW = d * 0.3;
  const body = ellipse(w / 2, h - d / 2, d / 2, d / 2, 96);
  const cap = roundedRect(w / 2 - capW / 2, h - d - capH + d * 0.04, capW, capH + d * 0.08, Math.min(capW, capH) * 0.25);
  return largest(unionShapes([orient(body), orient(cap)]))!.outer;
}

/** A dog bone, lying across. */
function bone(w: number, h: number): Contour {
  const r = h * 0.29, mid = h * 0.5;
  const cs = [circle(r, r, r), circle(r, h - r, r), circle(w - r, r, r), circle(w - r, h - r, r), rect(r, (h - mid) / 2, w - 2 * r, mid)].map(orient);
  return largest(unionShapes(cs))!.outer;
}

/** The blank's outline in a w × h box (y down), or null while a custom motif waits. */
export function blankOutline(p: CharmParams, ctx: BuildContext, missing: string[]): { outer: Contour | null; loading: boolean } {
  const s = p.shape, w = s.width, h = s.height;
  switch (s.kind) {
    case "teardrop": return { outer: orient(teardrop(w, h)), loading: false };
    case "bauble": return { outer: orient(bauble(w, h)), loading: false };
    case "bone": return { outer: orient(bone(w, h)), loading: false };
    case "snowman": case "reindeer": case "cat": case "gingerbread": return { outer: orient(characterIn(s.kind, w, h, s.hat).outline), loading: false };
    case "motif": {
      const m = motifRef(s.motif, s.art, ctx, missing);
      if (m.loading) return { outer: null, loading: true };
      const ref = m.ref ?? "heart";
      const cs = motif(ref, 100);
      const b = bboxOf(cs), k = Math.min(w / (b.x1 - b.x0), h / (b.y1 - b.y0));
      const fitted = cs.map((c) => transform(c, { x: -b.x0 * k + (w - (b.x1 - b.x0) * k) / 2, y: -b.y0 * k + (h - (b.y1 - b.y0) * k) / 2, sx: k, sy: k }));
      const sil = weld(fitted, { border: Math.max(0.8, Math.min(w, h) * 0.02), solid: true });
      return { outer: sil ? orient(sil.outer) : null, loading: false };
    }
    default: return { outer: orient(shapeOutline(s.kind as ShapeKind, w, h, s.corner)), loading: false };
  }
}

/** Material from `q` to the outline (negative outside). */
function clearance(q: Pt, outer: Contour): number {
  const d = distToContour(q, outer);
  return pointInContour(q, outer) ? d : -d;
}

/**
 * Where a hole of radius r keeps `wall` all round, searching inwards from the top (or left) edge
 * along the centre line, and the wall it gets (less than asked only when the blank is too small).
 */
export function holeSpot(outer: Contour, side: Side, r: number, wall: number): { at: Pt; wall: number } {
  const b = bboxOf([outer]);
  const need = r + wall;
  let best: { at: Pt; c: number } = { at: [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2], c: -Infinity };
  const span = side === "left" || side === "right" ? b.x1 - b.x0 : b.y1 - b.y0;
  for (let t = 0; t <= span * 0.6; t += 0.2) {
    const q = along(b, side, t);
    const c = clearance(q, outer);
    if (c >= need) return { at: q, wall };
    if (c > best.c) best = { at: q, c };
  }
  return { at: best.at, wall: Math.max(0, best.c - r) };
}

type Side = "top" | "left" | "bottom" | "right";

/** A point `t` in from one edge of a box, on its centre line. */
function along(b: { x0: number; y0: number; x1: number; y1: number }, side: Side, t: number): Pt {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return side === "top" ? [cx, b.y0 + t] : side === "bottom" ? [cx, b.y1 - t] : side === "right" ? [b.x1 - t, cy] : [b.x0 + t, cy];
}

/** The outline's first point along the centre line from the top (or left). */
function edgeAt(outer: Contour, side: "top" | "left"): Pt {
  const b = bboxOf([outer]);
  for (let t = 0; t <= (side === "top" ? b.y1 - b.y0 : b.x1 - b.x0); t += 0.1) {
    const q = along(b, side, t);
    if (pointInContour(q, outer)) return q;
  }
  return along(b, side, 0);
}

/** Kinds that hang from a hole or loop (bag tags use their strap slot, markers their clip, cards stand). */
export const hangs = (p: CharmParams) => p.kind.kind !== "drink" && p.kind.kind !== "placecard" && p.kind.kind !== "bagtag";

interface Hung { shape: Shape; hole: Contour | null; keep: Contour | null; wall: number }

/** Adds the hanging hole (inside) or loop (a ring on the edge) to a blank. */
export function hang(p: CharmParams, blank: Shape): Hung {
  const h = p.hang, r = h.hole / 2;
  if (h.kind === "none" || !hangs(p)) return { shape: blank, hole: null, keep: null, wall: Infinity };
  if (h.kind === "hole") {
    const spot = holeSpot(blank.outer, h.side, r, h.wall);
    const hole = orientHole(circle(spot.at[0], spot.at[1], r));
    return { shape: makeShape(blank.outer, [...blank.holes, hole]), hole, keep: orient(circle(spot.at[0], spot.at[1], r + Math.max(h.wall, 1.5) + 0.5)), wall: spot.wall };
  }
  // A loop: a ring of `wall` round the hole, its inner edge just clear of the outline, joined by a neck.
  const R = r + h.wall, e = edgeAt(blank.outer, h.side);
  const c: Pt = h.side === "top" ? [e[0], e[1] - r - h.wall * 0.35] : [e[0] - r - h.wall * 0.35, e[1]];
  const ring = orient(circle(c[0], c[1], R));
  const neck = orient(h.side === "top" ? rect(c[0] - R * 0.7, c[1], R * 1.4, R + h.wall) : rect(c[0], c[1] - R * 0.7, R + h.wall, R * 1.4));
  const body = largest(unionShapes([blank.outer, ring, neck]))!;
  const hole = orientHole(circle(c[0], c[1], r));
  return { shape: makeShape(body.outer, [...blank.holes, hole]), hole, keep: orient(circle(c[0], c[1], R + 0.5)), wall: h.wall };
}

interface Content { cs: Contour[]; blocks: { item: string; cs: Contour[] }[]; w: number; h: number; glyphs: Contour[][] }

/** The name, its second line and the accent motif as one block centred on (0, 0), at full size. */
function content(p: CharmParams, ctx: BuildContext, name: string, missing: string[]): { c: Content | null; loading: boolean } {
  const style = { ...p.textStyle, ...p.textForm };
  const t = name ? textBlock(ctx, name, p.names.fontId, p.names.size, { spacing: p.names.spacing, missing, style }) : { contours: [], width: 0, height: 0, loading: false };
  const subH = (p.names.size * p.names.subSize) / 100;
  const s = p.names.sub.trim() && p.style.kind !== "letters" ? textBlock(ctx, p.names.sub, p.names.subFontId, subH, { missing }) : { contours: [], width: 0, height: 0, loading: false };
  const a = p.accent.kind !== "none" && p.style.kind !== "letters" ? motifRef(p.accent.kind, p.accent.art, ctx, missing) : { ref: null, loading: false };
  if (t.loading || s.loading || a.loading) return { c: null, loading: true };
  let nameCs = t.contours, subCs: Contour[] = [], acc: Contour[] = [];
  if (s.contours.length) {
    const gap = subH * 0.45;
    subCs = move(s.contours, 0, t.height / 2 + gap + s.height / 2);
  }
  if (a.ref) {
    const size = p.accent.size, base = [...nameCs, ...subCs];
    const b = base.length ? bboxOf(base) : { x0: 0, x1: 0, y0: 0, y1: 0 };
    const m = motif(a.ref, size);
    const mb = bboxOf(m), mw = mb.x1 - mb.x0, mh = mb.y1 - mb.y0, g = Math.max(1, p.names.size * 0.25);
    const at: Pt = !base.length ? [0, 0]
      : p.accent.place === "left" ? [b.x0 - g - mw / 2, (b.y0 + b.y1) / 2]
      : p.accent.place === "below" ? [(b.x0 + b.x1) / 2, b.y1 + g + mh / 2]
      : [(b.x0 + b.x1) / 2, b.y0 - g - mh / 2];
    acc = move(m, at[0] - (mb.x0 + mb.x1) / 2, at[1] - (mb.y0 + mb.y1) / 2);
  }
  const all = [...nameCs, ...subCs, ...acc];
  if (!all.length) return { c: null, loading: false };
  const b = bboxOf(all), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const sh = (cs: Contour[]) => move(cs, -cx, -cy);
  nameCs = sh(nameCs); subCs = sh(subCs); acc = sh(acc);
  const glyphs = ("glyphs" in t && t.glyphs ? t.glyphs : []).map(sh);
  return {
    c: { cs: [...nameCs, ...subCs, ...acc], blocks: [{ item: "Name", cs: nameCs }, { item: "Second line", cs: subCs }, { item: "Motif", cs: acc }], w: b.x1 - b.x0, h: b.y1 - b.y0, glyphs },
    loading: false,
  };
}

/** Points to test a block with (at most about 600). */
function samples(cs: Contour[]): Pt[] {
  const n = cs.reduce((s, c) => s + c.length, 0), step = Math.max(1, Math.floor(n / 360));
  const out: Pt[] = [];
  for (const c of cs) for (let i = 0; i < c.length; i += step) out.push(c[i]);
  return out;
}

/**
 * The largest scale (≤ 1) and centre at which the block sits inside the safe area: the blank shrunk
 * by the margin, minus the hole's keep-out. Tries a few heights so a top hole pushes the name down.
 */
export function fitContent(cs: Contour[], blank: Shape, keep: Contour | Contour[] | null, margin: number): { s: number; at: Pt } {
  const keeps = !keep ? [] : Array.isArray(keep[0]?.[0]) ? (keep as Contour[]) : [keep as Contour];
  const safe = largest(keeps.length ? differenceShapes(shapeContours(offsetShapes([makeShape(blank.outer, [])], -margin)), keeps) : offsetShapes([makeShape(blank.outer, [])], -margin));
  if (!safe) return { s: 0, at: [0, 0] };
  // The safe outline thinned to a few hundred points: the margin hides the difference.
  const thin = (c: Contour) => { const k = Math.max(1, Math.floor(c.length / 320)); return k === 1 ? c : c.filter((_, i) => i % k === 0); };
  const so = thin(safe.outer), sh = safe.holes.map(thin);
  const inside = (q: Pt) => pointInContour(q, so) && !sh.some((h) => pointInContour(q, h));
  const pts = samples(cs), sb = bboxOf([safe.outer]);
  const cx = (sb.x0 + sb.x1) / 2, cy = (sb.y0 + sb.y1) / 2, H = sb.y1 - sb.y0, W = sb.x1 - sb.x0;
  let best = { s: 0, at: [cx, cy] as Pt };
  const centres: Pt[] = [[cx, cy], [cx, cy - H * 0.06], [cx, cy + H * 0.06], [cx, cy + H * 0.12], [cx - W * 0.06, cy], [cx + W * 0.06, cy]];
  for (const at of centres) {
    if (!inside(at)) continue;
    const ok = (s: number) => pts.every(([x, y]) => inside([at[0] + x * s, at[1] + y * s]));
    if (ok(1)) return { s: 1, at };
    if (best.s > 0 && !ok(best.s)) continue;
    let lo = best.s, hi = 1;
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    if (lo > best.s) best = { s: lo, at };
  }
  return best;
}

/** The clip round a glass stem, on top of the charm: a ring with an opening, joined to the blank. */
function withClip(p: CharmParams, blank: Shape): { shape: Shape; strain: number } {
  const c = p.clip, ri = c.stem / 2, ro = ri + c.ring, e = edgeAt(blank.outer, "top");
  const cy = e[1] - ri - c.ring * 0.55;
  const ring = orient(circle(e[0], cy, ro));
  const neck = orient(rect(e[0] - ro * 0.6, cy, ro * 1.2, ro));
  const body = unionShapes([blank.outer, ring, neck]);
  const cut = [orient(circle(e[0], cy, ri)), orient(rect(e[0] - c.opening / 2, cy - ro - 2, c.opening, ro + 2))];
  let s = largest(differenceShapes(shapeContours(body), cut))!;
  // Round the sharp lips of the opening so the clip slides on.
  s = largest(offsetShapes(offsetShapes([s], -0.4), 0.4)) ?? s;
  // Each arm opens by half the difference; the arm runs from the opening round to the neck.
  const delta = Math.max(0, (c.stem - c.opening) / 2), L = Math.PI * (ri + c.ring / 2) * 0.75;
  return { shape: makeShape(s.outer, [...blank.holes, ...s.holes]), strain: (1.5 * c.ring * delta) / (L * L) };
}

/** Kinds that can carry a dangle under them. */
export const dangles = (p: CharmParams) => p.dangle.on && (p.kind.kind === "ornament" || p.kind.kind === "keychain" || p.kind.kind === "gifttag");

/** The small tag that hangs under a charm: its shape with a hole at the top and its words engraved. */
function dangleTag(p: CharmParams, ctx: BuildContext, missing: string[]): { part: GenPart | null; wall: number; letter: number; loading: boolean } {
  const d = p.dangle, s = d.size;
  const tall = d.shape === "teardrop" ? 1.45 : d.shape === "bauble" ? 1.15 : d.shape === "pill" || d.shape === "tag" || d.shape === "banner" || d.shape === "bone" ? 0.55 : 1;
  const o = blankOutline({ ...p, shape: { ...p.shape, kind: d.shape as CharmParams["shape"]["kind"], width: s, height: s * tall, corner: Math.min(p.shape.corner, s * 0.1) } }, ctx, missing);
  if (!o.outer) return { part: null, wall: Infinity, letter: 0, loading: o.loading };
  // A loop on its top edge keeps the whole little face for the words.
  const wall = Math.min(p.hang.wall, 2.5);
  const h = hang({ ...p, kind: { kind: "ornament" }, hang: { kind: "loop", side: "top", hole: d.hole, wall } }, makeShape(o.outer, []));
  const blank = h.shape;
  const spot = { wall: h.wall };
  let engrave: Contour[] | undefined, letter = 0;
  if (d.text.trim()) {
    const t = textBlock(ctx, d.text, p.names.subFontId, s * 0.3, { missing });
    if (t.loading) return { part: null, wall: Infinity, letter: 0, loading: true };
    const fit = fitContent(t.contours, makeShape(o.outer, []), h.keep, Math.max(1.5, s * 0.08));
    if (fit.s > 0) { engrave = shapeContours(unionShapes(move(scaleAbout(t.contours, fit.s), fit.at[0], fit.at[1]))); letter = s * 0.3 * fit.s; }
  }
  return { part: { id: "dangle", name: "Dangle", outer: blank.outer, holes: blank.holes, ...(engrave ? { engrave } : {}) }, wall: spot.wall, letter, loading: false };
}

/**
 * A gift card holder: four layers glued in order. The back carries the hanging loop; the spacer is
 * the back's outline with a pocket open at the top, as wide as the card plus the clearance; the
 * front has a window a lip smaller than the pocket, so the card cannot fall out forwards; the name,
 * welded in the second material, crosses the front's lower edge. A thumb notch in the spacer and
 * front lets you push the card up when it sits below the edge.
 */
function cardHolder(p: CharmParams, outer: Contour, c: Content | null, id: string, label: string, at: { x: number; y: number; z: number }) {
  const W = p.shape.width, H = p.shape.height, k = p.card;
  const pw = k.width + 2 * k.clearance, arm = (W - pw) / 2;
  const depth = H - arm;
  const show = k.height + k.clearance - depth;
  const pocket = orient(rect(arm, -10, pw, depth + 10));
  const blank = makeShape(outer, []);
  const back = hang({ ...p, kind: { kind: "ornament" }, hang: { ...p.hang, kind: p.hang.kind === "none" ? "none" : "loop", side: "top" } }, blank);
  const notch = show < 10 ? [orient(circle(W / 2, 0, Math.min(10, pw * 0.15)))] : [];
  const top = Math.max(k.lip, notch.length ? 12 : k.lip);
  const window = orient(roundedRect(arm + k.lip, top, pw - 2 * k.lip, depth - k.lip - top, 2));
  const spacer = largest(differenceShapes([outer], [pocket, ...notch]));
  const frontShape = largest(differenceShapes([outer], [window, ...notch]));
  const parts: GenPart[] = [
    { id: `${id}-back`, name: `${label} back`, outer: back.shape.outer, holes: back.shape.holes, place: { ...at, z: 0 } },
  ];
  if (spacer) parts.push({ id: `${id}-spacer`, name: `${label} pocket`, outer: spacer.outer, holes: spacer.holes, place: { ...at, z: p.T } });
  if (frontShape) parts.push({ id: `${id}-front`, name: `${label} front`, outer: frontShape.outer, holes: frontShape.holes, score: [closed(roundedRect(arm + k.lip - 1.5, top - 1.5, pw - 2 * k.lip + 3, depth - k.lip - top + 3, 3))], place: { ...at, z: 2 * p.T } });
  let letter = 0;
  if (c) {
    // The name sits across the lower part of the front, over the window's bottom edge.
    const keep = orient(rect(-10, -10, W + 20, H * 0.5 + 10));
    const fit = fitContent(c.cs, blank, keep, p.shape.margin);
    if (fit.s > 0) {
      const placed = move(scaleAbout(c.cs, fit.s), fit.at[0], fit.at[1]);
      const word = weld(placed, { border: Math.max(0.3, p.style.weld), minHole: 2, bridge: Math.max(2, p.style.weld * 3) });
      if (word) {
        const sc = overlapScores(c.glyphs.map((g) => move(scaleAbout(g, fit.s), fit.at[0], fit.at[1])));
        parts.push({ id: `${id}-name`, name: `${label} name`, outer: word.outer, holes: word.holes, ...(sc.length ? { score: sc } : {}), material: "second", place: { ...at, z: 3 * p.T } });
      }
      letter = p.names.size * fit.s;
    }
  }
  return { parts, wall: back.wall, show, arm: Math.min(arm, H - depth), letter };
}

const KIND_NAMES: Record<CharmParams["kind"]["kind"], string> = {
  ornament: "Ornament", keychain: "Keychain", earrings: "Earring", bagtag: "Bag tag", drink: "Drink marker", placecard: "Place card", gifttag: "Gift tag", cardholder: "Card holder",
};

export function buildCharm(p: CharmParams, ctx: BuildContext): CharmOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const missing: string[] = [];
  const names = charmNames(p);
  if (!names.length) return { parts: [], stats: [], error: "Type at least one name." };
  if (names.length > 200) return { parts: [], stats: [], error: "At most 200 charms in one file; split the list." };
  const kind = p.kind.kind, letters = p.style.kind === "letters";
  const slotW = p.T + p.stand.clearance;
  const info: CharmInfo = { count: 0, width: 0, height: 0, letter: Infinity, squeezed: [], wall: Infinity, grams: 0, clipStrain: 0, allowed: charmStrainLimit(p), card: 0, arm: Infinity, dangleLetter: Infinity };
  const m2 = material2(p.mat.mat2);
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });
  const parts: GenPart[] = [];
  const base = letters ? { outer: null, loading: false } : blankOutline(p, ctx, missing);
  if (base.loading) return { parts: [], stats: [], notice: "Loading the font." };
  if (!letters && !base.outer) return { parts: [], stats: [], error: "Pick a shape or a motif for the charm." };

  const pair = kind === "earrings" ? 2 : 1;
  const char: Character | null = !letters && isCharacter(p.shape.kind) ? characterIn(p.shape.kind, p.shape.width, p.shape.height, p.shape.hat) : null;
  const cols = Math.max(1, Math.ceil(Math.sqrt(names.length * pair)));
  let slotN = 0, loading = false, cellW = 0, cellH = 0;
  const at = (w: number, h: number) => {
    cellW = Math.max(cellW, w + 10); cellH = Math.max(cellH, h + 10);
    const i = slotN++;
    return { x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH, z: 0 };
  };

  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const cn = content(p, ctx, name, missing);
    if (cn.loading) { loading = true; continue; }
    const label = `${KIND_NAMES[kind]}${name ? ` ${name}` : ` ${n + 1}`}${names.filter((x) => x === name).length > 1 ? ` ${n + 1}` : ""}`;
    const id = `charm-${n + 1}`;

    if (letters) {
      // The welded name is the charm; a loop (or a hole in a ring) hangs it.
      if (!cn.c) continue;
      const word = weld(cn.c.cs, { border: Math.max(0.3, p.style.weld), minHole: 2, bridge: Math.max(2.5, p.style.weld * 3) });
      if (!word) continue;
      let back = p.style.backing > 0 ? weld(cn.c.cs, { border: p.style.backing + p.style.weld, solid: true }) : word;
      if (!back) continue;
      const hung = hang({ ...p, hang: { ...p.hang, kind: p.hang.kind === "none" ? "none" : "loop" } }, back);
      back = hung.shape;
      info.wall = Math.min(info.wall, hung.wall);
      const b = bboxOf([back.outer]);
      const place = at(b.x1 - b.x0, b.y1 - b.y0);
      info.letter = Math.min(info.letter, p.names.size);
      info.width = Math.max(info.width, b.x1 - b.x0); info.height = Math.max(info.height, b.y1 - b.y0);
      // Weld and score: where script letters overlap, the edge is scored so each letter still reads.
      const scores = overlapScores(cn.c.glyphs);
      const sc = scores.length ? { score: scores } : {};
      parts.push({ id, name: p.style.backing > 0 ? `${label} back` : label, outer: back.outer, holes: back.holes, ...(p.style.backing > 0 ? {} : sc), place });
      if (p.style.backing > 0) parts.push(second({ id: `${id}-front`, name: `${label} letters`, outer: word.outer, holes: word.holes, ...sc, place: { ...place, z: p.T } }));
      info.count++;
      continue;
    }

    if (kind === "cardholder") {
      const c = cardHolder(p, base.outer!, cn.c, id, label, at(p.shape.width, p.shape.height));
      parts.push(...c.parts.map((pt) => (pt.material === "second" ? second(pt) : pt)));
      info.wall = Math.min(info.wall, c.wall);
      info.card = c.show;
      info.arm = Math.min(info.arm, c.arm);
      if (name && c.letter) info.letter = Math.min(info.letter, c.letter);
      info.width = Math.max(info.width, p.shape.width); info.height = Math.max(info.height, p.shape.height);
      info.count++;
      continue;
    }

    let blank = makeShape(base.outer!, []);
    let strain = 0;
    if (kind === "drink") { const c = withClip(p, blank); blank = c.shape; strain = c.strain; }
    let hung = hang(p, blank);
    // A bag tag's strap slot, near the top (or left) edge, kept clear like a hole.
    if (kind === "bagtag") {
      const sl = p.strap, spot = holeSpot(hung.shape.outer, p.hang.side, sl.width / 2, p.hang.wall);
      const slot = p.hang.side === "top"
        ? stadium(spot.at[0] - sl.length / 2 + sl.width / 2, spot.at[1], spot.at[0] + sl.length / 2 - sl.width / 2, spot.at[1], sl.width)
        : stadium(spot.at[0], spot.at[1] - sl.length / 2 + sl.width / 2, spot.at[0], spot.at[1] + sl.length / 2 - sl.width / 2, sl.width);
      const keep = orient(p.hang.side === "top"
        ? rect(spot.at[0] - sl.length / 2 - 2, spot.at[1] - sl.width / 2 - 2, sl.length + 4, sl.width + p.hang.wall + 4)
        : rect(spot.at[0] - sl.width / 2 - 2, spot.at[1] - sl.length / 2 - 2, sl.width + p.hang.wall + 4, sl.length + 4));
      hung = { shape: makeShape(hung.shape.outer, [...hung.shape.holes, orientHole(slot)]), hole: slot, keep, wall: Math.min(hung.wall, spot.wall) };
    }
    if (kind === "drink") {
      // The clip ring sits above the blank: keep the name off its neck.
      const b = bboxOf([base.outer!]);
      hung = { ...hung, keep: hung.keep ?? orient(rect(b.x0, b.y0 - 50, b.x1 - b.x0, 50 + p.clip.ring)) };
    }
    // A dangle: a hole at the bottom, and a small tag that hangs from it on a jump ring.
    let dangle: GenPart | null = null;
    const keeps: Contour[] = hung.keep ? [hung.keep] : [];
    if (dangles(p)) {
      const r = p.dangle.hole / 2, wall = Math.min(p.hang.wall, 2.5);
      // Opposite the hanging hole: under a charm hung from the top, at the far end of one hung from the left.
      const spot = holeSpot(hung.shape.outer, p.hang.side === "left" ? "right" : "bottom", r, wall);
      hung = { ...hung, shape: makeShape(hung.shape.outer, [...hung.shape.holes, orientHole(circle(spot.at[0], spot.at[1], r))]) };
      keeps.push(orient(circle(spot.at[0], spot.at[1], r + wall + 0.5)));
      info.wall = Math.min(info.wall, spot.wall);
      const d = dangleTag(p, ctx, missing);
      if (d.loading) loading = true;
      if (d.part) { dangle = d.part; info.wall = Math.min(info.wall, d.wall); if (d.letter) info.dangleLetter = Math.min(info.dangleLetter, d.letter); }
    }
    info.wall = Math.min(info.wall, hung.wall);
    if (strain > info.clipStrain) info.clipStrain = strain;

    // A place card stands on a slotted foot: a slot up from the bottom middle, the foot's from its top.
    let card = hung.shape;
    let foot: Shape | null = null;
    if (kind === "placecard") {
      const b = bboxOf([card.outer]);
      const footH = Math.max(14, Math.min(28, (b.y1 - b.y0) * 0.5)), slotL = footH / 2;
      const cx = (b.x0 + b.x1) / 2;
      card = largest(differenceShapes(shapeContours([card]), [orient(rect(cx - slotW / 2, b.y1 - slotL, slotW, slotL + 2))])) ?? card;
      const fw = p.stand.depth;
      const f = differenceShapes([orient(roundedRect(0, 0, fw, footH, Math.min(4, footH * 0.2)))], [orient(rect(fw / 2 - slotW / 2, -2, slotW, slotL + 2))]);
      foot = largest(f);
    }

    // The cell holds the charm and what goes with it: a foot under a card, a dangle below or beside.
    const dw = dangle ? p.dangle.size + 8 : 0;
    const placeAt = (() => { const b = bboxOf([card.outer]); return at(b.x1 - b.x0 + (dangle && p.hang.side === "left" ? dw : 0), b.y1 - b.y0 + (foot ? 20 : 0) + (dangle && p.hang.side !== "left" ? dw : 0)); })();
    const marks: Pick<GenPart, "engrave" | "score"> = {};
    let holes = card.holes;
    let front: Shape | null = null;
    let frontScore: Contour[] = [];
    if (cn.c) {
      // A character's name goes in its own area (the snowman's belly, the reindeer's muzzle), clear of its nose and buttons.
      if (char) for (const pc of char.pieces) { const g = largest(offsetShapes(unionShapes([orient(pc.c)]), 1.2)); if (g) keeps.push(g.outer); }
      const fit = fitContent(cn.c.cs, makeShape(char ? orient(char.fit) : card.outer, []), keeps, char ? Math.min(p.shape.margin, 2) : p.shape.margin);
      if (fit.s > 0) {
        const placed = move(scaleAbout(cn.c.cs, fit.s), fit.at[0], fit.at[1]);
        const blocks = cn.c.blocks.map((bk) => ({ item: bk.item, cs: move(scaleAbout(bk.cs, fit.s), fit.at[0], fit.at[1]) }));
        if (name) {
          const h = p.names.size * fit.s;
          info.letter = Math.min(info.letter, h);
          if (fit.s < 0.5 && !info.squeezed.includes(name)) info.squeezed.push(name);
        }
        const u = shapeContours(unionShapes(placed));
        switch (p.style.kind) {
          case "engrave": Object.assign(marks, tagMarks({ engrave: u }, blocks)); break;
          case "score": Object.assign(marks, tagMarks({ score: u.map(closed) }, blocks)); break;
          case "cutout": {
            // Cut-through letters: their outer outlines become holes; the middles of O, A, B fall out
            // unless stencil bridges are on.
            const outs = unionShapes(placed).map((s) => orientHole(s.outer));
            holes = [...holes, ...outs];
            break;
          }
          case "layered":
            front = weld(placed, { border: Math.max(0.3, p.style.weld), minHole: 2, bridge: Math.max(2, p.style.weld * 3) });
            frontScore = overlapScores(cn.c.glyphs.map((g) => move(scaleAbout(g, fit.s), fit.at[0], fit.at[1])));
            break;
        }
      } else if (name && !info.squeezed.includes(name)) info.squeezed.push(name);
    }
    if (char) {
      marks.engrave = [...(marks.engrave ?? []), ...char.engrave.map(orient)];
      marks.score = [...(marks.score ?? []), ...char.score];
    }
    if (p.shape.frame && p.style.kind !== "cutout" && !char) {
      const ring = offsetShapes([makeShape(base.outer!, [])], -Math.max(1.2, Math.min(p.shape.width, p.shape.height) * 0.035));
      marks.score = [...(marks.score ?? []), ...shapeContours(ring).map(closed)];
    }
    const b = bboxOf([card.outer]);
    info.width = Math.max(info.width, b.x1 - b.x0); info.height = Math.max(info.height, b.y1 - b.y0);
    const area = Math.abs(signedArea(card.outer)) - holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0);
    if (kind === "earrings") info.grams = Math.max(info.grams, (area * p.T * charmDensity(p)) / 1000);

    for (let k = 0; k < pair; k++) {
      const side = pair > 1 ? (k === 0 ? " left" : " right") : "";
      const pl = k === 0 ? placeAt : at(b.x1 - b.x0, b.y1 - b.y0);
      const pid = pair > 1 ? `${id}-${k === 0 ? "l" : "r"}` : id;
      const upright = kind === "placecard";
      // Standing cards: the frame's y runs down from height -place.y, so the bottom edge meets the floor.
      const place = upright ? { x: pl.x, y: -b.y1, z: pl.y, upright: true } : pl;
      parts.push({ id: pid, name: `${label}${side}`, outer: card.outer, holes, ...marks, ...(upright ? { upright: true } : {}), place });
      if (front) parts.push(second({ id: `${pid}-front`, name: `${label}${side} letters`, outer: front.outer, holes: front.holes, ...(frontScore.length ? { score: frontScore } : {}), place: { ...pl, z: p.T } }));
    }
    if (char && p.shape.paint) {
      // The hat, nose and buttons cut on their own, to paint or cut in another colour and glue in place.
      char.pieces.forEach((pc, i) => parts.push({ id: `${id}-piece-${i + 1}`, name: `${label} ${pc.name.toLowerCase()}`, outer: orient(pc.c), holes: [], place: { ...placeAt, z: p.T } }));
    }
    if (dangle) {
      const db = bboxOf([dangle.outer]);
      const right = p.hang.side === "left";
      parts.push({ ...dangle, id: `${id}-dangle`, name: `${label} dangle`, place: right
        ? { x: placeAt.x + b.x1 + 6 - db.x0, y: placeAt.y + (b.y0 + b.y1) / 2 - (db.y0 + db.y1) / 2, z: 0 }
        : { x: placeAt.x + (b.x0 + b.x1) / 2 - (db.x0 + db.x1) / 2, y: placeAt.y + b.y1 + 6 - db.y0, z: 0 } });
    }
    if (foot) {
      const fb = bboxOf([foot.outer]);
      // The foot runs across the card (its x along +y on plan), its slot on the card's plane.
      const cx = (b.x0 + b.x1) / 2;
      parts.push({ id: `${id}-foot`, name: `${label} foot`, outer: foot.outer, holes: foot.holes, upright: true, place: { x: placeAt.x + cx + p.T / 2, y: -fb.y1, z: placeAt.y + p.T / 2 - p.stand.depth / 2, upright: true, yaw: 90 } });
    }
    info.count++;
  }
  if (loading && !parts.length) return { parts: [], stats: [], notice: "Loading the font." };
  if (!parts.length) return { parts: [], stats: [], error: "Nothing to cut: type a name." };
  if (!Number.isFinite(info.letter)) info.letter = 0;

  const mixed = parts.some((pt) => pt.material === "second");
  const stats = [
    { label: kind === "earrings" ? "Pairs" : "Charms", value: String(info.count) },
    { label: "Each", value: `${r1(info.width)} × ${r1(info.height)} mm` },
    ...(info.letter > 0 && !letters ? [{ label: "Letters", value: `${r1(info.letter)} mm high (smallest)` }] : []),
    ...((p.hang.kind !== "none" && hangs(p)) || kind === "bagtag" ? [{ label: kind === "bagtag" ? "Strap slot" : "Hole", value: kind === "bagtag" ? `${p.strap.length} × ${p.strap.width} mm` : `Ø ${p.hang.hole} mm, ${r1(Number.isFinite(info.wall) ? info.wall : p.hang.wall)} mm wall` }] : []),
    ...(kind === "earrings" ? [{ label: "Weight", value: `${r1(info.grams)} g each` }] : []),
    ...(kind === "drink" ? [{ label: "Clip", value: `fits a ${p.clip.stem} mm stem, ${r1(info.clipStrain * 100)} % of ${r1(info.allowed * 100)} % strain` }] : []),
    ...(kind === "placecard" ? [{ label: "Slots", value: `${r1(slotW)} mm for ${p.T} mm stock` }] : []),
    ...(kind === "cardholder" ? [{ label: "Card", value: `${p.card.width} × ${p.card.height} mm, ${info.card >= 0 ? `shows ${r1(info.card)} mm above the top` : `sits ${r1(-info.card)} mm inside (thumb notch)`}` }] : []),
    ...(dangles(p) ? [{ label: "Dangle", value: `${p.dangle.size} mm ${p.dangle.shape}${p.dangle.text.trim() ? ` “${p.dangle.text}”` : ""}` }] : []),
    { label: "Parts", value: String(parts.length) },
    ...(mixed ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
  ];
  const assembly: string[] = [];
  if (p.style.kind === "engrave" || p.style.kind === "score" || p.shape.frame) assembly.push("Engrave and score first, then cut, without moving the sheet.");
  if (mixed) assembly.push(`Cut the ${MATERIALS[p.material]?.name ?? "main"} sheet, then the ${m2.name} sheet.`, "Glue each letters piece on its charm with a thin line of clear epoxy or acrylic cement; press flat for an hour.");
  if (p.style.kind === "cutout" && !p.textForm.stencil) assembly.push("The middles of letters such as O and A fall out of cut-through names; turn on stencil bridges in Text style to keep them.");
  switch (kind) {
    case "ornament": assembly.push("Thread a ribbon or ornament hook through the hole."); break;
    case "keychain": assembly.push(`Open a split ring (about ${Math.max(15, Math.round(p.hang.hole * 4))} mm) and wind it through the hole.`); break;
    case "earrings": assembly.push(`Open a ${Math.max(4, Math.round(p.hang.hole * 2.5))} mm jump ring sideways with two pliers, hook it through the hole and an earring hook, and close it the same way.`, "Seal wooden earrings with a thin coat of clear lacquer or wax so they stay light and clean."); break;
    case "bagtag": assembly.push("Loop a leather strap or luggage strap through the slot."); break;
    case "drink": assembly.push(`Press each marker sideways onto a glass stem; the opening flexes ${r1((p.clip.stem - p.clip.opening) / 2)} mm each side and grips.`); break;
    case "placecard": assembly.push("Slide each card's slot down onto its foot's slot, at right angles, until they sit flush."); break;
    case "gifttag": assembly.push("Tie the tag on with twine or ribbon through the hole."); break;
    case "cardholder": assembly.push("Glue the pocket layer on the back, keeping glue a few millimetres away from the pocket's edge so the card slides freely.", "Glue the front on the pocket layer, lined up by the outline, then the name across the front's lower edge.", "Slide the gift card in from the top."); break;
  }
  if (dangles(p)) assembly.push(`Join the dangle to the charm with a ${Math.max(5, Math.round(p.dangle.hole * 2))} mm jump ring through both holes.`);
  return {
    parts, stats, assembly, info, missing: missing.length ? missing : undefined,
    notice: loading ? "Loading the font." : undefined,
    materials: mixed ? { main: MATERIALS[p.material]?.name ?? `Main material ${p.T} mm`, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}
