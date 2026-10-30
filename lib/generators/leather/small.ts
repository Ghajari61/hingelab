/**
 * Flat goods: layers glued face to face and stitched through together (wallets, card holders,
 * covers), single pieces folded and stitched to themselves (glasses case), and pieces folded into
 * shape and held by snaps (valet tray, coin purse).
 *
 * Every stitch line through a stack is placed once on the base layer; each layer above gets the same
 * holes wherever the line crosses it (Pattern.stack), so the layers line up hole for hole. Folded
 * pieces stitched to themselves get mirrored rows, matched by arc length like any seam.
 *
 * The 3D view shows these goods open and flat, the layers stacked.
 */
import { rect } from "../geom";
import { foldFlat, hinge, OPEN, type Region } from "./pose";
import type { Contour, GenPart, Pt } from "../types";
import { strapPart } from "./boxbag";
import { decorate } from "./decor";
import { Pattern } from "./kit";
import { clamp, loopFrom, offsetContour, pathLength, pointAt, roundRect, runBelow, runLeftOf, runRightOf, subPath } from "./path";
import type { LeatherParams } from "./params";

type V3 = [number, number, number];
export interface SmallResult { size: V3; fixed: string[] }

const P = (id: string, name: string, outer: Contour, extra: Partial<GenPart> = {}): GenPart => ({ id, name, outer, holes: [], score: [], ...extra });
const inner = (c: Contour, e: number) => offsetContour(c, -e) ?? c;
/** The stitch path e inside an outline, below v = cut (open at the top). */
const uPath = (c: Contour, e: number, cut: number): Pt[] => {
  const r = runBelow(inner(c, e), cut);
  if (!r) throw new Error("The part is too small for its stitching.");
  return r;
};
/** A closed stitch loop e inside an outline, starting nearest `at`. */
const loopPath = (c: Contour, e: number, at: Pt): Pt[] => loopFrom(inner(c, e), at);
const lay = (part: GenPart, x: number, y: number, z: number) => { part.place = { x, y, z }; return part; };

// ---------------------------------------------------------------- wallets
function wallet(p: LeatherParams, pat: Pattern, long: boolean): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, long ? 170 : 150, 420), H = clamp(p.size.height, 70, 220), r = clamp(p.size.corner, 1, 20);
  const outline = roundRect(0, 0, W, H, [r, r, r, r]);
  const out = pat.add(lay(P("outer", "Outer", outline), 0, 0, 0));
  pat.fold(out, [W / 2, 0], [W / 2, H]);
  const lined = p.build.lining, tl = lined ? clamp(p.build.liningT, 0.4, 2) : T;
  const lin = lined ? pat.add(lay(P("lining", "Lining", outline, { t: tl, material: "second" }), 0, 0, T)) : null;
  const base = lin ?? out, z0 = T + (lin ? tl : 0);
  // staggered card pockets on both halves, tallest first, bottoms level with the wallet's
  const n = clamp(Math.round(p.small.cards), 1, 6), hMax = clamp(p.small.pocketH, 30, H - 12), step = clamp((hMax - 24) / Math.max(1, n), 8, 16);
  const pw = W / 2 - 4;
  const layers: { part: GenPart; ox: number; oy: number }[] = [];
  for (const side of [0, 1]) {
    const mine: { part: GenPart; ox: number; oy: number }[] = [];
    for (let j = 0; j < n; j++) {
      const h = Math.max(24, hMax - j * step), ox = side ? W - pw : 0, oy = H - h;
      const pk = pat.add(lay(P(`pocket${side ? "R" : "L"}${j + 1}`, `Card pocket ${side ? "right" : "left"} ${j + 1}`, roundRect(0, 0, pw, h, side ? [0, 0, r, 0] : [0, 0, 0, r])), ox, oy, z0 + j * T));
      mine.push({ part: pk, ox, oy });
    }
    // the pockets' inner edges, stitched to the lining before the outer goes on
    const x = side ? W - pw + e : pw - e, y0 = H - hMax + e, y1 = H - e - 1.5 * s.pitch;
    if (y1 - y0 > 2 * s.pitch) pat.stack(`Pocket inner edge (${side ? "right" : "left"})`, base, [[[x, y0], [x, y1]]], mine, Math.max(1.5, e * 0.6));
    layers.push(...mine);
  }
  pat.stack("Perimeter", out, [loopPath(outline, e, [W / 2, H])], [...(lin ? [{ part: lin, ox: 0, oy: 0 }] : []), ...layers], Math.max(1.5, e * 0.6));
  decorate(p, pat, out, rect(W / 2 + e, 0, W / 2 - e, H));
  pat.steps.push(
    "Glue the card pockets in order, tallest first, along their bottom and outer edges only.",
    `Stitch the pockets' inner edges through the ${lin ? "lining" : "outer"} (the short vertical lines).`,
    ...(lin ? ["Glue the lining to the outer, flesh sides together, folded as it will be used so the inside is not too tight."] : []),
    "Stitch round the whole wallet through every layer, then bevel, sand and burnish the edges.",
  );
  if (pw < 90 + 2 * e) pat.notes.push(`The pockets are ${Math.round(pw)} mm wide; a bank card (85.6 mm) needs about ${Math.round(90 + 2 * e)} mm with the stitching.`);
  // 3D: the right half closes over the left at the fold
  const zt = z0 + n * T;
  foldFlat(pat.parts, [{ box: [-OPEN, -OPEN, W / 2, OPEN], hinges: [] }, { box: [W / 2, -OPEN, OPEN, OPEN], hinges: [hinge(0, W / 2, zt, Math.PI, [W * 0.75, H / 2])] }]);
  return { size: [W, H, z0 + n * T], fixed: pat.parts.map((q) => q.id) };
}

