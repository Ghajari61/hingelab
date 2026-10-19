/**
 * The book box: a box shaped like a book. One cover piece (back cover, spine, front cover) bends
 * round a living-hinge spine, so the front cover opens like a book; inside, a head, a tail and a
 * fore-edge wall stand in slots in the back cover, their spine ends rounded to sit in the spine.
 * The front cover can carry the decorative pattern and a framed title.
 *
 * Plan coordinates: x from the spine (0) to the fore edge, y from the head (0) to the tail, z up
 * from the back cover. On the cover piece the back cover comes first (its fore edge at x = 0), so
 * the engraved face up is the outside of the closed book.
 */
import { colSegments, hingeSegments } from "@/lib/hinge/hinge";
import { rect } from "../geom";
import { fretHoles, type KeepOut } from "../fretwork";
import type { BuildContext, Contour, GenPart, Pt } from "../types";
import { lidArt, r1, wall, flat, type V2Output } from "./more";
import { labelBox, labelFrame, patternHoles, pierce, pierced, pierceWallIds, pierceWalls } from "./pierce";
import type { BoxesParams } from "./params";

const shift = (c: Contour, dx: number, dy: number): Contour => c.map(([x, y]) => [x + dx, y + dy] as Pt);

/** Tab centres along a length L: one, two or three, clear of the ends. */
function tabsOn(a: number, b: number, w: number): number[] {
  const L = b - a, n = L < 60 ? 1 : L < 150 ? 2 : 3;
  if (L < w + 6) return [];
  return Array.from({ length: n }, (_, i) => a + (L * (i + 0.5)) / n);
}

