/**
 * Family Names: the layouts that turn a list of names into one piece.
 *
 * - Crossword: names interlock on letter tiles (one connected group by construction); tiles touch
 *   so they weld into one piece, a backing outline or plate is optional, and the tile edges can be
 *   scored so every square reads.
 * - Tree: names sorted shortest to longest, each line sized to the triangle, welded with a star on
 *   top and a trunk carrying the year; overlaps between letters are scored.
 * - Snowflake: a name on every arm round a centre disc with the year, a small star at each tip.
 * - Ring: names round a circular plate, a word or an initial in the middle.
 * - Monogram: a big initial split by a band that carries the name.
 * - Bunting: one flag per letter, with two string holes that keep their wall.
 * A silhouette backer (tree, snowflake, monogram) is the welded piece grown by an offset, cut from
 * the main sheet, with the names on top in the second material.
 */
import { MATERIALS } from "@/lib/hinge/defaults";
import { differenceShapes, makeShape, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { bboxOf, circle, rect, roundedRect, transform } from "../geom";
import { tagMarks } from "../items";
import { material2 } from "../material2";
import { motif, type MotifRef } from "../motifs";
import { motifRef } from "../motifRef";
import { orient, orientHole } from "../shapes";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { textBlock, weld } from "../weld";
import { letterScores } from "../weldScore";
import { fitContent, hang } from "../charm/build";
import { mergeCharm } from "../charm/params";
import { crossword, tileWord } from "./crossword";
import { familyNames, type FamilyParams } from "./params";

export interface FamilyInfo {
  width: number;
  height: number;
  names: number;
  /** Names the crossword could not cross (shown in the checks). */
  skipped: string[];
  /** Smallest letters, mm. */
  letter: number;
  /** Bunting flags. */
  flags: number;
  /** Least wall round a hanging or string hole, mm. */
  wall: number;
}

export type FamilyOutput = GenOutput & { info?: FamilyInfo };

const r1 = (v: number) => Math.round(v * 10) / 10;
const closed = (c: Contour): Contour => [...c, c[0]];
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));
const scale = (cs: Contour[], s: number) => cs.map((c) => c.map(([x, y]) => [x * s, y * s] as Pt));
const largest = (ss: Shape[]): Shape | null => (ss.length ? ss.reduce((a, b) => (b.area > a.area ? b : a)) : null);
/** The outline alone: empty squares inside a crossword's backing are filled. */
const solid = (s: Shape | null): Shape | null => (s ? makeShape(s.outer, []) : null);
const centre = (cs: Contour[]) => { const b = bboxOf(cs); return { cs: move(cs, -(b.x0 + b.x1) / 2, -(b.y0 + b.y1) / 2), w: b.x1 - b.x0, h: b.y1 - b.y0 }; };

/** Hangs a piece from a loop (or hole) on its top, keeping the wall. */
function hangTop(p: FamilyParams, piece: Shape, kind = p.hang.kind): { shape: Shape; wall: number } {
  if (kind === "none") return { shape: piece, wall: Infinity };
  const q = mergeCharm({ kind: { kind: "ornament" }, hang: { kind, side: "top", hole: p.hang.hole, wall: p.hang.wall } });
  const h = hang(q, piece);
  return { shape: h.shape, wall: h.wall };
}

/** Sets text along a circle of radius R (baseline on the circle), centred on the top; centred on the circle's centre. */
function onCircle(cs: Contour[], R: number): Contour[] {
  const b = bboxOf(cs), W = b.x1 - b.x0, cx = (b.x0 + b.x1) / 2, y0 = b.y1;
  const dense = (c: Contour) => {
    const out: Contour = [];
    for (let i = 0; i < c.length; i++) {
      const a = c[i], e = c[(i + 1) % c.length], n = Math.max(1, Math.ceil(Math.hypot(e[0] - a[0], e[1] - a[1]) / Math.max(0.3, W / 900)));
      for (let k = 0; k < n; k++) out.push([a[0] + ((e[0] - a[0]) * k) / n, a[1] + ((e[1] - a[1]) * k) / n]);
    }
    return out;
  };
  return cs.map((c) => dense(c).map(([x, y]) => {
    const th = (x - cx) / R, r = R - (y - y0);
    return [r * Math.sin(th), -r * Math.cos(th)] as Pt;
  }));
}

