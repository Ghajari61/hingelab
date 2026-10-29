/**
 * Strap goods: one long piece (sometimes two) with folds round hardware, punched holes and edge
 * stitching. Folds are held by fittings or stitch rows placed in mirrored pairs about the fold line,
 * so the two layers' holes meet when it is folded.
 *
 * Long straps (belts, leads, bag straps) are often longer than a laser bed; the checks say so, and the
 * hand-cutting template prints in tiles. The 3D view lays the strap out flat.
 */
import { rect } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { Pattern } from "./kit";
import { motif, type MotifId } from "../motifs";
import { clamp, roundRect, unite } from "./path";
import type { LeatherParams } from "./params";

type V3 = [number, number, number];
export interface StrapResult { size: V3; fixed: string[] }

const P = (id: string, name: string, outer: Contour, extra: Partial<GenPart> = {}): GenPart => ({ id, name, outer, holes: [], score: [], place: { x: 0, y: 0, z: 0 }, ...extra });

/** A strap from u = 0 to len, `w0` wide up to `ut`, tapering to `w1` at the end; square or round ends. */
function taper(len: number, w0: number, w1: number, ut: number, roundStart: boolean, roundEnd: boolean): Contour {
  const c = w0 / 2, hw = (u: number) => (u <= ut ? w0 / 2 : w0 / 2 + ((w1 - w0) / 2) * ((u - ut) / Math.max(1, len - ut)));
  const pts: Pt[] = [];
  const re = roundEnd ? hw(len) : 0, rs = roundStart ? w0 / 2 : 0;
  const N = 16;
  // top edge, left to right
  for (const u of [rs, ut, len - re]) if (u >= rs && u <= len - re) pts.push([u, c - hw(u)]);
  if (roundEnd) for (let i = 1; i < N; i++) { const a = -Math.PI / 2 + (Math.PI * i) / N; pts.push([len - re + re * Math.cos(a), c + re * Math.sin(a)]); }
  else pts.push([len, c - hw(len)], [len, c + hw(len)]);
  for (const u of [len - re, ut, rs]) if (u >= rs && u <= len - re) pts.push([u, c + hw(u)]);
  if (roundStart) for (let i = 1; i < N; i++) { const a = Math.PI / 2 + (Math.PI * i) / N; pts.push([rs + rs * Math.cos(a), c + rs * Math.sin(a)]); }
  else pts.push([0, c + w0 / 2], [0, c - w0 / 2]);
  const out: Pt[] = [];
  for (const q of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.01) out.push(q); }
  return out;
}

/** Two stitch rows along a strap's edges between u0 and u1, following a taper (half-width at u). */
function edgeRows(e: number, c: number, hw: (u: number) => number, u0: number, u1: number): Pt[][] {
  return [[[u0, c - hw(u0) + e], [u1, c - hw(u1) + e]], [[u0, c + hw(u0) - e], [u1, c + hw(u1) - e]]];
}