function cardholder(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, 70, 140), H = clamp(p.size.height, 60, 140), r = clamp(p.size.corner, 1, 15);
  const back = pat.add(lay(P("back", "Back", roundRect(0, 0, W, H, [r, r, r, r])), 0, 0, 0));
  const h1 = clamp(p.small.pocketH, 30, H - 12), h2 = Math.max(22, h1 - 14), nr = clamp(W * 0.12, 8, 14);
  const mid = pat.add(lay(P("pocket1", "Back pocket", roundRect(0, 0, W, h1, [0, 0, r, r])), 0, H - h1, T));
  // the front pocket with a thumb notch at the middle of its top edge
  const notch: Pt[] = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI - (Math.PI * i) / 16; notch.push([W / 2 + nr * Math.cos(a), nr * Math.sin(a)]); }
  const fr = pat.add(lay(P("pocket2", "Front pocket", tidy([[0, 0], ...notch, [W, 0], ...roundRect(0, 0, W, h2, [0, 0, r, r]).slice(2)])), 0, H - h2, 2 * T));
  pat.stack("Pocket sides and bottom", back, [uPath(back.outer, e, H - h1 + e)], [{ part: mid, ox: 0, oy: H - h1 }, { part: fr, ox: 0, oy: H - h2 }], Math.max(1.5, e * 0.6));
  decorate(p, pat, back, rect(0, 0, W, H - h1));
  pat.steps.push("Glue both pockets to the back along their sides and bottoms, stitch the U through all three layers, then finish the edges and the pocket tops.");
  return { size: [W, H, 3 * T], fixed: pat.parts.map((q) => q.id) };
}

/** A contour starting at the notch's left end and running round: drops repeated points. */
function tidy(c: Contour): Contour {
  const out: Contour = [];
  for (const q of c) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.01) out.push(q); }
  const f = out[0], l = out[out.length - 1];
  if (out.length > 2 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 0.01) out.pop();
  return out;
}