/** The parts for a welded piece: one cut piece, or a backer with the names in the second material on top. */
function weldedParts(p: FamilyParams, piece: Shape, scores: Contour[], label: string, hangIt: boolean): { parts: GenPart[]; wall: number } {
  const m2 = material2(p.mat.mat2);
  if (!p.backer.on) {
    const h = hangIt ? hangTop(p, piece) : { shape: piece, wall: Infinity };
    return { parts: [{ id: "piece", name: label, outer: h.shape.outer, holes: h.shape.holes, score: scores.length ? scores : undefined, place: { x: 0, y: 0, z: 0 } }], wall: h.wall };
  }
  const back = largest(offsetShapes([makeShape(piece.outer, [])], p.backer.offset, "round"))!;
  const h = hangIt ? hangTop(p, back) : { shape: back, wall: Infinity };
  return {
    parts: [
      { id: "backer", name: `${label} backer`, outer: h.shape.outer, holes: h.shape.holes, place: { x: 0, y: 0, z: 0 } },
      { id: "piece", name: `${label} names`, outer: piece.outer, holes: piece.holes, score: scores.length ? scores : undefined, material: "second", color: m2.color, t: p.mat.T2, place: { x: 0, y: 0, z: p.T } },
    ],
    wall: h.wall,
  };
}

/** Text contours for a line, or null while its font loads. */
function line(ctx: BuildContext, s: string, font: string, size: number, missing: string[], spacing = 0): { cs: Contour[]; glyphs: Contour[][]; w: number; h: number } | null {
  const t = textBlock(ctx, s, font, size, { spacing, missing });
  if (t.loading) return null;
  return { cs: t.contours, glyphs: t.glyphs ?? [t.contours], w: t.width, h: t.height };
}

/** Marks a plate with contours as the chosen mark; cut-outs become holes, layered a second-material piece. */
function markPlate(p: FamilyParams, plate: Shape, cs: Contour[], blocks: { item: string; cs: Contour[] }[]): { plate: Shape; marks: Pick<GenPart, "engrave" | "score">; front: Shape | null } {
  if (!cs.length) return { plate, marks: {}, front: null };
  const u = shapeContours(unionShapes(cs));
  switch (p.mark.kind) {
    case "engrave": return { plate, marks: tagMarks({ engrave: u }, blocks), front: null };
    case "score": return { plate, marks: tagMarks({ score: u.map(closed) }, blocks), front: null };
    case "cutout": return { plate: makeShape(plate.outer, [...plate.holes, ...unionShapes(cs).map((s) => orientHole(s.outer))]), marks: {}, front: null };
    case "layered": return { plate, marks: {}, front: weld(cs, { border: 0.6, minHole: 2, bridge: 2 }) };
  }
}