/** A belt or collar: a buckle fold with a prong slot, fittings mirrored about the fold, holes and a tip. */
function belted(p: LeatherParams, pat: Pattern, collar: boolean): StrapResult {
  const s = pat.s, e = s.edge, T = p.T;
  const w = clamp(p.small.width, 12, 60), L = clamp(p.small.length, collar ? 200 : 500, collar ? 700 : 1500);
  const fb = collar ? 55 : 45, n = clamp(Math.round(p.small.holes), 1, 9), hp = clamp(p.small.holePitch, 12, 40);
  const uMid = fb + L, tip = clamp(w * 2.5, 50, 140), len = uMid + ((n - 1) / 2) * hp + tip;
  const part = pat.add(P("strap", collar ? "Collar" : "Belt", taper(len, w, w, len, false, true)));
  pat.fold(part, [fb, 0], [fb, w]);
  const sl = clamp(w * 0.7, 12, 30);
  part.holes.push(rect(fb - sl / 2, w / 2 - 2.5, sl, 5));
  pat.count("buckle", 1, `${Math.round(w)} mm inside`);
  if (collar) {
    for (const a of [10, fb - 22]) { pat.mount("rivet", part, [a, w / 2], 0, "buckle fold"); pat.mount("rivet", part, [2 * fb - a, w / 2], 0, "", 20, false); }
    pat.count("dring", 1, `${Math.round(w)} mm inside, for the lead`);
    pat.notes.push("The D-ring sits in the fold between the two rivet pairs, behind the buckle.");
  } else {
    pat.mount("chicago", part, [15, w / 2], 0, "buckle fold");
    pat.mount("chicago", part, [2 * fb - 15, w / 2], 0, "", 20, false);
  }
  const hd = clamp(w * 0.12, 3, 6);
  for (let i = 0; i < n; i++) pat.punch(part, [uMid + (i - (n - 1) / 2) * hp, w / 2], hd, "Size holes");
  if (w >= 18) {
    const u0 = 2 * fb + 10, u1 = uMid - ((n - 1) / 2) * hp - 25;
    if (u1 - u0 > 40) pat.line("Edge stitching", part, edgeRows(e, w / 2, () => w / 2, u0, u1), 1);
  }
  const kw = clamp(w * 0.35, 8, 14), kl = 2 * (w + 2) + 4 * T + 12;
  const keeper = pat.add(P("keeper", "Keeper", roundRect(0, 0, kl, kw, [1, 1, 1, 1])));
  pat.seam("Keeper ends", [{ part: keeper, rows: [[[5, 2.5], [5, kw - 2.5]]] }, { part: keeper, rows: [[[kl - 5, 2.5], [kl - 5, kw - 2.5]]] }], { ticks: false });
  pat.steps.push(
    "Overlap the keeper's ends and stitch them through the matching holes, seam inside.",
    `Fold the buckle end through the buckle${collar ? " and the D-ring" : ""}, prong through the slot, keeper in the fold, and ${collar ? "set the rivets" : "do up the Chicago screws"}.`,
  );
  pat.notes.push(`The size is ${Math.round(L)} mm from the buckle's prong to the middle hole.`);
  return { size: [len, w, 2 * T], fixed: [part.id] };
}

function watchstrap(p: LeatherParams, pat: Pattern): StrapResult {
  const s = pat.s, e = Math.min(s.edge, 3), T = p.T;
  const w = clamp(p.small.width, 12, 30), wt = w * clamp(p.small.taper, 0.6, 1), wrist = clamp(p.small.length, 140, 230);
  const F = 18, Lb = Math.round(wrist * 0.4) + 2 * F, Lh = Math.round(wrist * 0.6) + 2 * F;
  const n = clamp(Math.round(p.small.holes), 1, 9), hp = clamp(p.small.holePitch, 5, 12);
  const hwOf = (len: number) => (u: number) => (u <= 2 * F ? w / 2 : w / 2 + ((wt - w) / 2) * ((u - 2 * F) / Math.max(1, len - 2 * F)));
  // the buckle piece: lug fold at u = F, buckle fold near its end with the prong slot
  const bp = pat.add(P("buckleside", "Buckle side", taper(Lb, w, wt, 2 * F, false, false)));
  const fbk = Lb - 14, hb = hwOf(Lb);
  pat.fold(bp, [F, 0], [F, w]); pat.fold(bp, [fbk, w / 2 - hb(fbk)], [fbk, w / 2 + hb(fbk)]);
  bp.holes.push(rect(fbk - 4, w / 2 - 1.5, 8, 3));
  pat.seam("Lug fold (buckle side)", [{ part: bp, rows: [[[F - 9, e], [F - 9, w - e]]] }, { part: bp, rows: [[[F + 9, e], [F + 9, w - e]]] }], { ticks: false });
  pat.seam("Buckle fold", [{ part: bp, rows: [[[fbk + 8, w / 2 - hb(fbk + 8) + e], [fbk + 8, w / 2 + hb(fbk + 8) - e]]] }, { part: bp, rows: [[[fbk - 8, w / 2 - hb(fbk - 8) + e], [fbk - 8, w / 2 + hb(fbk - 8) - e]]] }], { ticks: false });
  pat.line("Edge stitching (buckle side)", bp, edgeRows(e, w / 2, hb, 2 * F + 4, fbk - 14), 1);
  // the hole piece: lug fold, round tip, size holes
  const hpPart = pat.add(P("holeside", "Hole side", taper(Lh, w, wt, 2 * F, false, true)));
  const hh = hwOf(Lh);
  pat.fold(hpPart, [F, 0], [F, w]);
  pat.seam("Lug fold (hole side)", [{ part: hpPart, rows: [[[F - 9, e], [F - 9, w - e]]] }, { part: hpPart, rows: [[[F + 9, e], [F + 9, w - e]]] }], { ticks: false });
  const um = Lh * 0.62;
  for (let i = 0; i < n; i++) pat.punch(hpPart, [um + (i - (n - 1) / 2) * hp, w / 2], 2, "Size holes");
  pat.line("Edge stitching (hole side)", hpPart, edgeRows(e, w / 2, hh, 2 * F + 4, um - ((n - 1) / 2) * hp - 8), 1);
  const kl = 2 * (wt + 2) + 4 * T + 8;
  pat.add(P("keeper", "Keeper", roundRect(0, 0, kl, 6, [1, 1, 1, 1])));
  pat.count("buckle", 1, `${wt.toFixed(0)} mm watch buckle`);
  pat.notes.push(`For ${w} mm lugs and a ${Math.round(wrist)} mm wrist; spring bars go through the lug folds. Glue and stitch the keeper's ends (it is too narrow for a hole pair).`);
  pat.steps.push("Fold each lug end over its spring bar and stitch the fold rows; fold the buckle end round the buckle's pin, prong through the slot, keeper inside, and stitch it.");
  return { size: [Lb + Lh + 20, w, 2 * T], fixed: [bp.id, hpPart.id] };
}