function passport(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, 180, 320), H = clamp(p.size.height, 120, 200), r = clamp(p.size.corner, 1, 15);
  const outline = roundRect(0, 0, W, H, [r, r, r, r]);
  const out = pat.add(lay(P("outer", "Outer", outline), 0, 0, 0));
  pat.fold(out, [W / 2, 0], [W / 2, H]);
  const lin = p.build.lining ? pat.add(lay(P("lining", "Lining", outline, { t: clamp(p.build.liningT, 0.4, 2), material: "second" }), 0, 0, T)) : null;
  const z0 = T + (lin ? lin.t ?? 0 : 0), sw = clamp(W * 0.32, 50, W / 2 - 10);
  const sl = pat.add(lay(P("sleeveL", "Left sleeve", roundRect(0, 0, sw, H, [r, 0, 0, r])), 0, 0, z0));
  const sr = pat.add(lay(P("sleeveR", "Right sleeve", roundRect(0, 0, sw, H, [0, r, r, 0])), W - sw, 0, z0));
  const ph = clamp(p.small.pocketH, 30, H * 0.6);
  const pk = pat.add(lay(P("pocket", "Card pocket", roundRect(0, 0, sw, ph, [0, 0, r, 0])), W - sw, H - ph, z0 + T));
  // the card pocket's inner side, stitched to the right sleeve first
  pat.stack("Card pocket inner side", sr, [[[e, H - ph + e], [e, H - e - 1.5 * s.pitch]]], [{ part: pk, ox: 0, oy: H - ph }], Math.max(1.5, e * 0.6));
  pat.stack("Perimeter", out, [loopPath(outline, e, [W / 2, H])], [...(lin ? [{ part: lin, ox: 0, oy: 0 }] : []), { part: sl, ox: 0, oy: 0 }, { part: sr, ox: W - sw, oy: 0 }, { part: pk, ox: W - sw, oy: H - ph }], Math.max(1.5, e * 0.6));
  decorate(p, pat, out, rect(W / 2 + e, 0, W / 2 - e, H));
  pat.steps.push("Stitch the card pocket's inner side to the right sleeve.", "Glue the sleeves (and the lining) to the outer at their edges only, with the cover folded, and stitch round everything.");
  foldFlat(pat.parts, [{ box: [-OPEN, -OPEN, W / 2, OPEN], hinges: [] }, { box: [W / 2, -OPEN, OPEN, OPEN], hinges: [hinge(0, W / 2, z0 + 2 * T, Math.PI, [W * 0.75, H / 2])] }]);
  return { size: [W, H, z0 + 2 * T], fixed: pat.parts.map((q) => q.id) };
}

function sleeve(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, 100, 420), H = clamp(p.size.height, 120, 450), r = clamp(p.size.corner, 1, 30), dep = clamp(p.size.depth, 2, 30);
  const flap = clamp(p.build.flap || 60, 30, H * 0.5);
  const fr = p.build.flapShape === "round" ? Math.min(W / 4, flap * 0.7) : p.build.flapShape === "straight" ? 4 : 2;
  const back = pat.add(lay(P("back", "Back with flap", roundRect(0, 0, W, H + flap, [fr, fr, r, r])), 0, 0, 0));
  const front = pat.add(lay(P("front", "Front", roundRect(0, 0, W, H, [2, 2, r, r])), 0, flap, T));
  pat.fold(back, [0, flap], [W, flap]);
  pat.stack("Sides and bottom", back, [uPath(back.outer, e, flap + e)], [{ part: front, ox: 0, oy: flap }], Math.max(1.5, e * 0.6));
  const cl = p.build.closure;
  if (cl === "snap" || cl === "magnet") {
    const a = Math.min(flap * 0.4, 25);
    pat.mount(cl, back, [W / 2, a], Math.PI / 2, "flap closure");
    pat.mount(cl, front, [W / 2, clamp(flap - a + dep, e + 10, H - e - 10)], Math.PI / 2, "flap closure", 20, false);
  }
  decorate(p, pat, back, rect(e + 4, 4, W - 2 * e - 8, flap - 8));
  pat.steps.push("Set the closure in the flap and the front first.", "Glue the front to the back along the sides and bottom, stitch the U, then fold the flap over.");
  pat.notes.push(`Make the width the device's width plus its thickness plus ${Math.round(2 * e + 4)} mm, so it slides in past the stitching.`);
  // 3D: the flap closes over the front
  foldFlat(pat.parts, [{ box: [-OPEN, flap, OPEN, OPEN], hinges: [] }, { box: [-OPEN, -OPEN, OPEN, flap], hinges: [hinge(1, flap, 2 * T, Math.PI, [W / 2, flap / 2])] }]);
  return { size: [W, H + flap, 2 * T], fixed: pat.parts.map((q) => q.id) };
}

function glasses(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge;
  const w = clamp(p.size.width, 45, 110), L = clamp(p.size.height, 110, 220), r = clamp(p.size.corner, 2, w / 2);
  const part = pat.add(lay(P("body", "Case body", roundRect(0, 0, 2 * w, L, [2, 2, r, r])), 0, 0, 0));
  pat.fold(part, [w, 0], [w, L]);
  // the left half's side and bottom as one path; the right half's is its mirror about the fold
  const half = roundRect(0, 0, w, L, [2, 0, 0, r]);
  const u = uPath(half, e, e + 0.05);
  // keep the run from the top-left down and along the bottom, up to the fold
  let cut = pathLength(u);
  { let acc = 0; for (let i = 1; i < u.length; i++) { acc += Math.hypot(u[i][0] - u[i - 1][0], u[i][1] - u[i - 1][1]); if (u[i][0] >= w - e - 0.01 && u[i][1] >= L - e - 0.5) { cut = acc; break; } } }
  const left = subPath(u, 0, cut - 1.5), right = left.map(([x, y]) => [2 * w - x, y] as Pt);
  pat.seam("Side and end", [{ part, rows: [left] }, { part, rows: [right] }]);
  decorate(p, pat, part, rect(0, 0, w - e, L));
  pat.steps.push("Fold the case along the scored line, grain out, and saddle stitch the side and the end through the matching holes, from the opening down.");
  // 3D: folded in half, the two sides stitched together
  foldFlat([part], [{ box: [-OPEN, -OPEN, w, OPEN], hinges: [] }, { box: [w, -OPEN, OPEN, OPEN], hinges: [hinge(0, w, p.T + 0.3, Math.PI, [1.5 * w, L / 2])] }]);
  return { size: [2 * w, L, p.T], fixed: [part.id] };
}