export function buildBook(p: BoxesParams, ctx: BuildContext): V2Output {
  const T = p.T, bk = p.book, W = bk.width, Hc = bk.height, Dk = bk.thickness, over = Math.max(0, bk.over);
  const r = Dk / 2, h = Dk - 2 * T, rr = r - T, Lc = W - r, Ls = Math.PI * (r - T / 2);
  if (rr < 3) return { parts: [], stats: [], error: `The book is too thin for ${T} mm material: make it at least ${Math.ceil(2 * T + 6)} mm thick.` };
  if (Lc - over - T < 30) return { parts: [], stats: [], error: "The cover is too narrow for its thickness: make the book wider." };
  if (Hc - 2 * over - 2 * T < 30) return { parts: [], stats: [], error: "The book is too short: make it taller." };
  const tabW = Math.min(14, Math.max(8, 2.5 * T)), clr = 0.1;

  // ---- the cover piece: back cover, hinge spine, front cover
  const strip = rect(0, 0, 2 * Lc + Ls, Hc);
  const pitch = Math.max(1.8, 0.85 * T), bridge = Math.max(2, T), hs = hingeSegments(Hc, Math.min(28, Hc / 4), bridge);
  const nc = Math.max(1, Math.floor((Ls - 2) / pitch) | 1);
  const x0 = Lc + (Ls - (nc - 1) * pitch) / 2;
  const cuts: Contour[] = [];
  for (let j = 0; j < nc; j++) {
    const x = x0 + j * pitch;
    for (const [a, b] of colSegments(j % 2 ? "open" : "closed", hs, Hc, bridge)) cuts.push([[x, a], [x, b]]);
  }
  const fore = W - over;
  /** Back cover x for a point u from the spine. */
  const bx = (u: number) => Lc - (u - r);
  const holes: Contour[] = [];
  const headU = tabsOn(r, fore - T, tabW);
  for (const u of headU) for (const y of [over, Hc - over - T]) holes.push(rect(bx(u) - (tabW + clr) / 2, y - clr / 2, tabW + clr, T + clr));
  const foreS = tabsOn(0, Hc - 2 * over, tabW);
  for (const s of foreS) holes.push(rect(bx(fore - T / 2) - (T + clr) / 2, over + s - (tabW + clr) / 2, T + clr, tabW + clr));

  // ---- the front cover: the pattern round a framed title
  const fx = Lc + Ls, art = lidArt(p, ctx), engrave: Contour[] = [];
  const cx = fx + Lc / 2, cy = Hc / 2;
  const keep: KeepOut[] = [];
  if (art.cs.length) {
    engrave.push(...art.cs.map((c) => shift(c, cx, cy)));
    if (pierced(p)) { const k = labelBox(cx, cy, art.w, art.h); keep.push(k); engrave.push(...labelFrame(k)); }
  }
  let coverHoles = 0;
  const patternScore: Contour[] = [];
  if (pierced(p)) {
    const m = Math.max(5, p.pierce.bar + 3);
    const fh = p.pierce.shape === "full" ? fretHoles({ kind: p.pierce.pattern, cell: Math.max(6, p.pierce.cell), bar: Math.max(1, p.pierce.bar) }, fx + 2, m, fx + Lc - m, Hc - m, keep) : patternHoles(p, fx + 2, m, fx + Lc - m, Hc - m, keep);
    if (p.pierce.mark === "engrave") engrave.push(...fh);
    else if (p.pierce.mark === "score") patternScore.push(...fh);
    else holes.push(...fh);
    coverHoles = fh.length;
  }
  const cover: GenPart = {
    id: "cover", name: "Cover (bends round the spine)", outer: strip, holes, cuts,
    ...(engrave.length ? (p.engrave.mark === "score" ? { score: engrave.map((c) => [...c, c[0]]) } : { engrave }) : {}),
    ...(patternScore.length ? { score: [...(p.engrave.mark === "score" ? engrave.map((c) => [...c, c[0]]) : []), ...patternScore.map((c) => [...c, c[0]])] } : {}),
    // Its back cover under the walls (turned, so the slots meet the tabs); the 3D view uses views3d.
    place: { x: r + Lc, y: Hc, z: 0, rot: 180 },
  };
  // In 3D the cover is drawn as it sits: back cover flat, spine standing, front cover on top.
  const inFront = (c: Contour) => c.every(([x]) => x >= fx - 1e-6);
  cover.views3d = [
    { outer: rect(0, 0, Lc, Hc), holes: holes.filter((c) => !inFront(c)).map((c) => c.map(([x, y]) => [Lc - x, y] as Pt).reverse()), place: flat(r, 0, 0) },
    { outer: rect(0, 0, Hc, Dk), holes: [], place: wall(T, Dk, 0, 90) },
    { outer: rect(0, 0, Lc, Hc), holes: holes.filter(inFront).map((c) => shift(c, -fx, 0)), engrave: engrave.map((c) => shift(c, -fx, 0)), place: flat(r, 0, Dk - T) },
  ];

  // ---- the walls inside: head and tail (rounded at the spine) and the fore edge
  const head = (): Contour => {
    const pts: Contour = [];
    for (let i = 0; i <= 24; i++) { const a = (3 * Math.PI) / 2 - (Math.PI * i) / 24; pts.push([r + rr * Math.cos(a), h / 2 + rr * Math.sin(a)]); }
    for (const u of headU) pts.push([u - tabW / 2, h], [u - tabW / 2, h + T], [u + tabW / 2, h + T], [u + tabW / 2, h]);
    pts.push([fore - T, h], [fore - T, 0]);
    return pts;
  };
  const foreWall = (): Contour => {
    const L = Hc - 2 * over, pts: Contour = [[0, 0], [L, 0], [L, h]];
    for (const s of [...foreS].reverse()) pts.push([s + tabW / 2, h], [s + tabW / 2, h + T], [s - tabW / 2, h + T], [s - tabW / 2, h]);
    pts.push([0, h]);
    return pts;
  };
  const walls: GenPart[] = [
    { id: "head", name: "Head wall", outer: head(), holes: [], place: wall(0, Dk - T, over) },
    { id: "tail", name: "Tail wall", outer: head(), holes: [], place: wall(0, Dk - T, Hc - over - T) },
    { id: "fore", name: "Fore-edge wall", outer: foreWall(), holes: [], place: wall(fore, Dk - T, over, 90) },
  ];
  let wallHoles = 0;
  if (pierceWalls(p)) {
    const ids = pierceWallIds(p, walls.map((w) => w.id));
    for (const w of walls) if (ids.includes(w.id)) wallHoles += pierce(p, w, T + Math.max(1, p.pierce.bar) + 1);
  }

  const insideW = fore - 2 * T, insideH = Hc - 2 * over - 2 * T;
  return {
    parts: [cover, ...walls],
    stats: [
      { label: "Book", value: `${r1(W)} × ${r1(Hc)} × ${r1(Dk)} mm` },
      { label: "Inside", value: `${r1(insideW)} × ${r1(insideH)} × ${r1(h)} mm` },
      { label: "Spine", value: `${nc} hinge cuts over ${r1(Ls)} mm` },
      ...(pierced(p) ? [{ label: "Pattern", value: `${coverHoles} holes in the front cover${wallHoles ? `, ${wallHoles} in the walls` : ""}` }] : []),
    ],
    assembly: [
      "Push the head, tail and fore-edge walls' tabs into the slots in the back cover; glue the corners where the fore-edge wall meets the head and tail.",
      "Bend the spine slowly round the rounded ends of the head and tail walls; the hinge cuts face out.",
      "Close the front cover over the walls. It opens like a book; add a small magnet at the fore edge to keep it shut.",
    ],
    notice: art.loading ? "Loading the font." : undefined,
    missing: art.missing,
    info: { size: [W, Hc, Dk], ...(art.cs.length ? { textWidth: art.w, textRoom: Lc - 12, artHeight: art.h, artRoom: Hc - 12 } : {}) },
  };
}