function keyfob(p: LeatherParams, pat: Pattern): StrapResult {
  const s = pat.s, e = s.edge, T = p.T;
  const w = clamp(p.small.width, 14, 40), len = clamp(p.small.length, 80, 240), m = len / 2;
  const part = pat.add(P("fob", "Fob", roundRect(0, 0, len, w, [w / 2, w / 2, w / 2, w / 2])));
  pat.fold(part, [m, 0], [m, w]);
  pat.mount("rivet", part, [m - 22, w / 2], 0, "fob");
  pat.mount("rivet", part, [m + 22, w / 2], 0, "", 20, false);
  const u0 = w / 2 + 2, u1 = m - 30;
  if (w >= 16 && u1 - u0 > 12) pat.seam("Fob edges", [{ part, rows: edgeRows(e, w / 2, () => w / 2, u0, u1) }, { part, rows: edgeRows(e, w / 2, () => w / 2, len - u0, len - u1) }], { ticks: false });
  pat.count("keyring", 1, "25 mm or to suit");
  pat.steps.push("Fold the fob round the key ring, stitch the two halves' edges through the matching holes and set the rivet.");
  return { size: [len, w, T], fixed: [part.id] };
}

function bracelet(p: LeatherParams, pat: Pattern): StrapResult {
  const s = pat.s, e = s.edge, T = p.T;
  const w = clamp(p.small.width, 8, 50), len = clamp(p.small.length, 120, 260) + 25, n = clamp(Math.round(p.small.holes), 1, 3);
  const part = pat.add(P("band", "Band", roundRect(0, 0, len, w, [w / 2.2, w / 2.2, w / 2.2, w / 2.2])));
  pat.mount("snap", part, [12, w / 2], 0, "bracelet");
  for (let i = 0; i < n; i++) pat.mount("snap", part, [len - 12 - i * 12, w / 2], 0, "", 20, false);
  if (n > 1) pat.count("snap", n - 1, "extra studs for the other sizes");
  const u0 = w / 2 + 14, u1 = len - w / 2 - 14 - (n - 1) * 12;
  if (w >= 14 && u1 - u0 > 20) pat.line("Edge stitching", part, edgeRows(e, w / 2, () => w / 2, u0, u1), 1);
  pat.steps.push("Stitch the edges, then set the snap's cap and socket at one end and the stud (or studs) at the other.");
  return { size: [len, w, T], fixed: [part.id] };
}