function notebook(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const bw = clamp(p.size.width, 90, 230), bh = clamp(p.size.height, 120, 300), sp = clamp(p.size.depth, 3, 40), r = clamp(p.size.corner, 1, 12);
  const Wc = 2 * (bw + 4) + sp + 2 * T, Hc = bh + 6, fw = clamp(bw * 0.6, 50, bw);
  const cover = pat.add(lay(P("cover", "Cover", roundRect(0, 0, Wc, Hc, [r, r, r, r])), 0, 0, 0));
  const xs = bw + 4 + T;
  pat.fold(cover, [xs, 0], [xs, Hc]); pat.fold(cover, [Wc - xs, 0], [Wc - xs, Hc]);
  const fl = pat.add(lay(P("flapL", "Left flap", roundRect(0, 0, fw, Hc, [r, 0, 0, r])), 0, 0, T));
  const fr = pat.add(lay(P("flapR", "Right flap", roundRect(0, 0, fw, Hc, [0, r, r, 0])), Wc - fw, 0, T));
  const runL = runLeftOf(inner(roundRect(0, 0, fw, Hc, [r, 0, 0, r]), e), fw - e - 0.05), runR = runRightOf(inner(roundRect(Wc - fw, 0, fw, Hc, [0, r, r, 0]), e), Wc - fw + e + 0.05);
  if (!runL || !runR) throw new Error("The flaps are too small for their stitching.");
  pat.stack("Left flap", cover, [runL], [{ part: fl, ox: 0, oy: 0 }], Math.max(1.5, e * 0.6));
  pat.stack("Right flap", cover, [runR], [{ part: fr, ox: Wc - fw, oy: 0 }], Math.max(1.5, e * 0.6));
  // a pen loop riveted to the right flap near its free edge
  const ll = Math.round(2 * Math.PI * 6 + 30), loop = pat.add(P("penloop", "Pen loop", roundRect(0, 0, ll, 14, [4, 4, 4, 4]), { place: { x: 0, y: 0, z: 0 } }));
  pat.mount("rivet", loop, [7, 7], 0, "", 20, false); pat.mount("rivet", loop, [ll - 7, 7], 0, "", 20, false);
  for (const dy of [-12, 12]) pat.mount("rivet", fr, [16, Hc / 2 + dy], 0, "pen loop");
  decorate(p, pat, cover, rect(Wc - xs + e, 0, xs - e, Hc));
  pat.steps.push("Rivet the pen loop to the right flap.", "Glue the flaps to the cover along their outer three edges and stitch them; slide the book's boards into the flaps.");
  pat.notes.push(`Made for a book ${Math.round(bw)} × ${Math.round(bh)} mm with a ${Math.round(sp)} mm spine.`);
  // 3D: closed like the book inside, the spine standing and the back cover over the front
  const h1 = hinge(0, xs, T, Math.PI / 2, [Wc / 2, Hc / 2]), h2 = hinge(0, Wc - xs, T, Math.PI / 2, [Wc - xs / 2, Hc / 2]);
  foldFlat([cover, fl, fr], [{ box: [-OPEN, -OPEN, xs, OPEN], hinges: [] }, { box: [xs, -OPEN, Wc - xs, OPEN], hinges: [h1] }, { box: [Wc - xs, -OPEN, OPEN, OPEN], hinges: [h2, h1] }]);
  return { size: [Wc, Hc, 2 * T], fixed: [cover.id, fl.id, fr.id] };
}