export function buildFamily(p: FamilyParams, ctx: BuildContext): FamilyOutput {
  if (!(p.T > 0)) return { parts: [], stats: [], error: "Set the material thickness." };
  const missing: string[] = [];
  const names = familyNames(p);
  if (!names.length) return { parts: [], stats: [], error: "Type at least one name." };
  const info: FamilyInfo = { width: 0, height: 0, names: names.length, skipped: [], letter: Infinity, flags: 0, wall: Infinity };
  const m2 = material2(p.mat.mat2);
  const second = (pt: GenPart): GenPart => ({ ...pt, material: "second", color: m2.color, t: p.mat.T2 });
  const parts: GenPart[] = [];
  const font = p.names.fontId;
  const loadingOut = (): FamilyOutput => ({ parts: [], stats: [], notice: "Loading the font." });
  const kind = p.layout.kind;

  if (kind === "crossword") {
    const c = p.crossword, s = c.tile;
    const words = names.map((n) => tileWord(n, true)).filter(Boolean);
    const g = crossword(words);
    info.skipped = g.skipped;
    const cells = [...g.cells].map(([k, ch]) => { const [x, y] = k.split(",").map(Number); return { x: (x - g.x0) * s, y: (y - g.y0) * s, ch, gx: x, gy: y }; });
    const tiles = largest(unionShapes(cells.map((q) => orient(rect(q.x, q.y, s, s)))))!;
    let body = tiles;
    if (c.round > 0) body = largest(offsetShapes(offsetShapes([body], -c.round, "round"), c.round, "round")) ?? body;
    const letters: Contour[] = [];
    for (const q of cells) {
      const t = line(ctx, q.ch, font, (s * c.letter) / 100, missing);
      if (!t) return loadingOut();
      letters.push(...move(t.cs, q.x + s / 2, q.y + s / 2));
      info.letter = Math.min(info.letter, (s * c.letter) / 100);
    }
    // Score the edges between neighbouring tiles.
    const grid: Contour[] = [];
    if (c.grid) {
      for (const q of cells) {
        if (g.cells.has(`${q.gx + 1},${q.gy}`)) grid.push([[q.x + s, q.y + s * 0.1], [q.x + s, q.y + s * 0.9]]);
        if (g.cells.has(`${q.gx},${q.gy + 1}`)) grid.push([[q.x + s * 0.1, q.y + s], [q.x + s * 0.9, q.y + s]]);
      }
    }
    const blocks = [{ item: "Letters", cs: letters }];
    const back = c.back === "plate"
      ? (() => { const b = bboxOf([body.outer]); const top = p.hang.kind === "hole" ? p.hang.hole + 2 * p.hang.wall : 0; return makeShape(orient(roundedRect(b.x0 - c.pad, b.y0 - c.pad - top, b.x1 - b.x0 + 2 * c.pad, b.y1 - b.y0 + 2 * c.pad + top, Math.max(2, c.pad))), []); })()
      : c.back === "outline" ? solid(largest(offsetShapes([makeShape(body.outer, [])], c.pad, "round"))) : null;
    const layered = p.mark.kind === "layered";
    if (layered || !back) {
      // Tiles are their own piece: on a backing (layered) or alone.
      const m: { marks: Pick<GenPart, "engrave" | "score">; plate: Shape } = layered ? { marks: tagMarks({ engrave: shapeContours(unionShapes(letters)) }, blocks), plate: body } : markPlate(p, body, letters, blocks);
      const base = layered ? back ?? solid(largest(offsetShapes([makeShape(body.outer, [])], c.pad, "round")))! : null;
      if (base) {
        const h = hangTop(p, base, p.hang.kind === "hole" && c.back !== "plate" ? "loop" : p.hang.kind);
        info.wall = h.wall;
        parts.push({ id: "back", name: "Backing", outer: h.shape.outer, holes: h.shape.holes, place: { x: 0, y: 0, z: 0 } });
        parts.push(second({ id: "tiles", name: "Name tiles", outer: m.plate.outer, holes: m.plate.holes, ...m.marks, score: grid.length ? grid : undefined, place: { x: 0, y: 0, z: p.T } }));
      } else {
        const h = hangTop(p, m.plate, p.hang.kind === "hole" ? "loop" : p.hang.kind);
        info.wall = h.wall;
        parts.push({ id: "tiles", name: "Name crossword", outer: h.shape.outer, holes: h.shape.holes, ...m.marks, score: [...(m.marks.score ?? []), ...grid], place: { x: 0, y: 0, z: 0 } });
      }
    } else {
      // One piece: the backing with the tiles' outline scored and the letters marked.
      const h = hangTop(p, back, p.hang.kind === "hole" && c.back !== "plate" ? "loop" : p.hang.kind);
      info.wall = h.wall;
      const m = markPlate(p, h.shape, letters, blocks);
      const tileLines = [closed(body.outer)];
      parts.push({ id: "tiles", name: "Name crossword", outer: m.plate.outer, holes: m.plate.holes, ...m.marks, score: [...(m.marks.score ?? []), ...tileLines, ...grid], place: { x: 0, y: 0, z: 0 } });
      if (m.front) parts.push(second({ id: "letters", name: "Letters", outer: m.front.outer, holes: m.front.holes, place: { x: 0, y: 0, z: p.T } }));
    }
  }

  if (kind === "tree") {
    const t = p.tree;
    const sorted = names.map((n, i) => ({ n, i })).sort((a, b) => a.n.length - b.n.length || a.i - b.i).map((o) => o.n);
    const raw: { cs: Contour[]; glyphs: Contour[][]; w: number; h: number }[] = [];
    for (const n of sorted) { const l = line(ctx, p.names.caps ? n.toLocaleUpperCase() : n, font, t.maxLine, missing); if (!l) return loadingOut(); raw.push(l); }
    // Line i is sized to the triangle: from a third of the width at the top to the full width.
    let y = 0;
    const all: Contour[] = [], glyphs: Contour[][] = [];
    raw.forEach((l, i) => {
      const target = t.width * (0.34 + (0.66 * (i + 1)) / raw.length);
      const k = Math.min(1, target / l.w);
      const h = l.h * k;
      info.letter = Math.min(info.letter, t.maxLine * k);
      all.push(...move(scale(l.cs, k), 0, y + h / 2));
      glyphs.push(...l.glyphs.map((g) => move(scale(g, k), 0, y + h / 2)));
      y += h * 0.94;
    });
    const top = bboxOf(all).y0;
    let star: Contour[] = [];
    if (t.star !== "none") {
      const m = motifRef(t.star, p.ring.art, ctx, missing);
      if (m.ref) { const sz = t.width * 0.26; const sb = bboxOf(motif(m.ref, sz)); star = motif(m.ref, sz, 0, top - (sb.y1 - sb.y0) * 0.42); }
    }
    const bottom = bboxOf(all).y1;
    const trunk: Contour[] = t.trunk ? [orient(roundedRect(-t.width * 0.12, bottom - 1.5, t.width * 0.24, t.width * 0.13, 1.5))] : [];
    const welded = weld([...star, ...all, ...trunk], { border: t.weld, minHole: 2, bridge: Math.max(2, t.weld * 3) });
    if (!welded) return { parts: [], stats: [], error: "Type some names." };
    let piece = welded;
    const scores = letterScores(glyphs);
    if (t.trunk && t.year.trim()) {
      const yl = line(ctx, t.year, "archivo-black", t.width * 0.07, missing);
      if (!yl) return loadingOut();
      // The year fits inside the trunk with a wall of material all round.
      const tb = bboxOf(trunk), wall = Math.max(2, t.weld * 2);
      const k = Math.min(1, (tb.x1 - tb.x0 - 2 * wall) / yl.w, (tb.y1 - tb.y0 - 2 * wall) / yl.h);
      const yr = move(scale(yl.cs, k), 0, (tb.y0 + tb.y1) / 2 + 0.5);
      piece = makeShape(piece.outer, [...piece.holes, ...unionShapes(yr).map((s) => orientHole(s.outer))]);
    }
    const w = weldedParts(p, piece, scores, "Name tree", true);
    info.wall = w.wall;
    parts.push(...w.parts);
  }

  if (kind === "snowflake") {
    const sf = p.snowflake, R = sf.diameter / 2;
    const arms = Math.max(5, Math.min(12, names.length));
    const list = Array.from({ length: arms }, (_, i) => names[i % names.length]);
    // Names start just outside the hub; at their inner end the arms are closest, which caps the letter height.
    const r0 = R * 0.24;
    const arc = (2 * Math.PI * (r0 + R * 0.06)) / arms;
    const maxH = Math.min(R * 0.17, arc * 0.78);
    const len = R - r0 - maxH * 1.3;
    const all: Contour[] = [], tips: Contour[] = [], glyphs: Contour[][] = [];
    for (let i = 0; i < arms; i++) {
      const l = line(ctx, p.names.caps ? list[i].toLocaleUpperCase() : list[i], font, maxH, missing);
      if (!l) return loadingOut();
      const k = Math.min(1, len / l.w);
      info.letter = Math.min(info.letter, maxH * k);
      const ang = -90 + (360 * i) / arms;
      // The name runs outward along its arm, reading from the centre.
      const pl = { x: (r0 + (l.w * k) / 2) * Math.cos((ang * Math.PI) / 180), y: (r0 + (l.w * k) / 2) * Math.sin((ang * Math.PI) / 180), rot: ang };
      all.push(...scale(l.cs, k).map((c) => transform(c, pl)));
      glyphs.push(...l.glyphs.map((g) => scale(g, k).map((c) => transform(c, pl))));
      const tip = r0 + l.w * k + maxH * 0.55;
      tips.push(...motif("star", maxH * 1.25, tip * Math.cos((ang * Math.PI) / 180), tip * Math.sin((ang * Math.PI) / 180)));
    }
    const hub = [orient(circle(0, 0, r0 + maxH * 0.25))];
    const welded = weld([...hub, ...all, ...tips], { border: sf.weld, minHole: 2, bridge: Math.max(2, sf.weld * 3) });
    if (!welded) return { parts: [], stats: [], error: "Type some names." };
    let piece = welded;
    if (sf.centre.trim()) {
      const yl = line(ctx, sf.centre, "archivo-black", r0 * 0.55, missing);
      if (!yl) return loadingOut();
      const k = Math.min(1, (r0 * 1.6) / yl.w);
      piece = makeShape(piece.outer, [...piece.holes, ...unionShapes(scale(yl.cs, k)).map((s) => orientHole(s.outer))]);
    }
    const w = weldedParts(p, piece, letterScores(glyphs), "Name snowflake", true);
    info.wall = w.wall;
    parts.push(...w.parts);
  }

  if (kind === "ring") {
    const r = p.ring, R = r.diameter / 2;
    const plate0 = makeShape(orient(circle(0, 0, R)), []);
    const sep = r.separator.trim() ? ` ${r.separator.trim()} ` : "  ";
    const l = line(ctx, names.map((n) => (p.names.caps ? n.toLocaleUpperCase() : n)).join(sep) + sep, font, r.nameSize, missing);
    if (!l) return loadingOut();
    const margin = Math.max(3, R * 0.06);
    let rr = R - margin - l.h;
    let k = Math.min(1, (0.96 * 2 * Math.PI * rr) / l.w);
    if (k < 1) { rr = R - margin - l.h * k; k = Math.min(1, (0.96 * 2 * Math.PI * rr) / l.w); }
    info.letter = Math.min(info.letter, r.nameSize * k);
    const ringText = onCircle(scale(l.cs, k), rr);
    const inner = rr - l.h * k * 0.35 - Math.max(2, R * 0.05);
    let middle: Contour[] = [];
    if (r.centre.trim()) {
      const c = line(ctx, r.centre, r.centreFont, inner * 0.9, missing);
      if (!c) return loadingOut();
      const ck = Math.min(1, (inner * 1.55) / c.w, (inner * 1.4) / c.h);
      middle = scale(c.cs, ck);
    } else if (r.motif !== "none") {
      const m = motifRef(r.motif, r.art, ctx, missing);
      if (m.ref) middle = motif(m.ref as MotifRef, inner * 1.3);
    }
    const blocks = [{ item: "Names", cs: ringText }, { item: "Centre", cs: middle }];
    const h = hangTop(p, plate0, p.hang.kind === "none" ? "none" : "loop");
    info.wall = h.wall;
    const m = markPlate(p, h.shape, [...ringText, ...middle], blocks);
    const frame = r.frame ? [closed(circle(0, 0, R - Math.max(1.2, R * 0.025))), closed(circle(0, 0, inner + 0.5))] : [];
    parts.push({ id: "ring", name: "Name ring", outer: m.plate.outer, holes: m.plate.holes, ...m.marks, score: [...(m.marks.score ?? []), ...(p.mark.kind === "cutout" ? [] : frame)], place: { x: 0, y: 0, z: 0 } });
    if (m.front) parts.push(second({ id: "letters", name: "Names", outer: m.front.outer, holes: m.front.holes, place: { x: 0, y: 0, z: p.T } }));
  }

  if (kind === "monogram") {
    const mo = p.monogram, first = names[0];
    const ch = (mo.letter || [...first][0] || "A").toLocaleUpperCase();
    const L = line(ctx, ch, mo.letterFont, mo.size, missing);
    if (!L) return loadingOut();
    const big = centre(L.cs);
    const bandH = (mo.size * mo.band) / 100, bandW = big.w + mo.size * 0.18;
    const band = orient(roundedRect(-bandW / 2, -bandH / 2, bandW, bandH, Math.min(bandH * 0.3, 6)));
    // The band lies across the initial and holds every stroke it crosses; strokes it misses are bridged on.
    let piece = weld([...big.cs, band], { border: 0, minHole: 2, bridge: Math.max(3, mo.size * 0.04) });
    if (!piece) return { parts: [], stats: [], error: "The initial could not be drawn; try another font." };
    // Hang it from the highest point of the outline, not the middle of its box (an N or a W is open there).
    const withLoop = (sh: Shape): Shape => {
      if (p.hang.kind === "none") return sh;
      // Of the points near the top, the one nearest the centre of mass, so it hangs straight.
      const b = bboxOf([sh.outer]);
      let A = 0, cx = 0;
      for (let i = 0, j = sh.outer.length - 1; i < sh.outer.length; j = i++) { const [x0, y0] = sh.outer[j], [x1, y1] = sh.outer[i], k = x0 * y1 - x1 * y0; A += k; cx += (x0 + x1) * k; }
      cx = A ? cx / (3 * A) : (b.x0 + b.x1) / 2;
      const near = sh.outer.filter((q) => q[1] <= b.y0 + (b.y1 - b.y0) * 0.12);
      const top = near.reduce((m, q) => (Math.abs(q[0] - cx) < Math.abs(m[0] - cx) ? q : m), near[0]);
      const lr = p.hang.hole / 2, LR = lr + p.hang.wall, lc: Pt = [top[0], top[1] - lr - p.hang.wall * 0.35];
      const body = largest(unionShapes([sh.outer, orient(circle(lc[0], lc[1], LR)), orient(rect(lc[0] - LR * 0.7, lc[1], LR * 1.4, LR + p.hang.wall))]))!;
      info.wall = p.hang.wall;
      return makeShape(body.outer, [...sh.holes, orientHole(circle(lc[0], lc[1], lr))]);
    };
    const nl = line(ctx, p.names.caps ? first.toLocaleUpperCase() : first, font, bandH * 0.6, missing);
    if (!nl) return loadingOut();
    const fit = fitContent(nl.cs, makeShape(band, []), null, Math.max(1.5, bandH * 0.14));
    const nameCs = move(scale(nl.cs, fit.s), fit.at[0], fit.at[1]);
    info.letter = Math.min(info.letter, bandH * 0.6 * fit.s);
    if (p.backer.on) {
      // The loop goes on the backer; the monogram on top in the second material.
      const back = withLoop(makeShape(largest(offsetShapes([makeShape(piece.outer, [])], p.backer.offset, "round"))!.outer, []));
      const m = markPlate(p, piece, nameCs, [{ item: "Name", cs: nameCs }]);
      parts.push({ id: "backer", name: "Monogram backer", outer: back.outer, holes: back.holes, place: { x: 0, y: 0, z: 0 } });
      parts.push(second({ id: "piece", name: "Monogram", outer: m.plate.outer, holes: m.plate.holes, ...m.marks, score: [...(m.marks.score ?? []), closed(band)], place: { x: 0, y: 0, z: p.T } }));
    } else {
      piece = withLoop(piece);
      const m = markPlate(p, piece, nameCs, [{ item: "Name", cs: nameCs }]);
      parts.push({ id: "piece", name: "Split monogram", outer: m.plate.outer, holes: m.plate.holes, ...m.marks, score: [...(m.marks.score ?? []), closed(band)], place: { x: 0, y: 0, z: 0 } });
      if (m.front) parts.push(second({ id: "letters", name: "Name", outer: m.front.outer, holes: m.front.holes, place: { x: 0, y: 0, z: p.T } }));
    }
  }

  if (kind === "bunting") {
    const b = p.bunting, w = b.width, hgt = b.height;
    const words = names.map((n) => tileWord(n, p.names.caps));
    const flag = (): Contour => {
      switch (b.shape) {
        case "pennant": return orient([[0, 0], [w, 0], [w / 2, hgt]]);
        case "swallowtail": return orient([[0, 0], [w, 0], [w, hgt], [w / 2, hgt * 0.72], [0, hgt]]);
        case "square": return orient(roundedRect(0, 0, w, hgt, Math.min(w, hgt) * 0.06));
        case "scalloped": {
          const cs = [orient(rect(0, 0, w, hgt * 0.78))];
          const n = 3, rad = w / (2 * n);
          for (let i = 0; i < n; i++) cs.push(orient(circle(rad + 2 * rad * i, hgt * 0.78, rad)));
          return largest(unionShapes(cs))!.outer;
        }
      }
    };
    const outline = flag();
    // Two string holes near the top corners, each kept clear by its wall.
    const r = b.hole / 2, inset = r + p.hang.wall;
    const holes = [orientHole(circle(inset + 2, inset, r)), orientHole(circle(w - inset - 2, inset, r))];
    info.wall = Math.min(info.wall, p.hang.wall);
    const blank = makeShape(outline, holes);
    const keep = orient(rect(-1, -1, w + 2, inset + r + p.hang.wall));
    let n = 0;
    const seq: string[] = [];
    words.forEach((wd, i) => { if (i > 0 && b.spacer) seq.push(""); seq.push(...[...wd]); });
    for (const ch of seq) {
      const id = `flag-${++n}`;
      const at = { x: (n - 1) * (w + 8), y: 0, z: 0 };
      if (!ch) { parts.push({ id, name: `Flag ${n} (spacer)`, outer: blank.outer, holes: blank.holes, place: at }); continue; }
      const l = line(ctx, ch, font, (w * b.letter) / 100, missing);
      if (!l) return loadingOut();
      const c = centre(l.cs);
      const fit = fitContent(c.cs, makeShape(outline, []), keep, Math.max(3, w * 0.06));
      const placed = move(scale(c.cs, fit.s), fit.at[0], fit.at[1]);
      info.letter = Math.min(info.letter, ((w * b.letter) / 100) * fit.s);
      const m = markPlate(p, blank, placed, [{ item: "Letter", cs: placed }]);
      parts.push({ id, name: `Flag ${n} ${ch}`, outer: m.plate.outer, holes: m.plate.holes, ...m.marks, place: at });
      if (m.front) parts.push(second({ id: `${id}-letter`, name: `Letter ${ch}`, outer: m.front.outer, holes: m.front.holes, place: { ...at, z: p.T } }));
    }
    info.flags = seq.length;
  }

  if (!parts.length) return { parts: [], stats: [], error: "Nothing to cut: type some names." };
  const all = bboxOf(parts.filter((q) => kind !== "bunting" || q.id === "flag-1").map((q) => q.outer));
  info.width = all.x1 - all.x0; info.height = all.y1 - all.y0;
  if (!Number.isFinite(info.letter)) info.letter = 0;
  const mixed = parts.some((q) => q.material === "second");
  const stats = [
    { label: kind === "bunting" ? "Each flag" : "Size", value: `${r1(info.width)} × ${r1(info.height)} mm` },
    { label: "Names", value: kind === "bunting" ? `${info.flags} flags` : String(info.names - info.skipped.length) },
    ...(info.letter > 0 ? [{ label: "Letters", value: `${r1(info.letter)} mm high (smallest)` }] : []),
    ...(Number.isFinite(info.wall) ? [{ label: kind === "bunting" ? "String holes" : "Hanging", value: `Ø ${kind === "bunting" ? p.bunting.hole : p.hang.hole} mm, ${r1(info.wall)} mm wall` }] : []),
    { label: "Parts", value: String(parts.length) },
    ...(mixed ? [{ label: "Second material", value: `${m2.name} ${p.mat.T2} mm` }] : []),
  ];
  const assembly: string[] = [];
  if (parts.some((q) => q.engrave?.length || q.score?.length)) assembly.push("Engrave and score first, then cut, without moving the sheet.");
  if (mixed) assembly.push(`Cut the ${MATERIALS[p.material]?.name ?? "main"} sheet, then the ${m2.name} sheet.`, "Glue the names on the backer with a thin line of wood glue or clear epoxy, lined up by their outline; press flat for an hour.");
  if (kind === "bunting") assembly.push("Thread a cord through the two holes of each flag, front to back and out again, in order, leaving a little gap between flags.");
  else if (p.hang.kind !== "none") assembly.push("Hang it with a ribbon or an ornament hook through the loop.");
  return {
    parts, stats, assembly, info, missing: missing.length ? missing : undefined,
    materials: mixed ? { main: MATERIALS[p.material]?.name ?? `Main material ${p.T} mm`, second: `${m2.name} ${p.mat.T2} mm`, secondK: m2.K } : undefined,
  };
}