/** A strap with a fold round a fitting at either or both ends, fittings mirrored about each fold. */
function folded(p: LeatherParams, pat: Pattern, kind: "leash" | "shoulderstrap"): StrapResult {
  const s = pat.s, e = s.edge, T = p.T;
  const w = clamp(p.small.width, 12, 50), L = clamp(p.small.length, 300, kind === "leash" ? 2500 : 1600), cf = 30;
  const loopL = kind === "leash" ? 260 : 0, ov = kind === "leash" ? 60 : 2 * cf;
  const len = kind === "leash" ? 2 * ov + loopL + L + 2 * cf : L + 4 * cf;
  const part = pat.add(P("strap", kind === "leash" ? "Lead" : "Strap", roundRect(0, 0, len, w, [3, 3, 3, 3])));
  let u0: number;
  if (kind === "leash") {
    // the handle: the end overlaps the strap after a loop; the fittings are symmetric so either way round lines up
    for (const a of [12, ov - 12]) { pat.mount("rivet", part, [a, w / 2], 0, "handle loop"); pat.mount("rivet", part, [ov + loopL + a, w / 2], 0, "", 20, false); }
    u0 = 2 * ov + loopL + 20;
  } else {
    pat.fold(part, [cf, 0], [cf, w]);
    for (const a of [15]) { pat.mount("rivet", part, [cf - a, w / 2], 0, "clip folds"); pat.mount("rivet", part, [cf + a, w / 2], 0, "", 20, false); }
    pat.count("clip", 1, `${Math.round(w)} mm`);
    pat.count("slider", 1, `${Math.round(w)} mm`);
    u0 = 2 * cf + 20;
  }
  // the clip at the far end
  const fu = len - cf;
  pat.fold(part, [fu, 0], [fu, w]);
  pat.mount("rivet", part, [fu + 15, w / 2], 0, "clip folds"); pat.mount("rivet", part, [fu - 15, w / 2], 0, "", 20, false);
  pat.count("clip", 1, `${Math.round(w)} mm`);
  const u1 = len - 2 * cf - 20;
  if (w >= 18 && u1 - u0 > 40) pat.line("Edge stitching", part, edgeRows(e, w / 2, () => w / 2, u0, u1), 1);
  pat.steps.push(kind === "leash" ? "Loop the handle end back onto the lead and set its rivets; fold the other end through the clip and rivet it." : "Fold each end through its clip (one through the slider first) and set the rivets.");
  return { size: [len, w, T], fixed: [part.id] };
}

function bagcharm(p: LeatherParams, pat: Pattern): StrapResult {
  const T = p.T, S = clamp(p.size.width, 30, 120);
  const st = p.decor.style;
  const id: MotifId = st === "persian-geometric" ? "girih" : st === "iranian-boteh" ? "paisley" : st === "art-deco" ? "sun" : st === "european" ? "fleur" : st === "celtic" ? "triquetra" : st === "botanical" ? "leaf" : st === "luxury" ? "gem" : "flower";
  const ids: string[] = [];
  [1, 0.74, 0.5].forEach((k, i) => {
    const sz = S * k, outline = unite(motif(id, sz, sz / 2, sz / 2));
    const layer = pat.add(P(`layer${i + 1}`, `Layer ${i + 1}`, outline, { place: { x: (S - sz) / 2, y: (S - sz) / 2, z: i * T } }));
    pat.mount("rivet", layer, [sz / 2, sz / 2], 0, "", 20, false);
    ids.push(layer.id);
  });
  pat.count("rivet", 1, "long post, through every layer");
  const tl = Math.round(S / 2 + 30), tab = pat.add(P("tab", "Loop tab", roundRect(0, 0, tl, 10, [4, 4, 4, 4])));
  pat.fold(tab, [tl / 2, 0], [tl / 2, 10]);
  pat.mount("rivet", tab, [6, 5], 0, "", 20, false); pat.mount("rivet", tab, [tl - 6, 5], 0, "", 20, false);
  pat.count("clip", 1, "small swivel clip");
  pat.steps.push("Fold the tab round the clip's ring, sandwich the layers between its ends and set the long rivet through everything at the centre.");
  pat.notes.push(`The charm's layers are HingeLab's own ${id} motif at three sizes.`);
  return { size: [S, S, 3 * T], fixed: ids };
}

export function buildStrap(p: LeatherParams, pat: Pattern): StrapResult {
  switch (p.product) {
    case "belt": return belted(p, pat, false);
    case "collar": return belted(p, pat, true);
    case "watchstrap": return watchstrap(p, pat);
    case "keyfob": return keyfob(p, pat);
    case "bracelet": return bracelet(p, pat);
    case "leash": return folded(p, pat, "leash");
    case "shoulderstrap": return folded(p, pat, "shoulderstrap");
    case "bagcharm": return bagcharm(p, pat);
    default: return belted(p, pat, false);
  }
}