function toolroll(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, 150, 700), H = clamp(p.size.height, 120, 420), r = clamp(p.size.corner, 1, 20);
  const base = pat.add(lay(P("base", "Base", roundRect(0, 0, W, H, [r, r, r, r])), 0, 0, 0));
  const ph = clamp(p.small.pocketH, 40, H * 0.75);
  const strip = pat.add(lay(P("pocketstrip", "Pocket strip", roundRect(0, 0, W, ph, [0, 0, r, r])), 0, H - ph, T));
  const n = clamp(Math.round(p.small.cards), 2, 16);
  const rows: Pt[][] = [];
  for (let k = 1; k < n; k++) rows.push([[(W * k) / n, H - ph + e], [(W * k) / n, H - e - 1.5 * s.pitch]]);
  if (rows.length) pat.stack("Slot dividers", base, rows, [{ part: strip, ox: 0, oy: H - ph }], Math.max(1.5, e * 0.6));
  pat.stack("Perimeter", base, [loopPath(base.outer, e, [W / 2, H])], [{ part: strip, ox: 0, oy: H - ph }], Math.max(1.5, e * 0.6));
  const tie = strapPart(pat, "tie", "Tie strap", clamp(H * 2.4, 300, 900), 12);
  pat.mount("rivet", tie, [10, 6], 0, "", 20, false);
  pat.mount("rivet", base, [W - 18, H / 2], 0, "tie strap");
  pat.fold(base, [0, H - ph - 30], [W, H - ph - 30]);
  decorate(p, pat, base, rect(0, 0, W, H - ph - 34));
  pat.steps.push("Glue the pocket strip along its bottom and sides, stitch the slot dividers, then round the whole roll.", "Rivet the tie strap at the end the roll finishes on; fold the top down over the tools and roll up.");
  // 3D: the top folds down over the tools' handles
  const ft = H - ph - 30;
  foldFlat([base, strip], [{ box: [-OPEN, ft, OPEN, OPEN], hinges: [] }, { box: [-OPEN, -OPEN, OPEN, ft], hinges: [hinge(1, ft, 2 * T + 6, Math.PI, [W / 2, ft / 2])] }]);
  return { size: [W, H, 2 * T], fixed: [base.id, strip.id] };
}

function coaster(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const D = clamp(p.size.width, 60, 160), r = clamp(p.size.corner, 0, D / 2);
  const outline = roundRect(0, 0, D, D, [r, r, r, r], 24);
  const top = pat.add(lay(P("top", "Top", outline), 0, 0, T));
  const bottom = pat.add(lay(P("bottom", "Bottom", outline), 0, 0, 0));
  decorate(p, pat, top, inner(outline, e + s.hole + 2));
  pat.stack("Edge", top, [loopPath(outline, e, [D / 2, D])], [{ part: bottom, ox: 0, oy: 0 }], Math.max(1.5, e * 0.6));
  pat.steps.push("Glue the two layers flesh to flesh, stitch round the edge, then sand and burnish it.");
  return { size: [D, D, 2 * T], fixed: [top.id, bottom.id] };
}

/** A square folded up at each side into a tray, each corner pinched on its diagonal and held with a snap. */
function tray(p: LeatherParams, pat: Pattern, purse: boolean): SmallResult {
  const T = p.T;
  const Wb = clamp(p.size.width, purse ? 40 : 60, purse ? 140 : 320), Db = clamp(p.size.height, purse ? 40 : 60, purse ? 140 : 320);
  const h = clamp(p.size.depth, purse ? 18 : 15, purse ? 50 : 60), Wt = Wb + 2 * h, Dt = Db + 2 * h, r = clamp(p.size.corner, 1, h * 0.6);
  const part = pat.add(lay(P("tray", purse ? "Coin purse" : "Tray", roundRect(0, 0, Wt, Dt, [r, r, r, r])), 0, 0, 0));
  part.labelAvoidScore = true;
  for (const y of [h, Dt - h]) pat.fold(part, [0, y], [Wt, y]);
  for (const x of [h, Wt - h]) pat.fold(part, [x, 0], [x, Dt]);
  // each corner square folds on its diagonal; two points mirrored about it meet, and the snap goes there
  const corners: [number, number, number, number][] = [[0, 0, 1, 1], [Wt, 0, -1, 1], [Wt, Dt, -1, -1], [0, Dt, 1, -1]];
  for (const [cx, cy, sx, sy] of corners) {
    pat.fold(part, [cx + sx * 0.5, cy + sy * 0.5], [cx + sx * h, cy + sy * h]);
    const a = 0.34 * h, b = 0.68 * h;
    pat.mount("snap", part, [cx + sx * a, cy + sy * b], 0, purse ? "corner snaps" : "corner snaps");
    pat.mount("snap", part, [cx + sx * b, cy + sy * a], 0, "", 20, false);
  }
  decorate(p, pat, part, rect(h + 4, h + 4, Wb - 8, Db - 8));
  pat.steps.push("Set a snap's cap and socket on one side of each corner's diagonal and the stud on the other.", "Fold up the four walls, pinch each corner on its diagonal and close its snap.");
  if (h < 2 * (p.hw.snapCap / 2 + 2)) pat.notes.push("The walls are low for the snaps: their caps come close to the fold and the edge.");
  // 3D: the walls fold up; each corner goes with the long wall and wraps round onto the end wall
  const up = Math.PI / 2, wy0 = hinge(1, h, T, up, [Wt / 2, h / 2]), wy1 = hinge(1, Dt - h, T, up, [Wt / 2, Dt - h / 2]);
  const regions: Region[] = [
    { box: [h, h, Wt - h, Dt - h], hinges: [] },
    { box: [h, -OPEN, Wt - h, h], hinges: [wy0] }, { box: [h, Dt - h, Wt - h, OPEN], hinges: [wy1] },
    { box: [-OPEN, h, h, Dt - h], hinges: [hinge(0, h, T, up, [h / 2, Dt / 2])] }, { box: [Wt - h, h, OPEN, Dt - h], hinges: [hinge(0, Wt - h, T, up, [Wt - h / 2, Dt / 2])] },
  ];
  for (const [x0, x1, cx] of [[-OPEN, h, h], [Wt - h, OPEN, Wt - h]] as const) {
    const px = cx === h ? h / 2 : Wt - h / 2;
    regions.push({ box: [x0, -OPEN, x1, h], hinges: [hinge(0, cx, -0.3, up, [px, h / 2]), wy0] }, { box: [x0, Dt - h, x1, OPEN], hinges: [hinge(0, cx, -0.3, up, [px, Dt - h / 2]), wy1] });
  }
  foldFlat([part], regions);
  return { size: [Wt, Dt, T], fixed: [part.id] };
}

function luggagetag(p: LeatherParams, pat: Pattern): SmallResult {
  const s = pat.s, e = s.edge, T = p.T;
  const W = clamp(p.size.width, 60, 140), H = clamp(p.size.height, 90, 190), r = clamp(p.size.corner, 1, 20);
  const outline = roundRect(0, 0, W, H, [r, r, r, r]);
  const front = pat.add(lay(P("front", "Front with window", outline), 0, 0, T));
  const back = pat.add(lay(P("back", "Back", outline), 0, 0, 0));
  const sw = 14, sy = 9;
  for (const q of [front, back]) q.holes.push(rect(W / 2 - sw / 2, sy, sw, 4));
  const cut = sy + 4 + 8 + e, m = e + s.hole + 5;
  front.holes.push(roundRect(m, Math.max(cut + 6, H * 0.36), W - 2 * m, H - m - Math.max(cut + 6, H * 0.36), [4, 4, 4, 4]));
  pat.stack("Sides and bottom", back, [uPath(outline, e, cut)], [{ part: front, ox: 0, oy: 0 }], Math.max(1.5, e * 0.6));
  const st = strapPart(pat, "strap", "Tag strap", 230, 12);
  pat.mount("snap", st, [10, 6], 0, "tag strap"); pat.mount("snap", st, [220, 6], 0, "", 20, false);
  pat.steps.push("Glue and stitch the two layers round the sides and bottom; the card slides in at the top, under the strap slot.", "Thread the strap through the slot and the luggage handle and close the snap.");
  return { size: [W, H, 2 * T], fixed: [front.id, back.id] };
}

export function buildSmall(p: LeatherParams, pat: Pattern): SmallResult {
  switch (p.product) {
    case "bifold": return wallet(p, pat, false);
    case "longwallet": return wallet(p, pat, true);
    case "cardholder": return cardholder(p, pat);
    case "passport": return passport(p, pat);
    case "sleeve": return sleeve(p, pat);
    case "glasses": return glasses(p, pat);
    case "notebook": return notebook(p, pat);
    case "toolroll": return toolroll(p, pat);
    case "coaster": return coaster(p, pat);
    case "tray": return tray(p, pat, false);
    case "coinpurse": return tray(p, pat, true);
    case "luggagetag": return luggagetag(p, pat);
    default: return wallet(p, pat, false);
  }
}

// exported for the tests
export const _paths = { uPath, loopPath, pointAt };
