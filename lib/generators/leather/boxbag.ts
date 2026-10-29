/**
 * Bags built from faces and a gusset: the face panels (front, back, middle walls) are stitched
 * round their sides and bottom to a straight gusset strip, edge to edge. The gusset's length is the
 * faces' stitch-path length plus what reaches the top, so its straight stitch line and the faces'
 * curved one have the same length and get the same holes (stitch.ts).
 *
 * The same construction makes the doctor bag and the wood-and-leather bag with the faces turned to
 * the ends (the "gusset" is then the body wrapped round them), the multi-gusset satchel (one strip
 * per compartment, middle walls stitched between two strips), the briefcase (divider walls stitched
 * along lines inside one strip) and the roll-top backpack (tall faces).
 */
import { pointInContour, rect } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { decorate } from "./decor";
import { frame, Pattern } from "./kit";
import { clamp, move, offsetContour, pathLength, pointAt, roundRect, runBelow, unite } from "./path";
import { holeOutline } from "./stitch";
import type { LeatherParams, ProductKind } from "./params";

type V3 = [number, number, number];

interface BoxCfg {
  shape: "rect" | "trapezoid" | "halfround";
  orient: "front" | "ends";
  faceW: number; faceH: number; wrapW: number; r: number;
  compartments: number; dividers: number; flap: number; zipTop: boolean;
  handles: "faces" | "lid" | "lip" | "none"; strap: boolean; feet: boolean; pocket: boolean; lining: boolean; reinforce: boolean;
  rails: number; roll: number; channel: number; wood: boolean; backpack: boolean; convertible: boolean;
}

function cfgOf(p: LeatherParams): BoxCfg {
  const s = p.size, b = p.build, k: ProductKind = p.product;
  const base: BoxCfg = {
    shape: "rect", orient: "front", faceW: s.width, faceH: s.height, wrapW: s.depth, r: s.corner,
    compartments: 1, dividers: 0, flap: b.flap, zipTop: b.zipper, handles: b.handles > 0 ? "faces" : "none", strap: b.strap, feet: b.feet,
    pocket: b.pocket, lining: b.lining, reinforce: b.reinforce, rails: 0, roll: 0, channel: 0, wood: false, backpack: false, convertible: false,
  };
  switch (k) {
    case "briefcase": return { ...base, dividers: clamp(Math.round(b.dividers), 0, 3), zipTop: false, flap: Math.max(b.flap, 60), handles: b.handles > 0 ? "lid" : "none" };
    case "satchel": return { ...base, compartments: clamp(Math.round(b.compartments), 2, 3), zipTop: false, flap: Math.max(b.flap, 50), handles: b.handles > 0 ? "lid" : "none" };
    case "messenger": case "laptop": return { ...base, zipTop: false, flap: Math.max(b.flap, 60), handles: "none", dividers: k === "laptop" ? Math.max(1, Math.round(b.dividers)) : clamp(Math.round(b.dividers), 0, 2) };
    case "camera": return { ...base, zipTop: false, flap: Math.max(b.flap, 50), handles: "none", rails: clamp(Math.round(b.dividers), 1, 4) };
    case "convertible": return { ...base, zipTop: false, flap: Math.max(b.flap, 60), handles: "none", convertible: true };
    case "crossbody": case "phonebag": case "clutch": return { ...base, zipTop: false, flap: Math.max(b.flap, 30), handles: "none" };
    case "saddle": return { ...base, shape: "halfround", zipTop: false, flap: Math.max(b.flap, 50), handles: "none", faceH: Math.max(s.height, s.width / 2 + 10) };
    case "doctor": return { ...base, shape: "trapezoid", orient: "ends", faceW: s.depth, wrapW: s.width, zipTop: false, flap: 0, handles: b.handles > 0 ? "lip" : "none", channel: 24 };
    case "hybrid": return { ...base, orient: "ends", faceW: s.depth, wrapW: s.width, zipTop: false, flap: 0, wood: true, lining: false, handles: b.handles > 0 ? "lip" : "none" };
    case "rolltop": return { ...base, faceH: s.height + clamp(b.rollExt, 60, 300), zipTop: false, flap: 0, handles: "none", strap: false, backpack: true, roll: clamp(b.rollExt, 60, 300) };
    case "waistbag": return { ...base, zipTop: true, flap: 0, handles: "none", strap: true };
    case "tote": return { ...base, zipTop: false, flap: 0 };
    default: return { ...base, flap: b.zipper ? 0 : b.flap };
  }
}

/** A face's outline, y down, top edge at v = 0. */
function faceOutline(c: BoxCfg, taper: number): Contour {
  const { faceW: W, faceH: H, r } = c;
  if (c.shape === "halfround") {
    const pts: Pt[] = [[0, 0], [W, 0], [W, H - W / 2]];
    for (let i = 1; i < 40; i++) { const a = (Math.PI * i) / 40; pts.push([W / 2 + (W / 2) * Math.cos(a), H - W / 2 + (W / 2) * Math.sin(a)]); }
    pts.push([0, H - W / 2]);
    return pts;
  }
  if (c.shape === "trapezoid") {
    const Wt = W * clamp(taper, 0.4, 1), x0 = (W - Wt) / 2;
    const poly: Contour = [[x0, 0], [x0 + Wt, 0], [W, H], [0, H]];
    const rr = clamp(r, 1, Math.min(W, H) / 4);
    return offsetContour(offsetContour(poly, -rr) ?? poly, rr) ?? poly;
  }
  return roundRect(0, 0, W, H, [2, 2, r, r]);
}

export function buildBox(p: LeatherParams, pat: Pattern) {
  const c = cfgOf(p), s = pat.s, T = p.T, e = s.edge, d = pat.s.pitch;
  const H = c.faceH, W = c.faceW;
  const face = faceOutline(c, p.size.taper);
  const tm = e; // the gusset reaches the top edge; its first hole is one edge distance down
  const runOf = (outline: Contour, top: number) => runBelow(offsetContour(outline, -e) ?? outline, top + tm + 0.05);
  const path = runOf(face, 0);
  if (!path) throw new Error("The face is too small for its stitching.");
  const L = pathLength(path);
  const flap = c.flap > 0 ? clamp(c.flap, 20, H) : 0;
  const Dtot = c.wrapW * c.compartments;
  const E = flap ? Dtot + flap : 0; // the back panel reaches over the top and down as the flap
  const ce = c.channel, Ls = L + 2 * tm + 2 * ce;
  const lining = c.lining && !c.wood;

  // ---- 3D frames: the face's u axis, the across axis (the gusset's width), where each face stands
  const A: V3 = c.orient === "front" ? [1, 0, 0] : [0, 1, 0];
  const X: V3 = c.orient === "front" ? [0, -1, 0] : [1, 0, 0];
  const at = (u: number, v: number, w: number): V3 => {
    // face (u, v) at depth w along the across axis (w = 0 at the front face), z up from the bottom
    const along = c.orient === "front" ? [u, Dtot - w, 0] : [w, u, 0];
    return [along[0], along[1], H - v];
  };
  const facePlace = (w: number, top = 0) => frame(A, [0, 0, -1], at(0, -top, w));

  // ---- the faces
  const faces: GenPart[] = [];
  const nFaces = c.compartments + 1;
  for (let i = 0; i < nFaces; i++) {
    const isFront = i === 0, isBack = i === nFaces - 1;
    const name = c.orient === "ends" ? (isFront ? "End panel (left)" : "End panel (right)") : isFront ? "Front panel" : isBack ? "Back panel" : `Middle panel ${i}`;
    let outer = face;
    const fp: GenPart = { id: isFront ? "front" : isBack ? "back" : `mid${i}`, name, outer, holes: [], score: [] };
    if (isBack && flap) {
      // the back reaches up over the top (the lid, as deep as the bag) and down the front as the flap
      const fr = p.build.flapShape === "round" ? Math.min(W / 4, flap * 0.7) : p.build.flapShape === "straight" ? 4 : 0;
      const ext: Contour = p.build.flapShape === "pointed"
        ? [[0, Math.min(flap * 0.55, W * 0.3)], [W / 2, 0], [W, Math.min(flap * 0.55, W * 0.3)], [W, E + 1], [0, E + 1]]
        : roundRect(0, 0, W, E + 1, [fr, fr, 0, 0]);
      outer = unite([ext, move(face, 0, E)]);
      fp.outer = outer;
      pat.fold(fp, [0, flap], [W, flap]);
      pat.fold(fp, [0, E], [W, E]);
      fp.views3d = [
        { name: "Back", outer: rect(0, E, W, H), holes: [], place: { x: 0, y: 0, z: 0, m: facePlace(Dtot, E) } },
        { name: "Lid", outer: rect(0, flap, W, E - flap), holes: [], place: { x: 0, y: 0, z: 0, m: frame(A, X, at(0, 0, -flap)) } },
        { name: "Flap", outer: rect(0, 0, W, flap), holes: [], place: { x: 0, y: 0, z: 0, m: frame(A, [0, 0, 1], at(0, flap, -T)) } },
      ];
    }
    if (c.wood) { fp.t = clamp(p.build.woodT, 2, 12); fp.material = "second"; fp.name = name.replace("End panel", "Wood end panel"); }
    fp.place = { x: 0, y: 0, z: 0, m: facePlace(i * c.wrapW) };
    faces.push(pat.add(fp));
  }

  // ---- the gussets: one strip per compartment
  const strips: GenPart[] = [];
  for (let k = 0; k < c.compartments; k++) {
    const sp: GenPart = { id: c.compartments > 1 ? `gusset${k + 1}` : "gusset", name: c.orient === "ends" ? "Body" : c.compartments > 1 ? `Gusset ${k + 1}` : "Gusset", outer: rect(0, 0, Ls, c.wrapW), holes: [], score: [] };
    // 3D: pieces along the face's edge, the strip's width across the bag
    const edge = runBelow(face, 0.5)!, Le = pathLength(edge), K = Math.max(6, Math.round(Le / 18));
    sp.views3d = Array.from({ length: K }, (_, j) => {
      const s0 = (Le * j) / K, s1 = (Le * (j + 1)) / K, P = pointAt(edge, s0).pt, Q = pointAt(edge, s1).pt;
      const u0 = ce + (s0 / Le) * (Ls - 2 * ce), u1 = ce + (s1 / Le) * (Ls - 2 * ce);
      const a = at(P[0], P[1], k * c.wrapW), b = at(Q[0], Q[1], k * c.wrapW), len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
      const U: V3 = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
      return { name: sp.name, outer: rect(u0, 0, u1 - u0, c.wrapW), holes: [], soft: true, place: { x: 0, y: 0, z: 0, m: frame(U, X, [a[0] - U[0] * u0, a[1] - U[1] * u0, a[2] - U[2] * u0]) } };
    });
    if (c.wood) sp.name = "Leather body";
    strips.push(pat.add(sp));
  }
  const row = (v: number): Pt[] => [[ce + tm, v], [ce + tm + L, v]];
  const flapTop = (i: number) => (i === nFaces - 1 ? E : 0);
  const facePath = (i: number) => (i === nFaces - 1 && flap ? runOf(faces[i].outer, E)! : path);

  // ---- seams: each face to the strip(s) beside it, middle walls to two strips at once
  for (let i = 0; i < nFaces; i++) {
    const sides: { part: GenPart; rows: Pt[][] }[] = [];
    if (i > 0) sides.push({ part: strips[i - 1], rows: [row(c.wrapW - e)] });
    sides.push({ part: faces[i], rows: [facePath(i)] });
    if (i < c.compartments) sides.push({ part: strips[i], rows: [row(e)] });
    // the face's own path first, so its length sets the count
    const ordered = [sides.find((q) => q.part === faces[i])!, ...sides.filter((q) => q.part !== faces[i])];
    pat.seam(`${faces[i].name} to ${i > 0 && i < c.compartments ? "both gussets" : c.orient === "ends" ? "the body" : "the gusset"}`, ordered);
  }
  // divider walls stitched along lines inside the strip (briefcase, laptop bag)
  for (let j = 1; j <= c.dividers; j++) {
    const dv: GenPart = { id: `divider${j}`, name: `Divider wall ${j}`, outer: face, holes: [], score: [], place: { x: 0, y: 0, z: 0, m: facePlace((c.wrapW * j) / (c.dividers + 1)) } };
    pat.add(dv);
    const v = (c.wrapW * j) / (c.dividers + 1);
    pat.seam(`Divider wall ${j} to the gusset`, [{ part: dv, rows: [path] }, { part: strips[0], rows: [row(v)] }]);
    pat.fold(strips[0], [ce + tm - 2, v], [ce + tm - 0.5, v]);
  }

  // ---- doctor bag: frame channels folded inside at both ends of the body, a row across each
  if (ce > 0) {
    const g = strips[0];
    for (const [u0, sgn] of [[ce, -1], [Ls - ce, 1]] as const) {
      pat.fold(g, [u0, 0], [u0, c.wrapW]);
      const a = ce / 2;
      pat.seam("Frame channel", [{ part: g, rows: [[[u0 + sgn * a, e + 4], [u0 + sgn * a, c.wrapW - e - 4]]] }, { part: g, rows: [[[u0 - sgn * a, e + 4], [u0 - sgn * a, c.wrapW - e - 4]]] }], { ticks: false });
      for (const v of [12, c.wrapW - 12]) { pat.mount("rivet", g, [u0 + sgn * (a + 6), v], 0, "frame channel"); pat.mount("rivet", g, [u0 - sgn * (a + 6), v], 0, "", 20, false); }
    }
    pat.notes.push("The doctor frame (two hinged bars) slides into the channels; buy the frame first and set the bag's width to it.");
  }

  // ---- a zipped top panel joining both faces and the gusset ends
  if (c.zipTop && c.compartments === 1 && !flap && c.shape === "rect") {
    const zp: GenPart = { id: "zippanel", name: "Zip top panel", outer: rect(0, 0, W, c.wrapW), holes: [], score: [], place: { x: 0, y: 0, z: 0, m: frame(A, X, at(0, 0, 0)) } };
    pat.add(zp);
    const g = strips[0], dl = d + 1;
    pat.seam("Front to the zip panel", [{ part: faces[0], rows: [[[e + dl, e], [W - e - dl, e]]] }, { part: zp, rows: [[[e + dl, e], [W - e - dl, e]]] }]);
    pat.seam("Back to the zip panel", [{ part: faces[1], rows: [[[e + dl, e], [W - e - dl, e]]] }, { part: zp, rows: [[[e + dl, c.wrapW - e], [W - e - dl, c.wrapW - e]]] }]);
    pat.seam("Gusset end to the zip panel", [{ part: g, rows: [[[e, e + dl], [e, c.wrapW - e - dl]]] }, { part: zp, rows: [[[e, e + dl], [e, c.wrapW - e - dl]]] }]);
    pat.seam("Gusset end to the zip panel", [{ part: g, rows: [[[Ls - e, e + dl], [Ls - e, c.wrapW - e - dl]]] }, { part: zp, rows: [[[W - e, e + dl], [W - e, c.wrapW - e - dl]]] }]);
    const zl = clamp(p.build.zipLen, 60, W - 4 * e - 16), x0 = (W - zl) / 2, zw = p.build.zipGauge === 3 ? 6 : 8, cy = c.wrapW / 2;
    zp.holes.push(rect(x0, cy - zw / 2, zl, zw));
    for (const sgn of [-1, 1]) pat.line("Zip tape", zp, [[[x0 - 3, cy + sgn * (zw / 2 + 3.5)], [x0 + zl + 3, cy + sgn * (zw / 2 + 3.5)]]], 2);
    pat.count("zipper", 1, `#${p.build.zipGauge}, ${Math.round(zl + 20)} mm or longer`);
    pat.steps.push("Stitch the zip under the slot in the top panel first, then the panel to both faces and the gusset ends.");
  }

  // ---- handles
  const hw = clamp(p.build.handleW, 10, 50), hl = clamp(p.build.handleLen, 80, 800);
  const rivA = 8, rivB = 8 + Math.max(10, hw * 0.6);
  const handlePart = (id: string, name: string, len: number): GenPart => {
    const hp: GenPart = { id, name, outer: roundRect(0, 0, len, hw, [hw / 2.5, hw / 2.5, hw / 2.5, hw / 2.5]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
    pat.add(hp);
    if (hw >= 16) pat.line("Handle edges", hp, [[[rivB + 8, e * 0.8], [len - rivB - 8, e * 0.8]], [[rivB + 8, hw - e * 0.8], [len - rivB - 8, hw - e * 0.8]]], 1);
    return hp;
  };
  /** Fixes a handle end to a part: the handle's end at `ue` (0 or its length), lying along `dir` from `base` on the part. */
  const attachEnd = (hp: GenPart, ue: number, target: GenPart, base: Pt, dir: Pt, label: string) => {
    const sg = ue === 0 ? 1 : -1, map = (u: number, v: number): Pt => [base[0] + dir[0] * u - dir[1] * (v - hw / 2), base[1] + dir[1] * u + dir[0] * (v - hw / 2)];
    if (p.build.attach === "box") {
      const bl = Math.max(hw, 18), a0 = 4, m = Math.min(e, hw / 4);
      const loop: Pt[] = [[a0, m], [a0 + bl, m], [a0 + bl, hw - m], [a0, hw - m], [a0, m]];
      const onH = (q: Pt): Pt => [ue + sg * q[0], q[1]];
      for (const pth of [loop, [[a0, m], [a0 + bl, hw - m]] as Pt[], [[a0, hw - m], [a0 + bl, m]] as Pt[]]) {
        pat.seam(label, [{ part: hp, rows: [pth.map(onH)] }, { part: target, rows: [pth.map((q) => map(q[0], q[1]))] }], { ticks: false });
      }
    } else {
      for (const a of [rivA, rivB]) { pat.mount("rivet", hp, [ue + sg * a, hw / 2], 0, "", 20, false); pat.mount("rivet", target, map(a, hw / 2), 0, "handles"); }
      if (c.reinforce) {
        const pr: GenPart = { id: `${hp.id}-patch${ue ? 2 : 1}`, name: "Rivet backing patch", outer: roundRect(0, 0, hw + 8, rivB - rivA + 16, [4, 4, 4, 4]), holes: [], place: { x: 0, y: 0, z: 0 } };
        pat.add(pr);
        for (const a of [rivA, rivB]) pat.mount("rivet", pr, [hw / 2 + 4, a - rivA + 8], 0, "", 20, false);
      }
    }
  };
  if (c.handles === "faces") {
    const spread = clamp(W * 0.42, 40, W - 40), n = Math.min(2, Math.max(1, Math.round(p.build.handles)));
    for (let i = 0; i < n; i++) {
      const hp = handlePart(`handle${i + 1}`, `Handle ${i + 1}`, hl), target = faces[i === 0 ? 0 : nFaces - 1], top = flapTop(i === 0 ? 0 : nFaces - 1);
      attachEnd(hp, 0, target, [W / 2 - spread / 2, top + e + 6], [0, 1], "Handle to the face");
      attachEnd(hp, hl, target, [W / 2 + spread / 2, top + e + 6], [0, 1], "Handle to the face");
    }
    pat.steps.push(`Fix the handles to the ${n > 1 ? "front and back" : "front"} before stitching the faces to the gusset${p.build.attach === "box" ? " with a box stitch" : ", rivet caps outside"}.`);
  } else if (c.handles === "lid" && flap) {
    // one handle across the lid, between the folds
    const hp = handlePart("handle1", "Top handle", Math.min(hl, W * 0.9)), back = faces[nFaces - 1], len = Math.min(hl, W * 0.9), v = flap + (E - flap) / 2;
    attachEnd(hp, 0, back, [W / 2 - len * 0.32, v - hw / 2 - 2], [1, 0], "Handle to the lid");
    attachEnd(hp, len, back, [W / 2 + len * 0.32, v - hw / 2 - 2], [-1, 0], "Handle to the lid");
  } else if (c.handles === "lip") {
    const hp = handlePart("handle1", "Top handle", Math.min(hl, c.wrapW * 0.8)), g = strips[0], len = Math.min(hl, c.wrapW * 0.8);
    // on the front lip, beyond the frame channel, lying along the bag's length
    attachEnd(hp, 0, g, [2 * ce + 16, c.wrapW / 2 - len * 0.3], [0, 1], "Handle to the body");
    attachEnd(hp, len, g, [2 * ce + 16, c.wrapW / 2 + len * 0.3], [0, -1], "Handle to the body");
  }

  // ---- strap tabs (D-rings at the gusset ends) and the strap
  if (c.strap || c.convertible) {
    const sw = clamp(p.build.strapW, 10, 50), tw = sw - 4, tl = 30;
    const g = strips[0];
    for (const [i, u] of [[1, ce + 16], [2, Ls - ce - 16]] as const) {
      const tab: GenPart = { id: `dtab${i}`, name: `D-ring tab ${i}`, outer: roundRect(0, 0, 2 * tl, tw, [3, 3, 3, 3]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
      pat.add(tab);
      pat.fold(tab, [tl, 0], [tl, tw]);
      pat.mount("rivet", tab, [tl - 20, tw / 2], 0, "", 20, false);
      pat.mount("rivet", tab, [tl + 20, tw / 2], 0, "", 20, false);
      pat.mount("rivet", g, [u, c.dividers ? c.wrapW / (2 * (c.dividers + 1)) : c.wrapW / 2], Math.PI / 2, "strap tabs");
      pat.count("dring", 1, `${sw} mm inside`);
    }
    strapPart(pat, "strap", c.convertible ? "Crossbody strap" : "Shoulder strap", clamp(p.build.strapLen, 300, 2000), sw);
    pat.count("slider", 1, `${sw} mm`);
    if (c.convertible) {
      for (const [i, x] of [[3, 24], [4, W - 24]] as const) {
        const tab: GenPart = { id: `dtab${i}`, name: `Backpack D-ring tab ${i - 2}`, outer: roundRect(0, 0, 2 * tl, tw, [3, 3, 3, 3]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
        pat.add(tab);
        pat.fold(tab, [tl, 0], [tl, tw]);
        pat.mount("rivet", tab, [tl - 20, tw / 2], 0, "", 20, false);
        pat.mount("rivet", tab, [tl + 20, tw / 2], 0, "", 20, false);
        pat.mount("rivet", faces[nFaces - 1], [x, flapTop(nFaces - 1) + H - Math.max(c.r, 20) - 10], 0, "backpack tabs");
        pat.count("dring", 1, `${sw} mm inside`);
      }
      pat.mount("rivet", faces[nFaces - 1], [W / 2, flapTop(nFaces - 1) + e + 14], 0, "top loop");
      pat.notes.push("Clip the strap to the gusset rings to wear it across the body, or to the top loop and the two lower rings as a backpack.");
    }
  }

  // ---- backpack straps (roll-top)
  if (c.backpack) {
    const back = faces[nFaces - 1], sw = clamp(p.build.strapW, 20, 50);
    for (const [i, x] of [[1, W / 2 - 40], [2, W / 2 + 40]] as const) {
      const st = strapPart(pat, `pack${i}`, `Shoulder strap ${i}`, clamp(p.build.strapLen * 0.6, 400, 900), sw);
      pat.mount("rivet", st, [10, sw / 2], 0, "", 20, false);
      pat.mount("rivet", st, [22, sw / 2], 0, "", 20, false);
      pat.mount("rivet", back, [x, c.roll + 18], 0, "shoulder straps");
      pat.mount("rivet", back, [x, c.roll + 30], 0, "shoulder straps");
      const anc: GenPart = { id: `anchor${i}`, name: `Strap anchor ${i}`, outer: roundRect(0, 0, 60, sw + 2, [4, 4, 4, 4]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
      pat.add(anc);
      pat.fold(anc, [30, 0], [30, sw + 2]);
      pat.mount("buckle", anc, [30, (sw + 2) / 2], 0, "strap buckles", sw);
      for (const u of [12, 48]) pat.mount("rivet", anc, [u, (sw + 2) / 2], 0, "", 20, false);
      pat.mount("rivet", back, [i === 1 ? 28 : W - 28, H - Math.max(c.r, 20) - 12], 0, "strap anchors");
    }
    // the roll closure: two straps from the back over the rolled top to buckles on the front
    for (const [i, x] of [[1, W * 0.3], [2, W * 0.7]] as const) {
      const cl = strapPart(pat, `roll${i}`, `Roll strap ${i}`, c.roll + c.wrapW + 160, 20);
      for (const u of [10, 22]) pat.mount("rivet", cl, [u, 10], 0, "", 20, false);
      pat.mount("rivet", back, [x, c.roll + 46], 0, "roll straps");
      const anc: GenPart = { id: `rollbuckle${i}`, name: `Roll buckle tab ${i}`, outer: roundRect(0, 0, 50, 22, [3, 3, 3, 3]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
      pat.add(anc);
      pat.fold(anc, [25, 0], [25, 22]);
      pat.mount("buckle", anc, [25, 11], 0, "roll buckles", 20);
      for (const u of [12, 38]) pat.mount("rivet", anc, [u, 11], 0, "", 20, false);
      pat.mount("rivet", faces[0], [x, c.roll + 70], 0, "roll buckle tabs");
    }
    pat.mount("rivet", back, [W / 2, c.roll + 8], 0, "grab loop");
    pat.steps.push("Roll the top down three times and buckle the roll straps over it.");
  }

  // ---- closures
  const front = faces[0], back = faces[nFaces - 1];
  const cl = p.build.closure;
  if (flap && (cl === "magnet" || cl === "snap")) {
    const a = Math.min(flap * 0.35, 30);
    pat.mount(cl, back, [W / 2, a], Math.PI / 2, "flap closure");
    pat.mount(cl, front, [W / 2, flap - a], Math.PI / 2, "flap closure", 20, false);
  } else if (!flap && !c.zipTop && (cl === "magnet" || cl === "snap")) {
    pat.mount(cl, front, [W / 2, e + 16], Math.PI / 2, "top closure");
    pat.mount(cl, back, [W / 2, e + 16], Math.PI / 2, "top closure", 20, false);
  } else if (flap && cl === "buckle") {
    for (const [i, x] of [[1, W * 0.28], [2, W * 0.72]] as const) {
      const ts = strapPart(pat, `flapstrap${i}`, `Flap strap ${i}`, Math.min(flap * 0.9 + 60, 160), 18, 3);
      for (const u of [8, 20]) { pat.mount("rivet", ts, [u, 9], 0, "", 20, false); }
      for (const u of [8, 20]) pat.mount("rivet", back, [x, u], 0, "flap straps");
      const bt: GenPart = { id: `bucktab${i}`, name: `Buckle tab ${i}`, outer: roundRect(0, 0, 50, 20, [3, 3, 3, 3]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
      pat.add(bt);
      pat.fold(bt, [25, 0], [25, 20]);
      pat.mount("buckle", bt, [25, 10], 0, "flap buckles", 18);
      for (const u of [12, 38]) pat.mount("rivet", bt, [u, 10], 0, "", 20, false);
      pat.mount("rivet", front, [x, flap + 6], 0, "buckle tabs");
    }
  }

  // ---- feet, base stiffener, slip pocket, camera rails
  const uc = ce + tm + L / 2, fx = clamp((c.orient === "front" ? W : W) / 2 - c.r - 16, 10, Ls / 4), g = strips[0];
  if (c.reinforce) {
    const Lb = Math.max(30, W - 2 * c.r - 6), wb = c.wrapW - 2 * e - 4;
    const st: GenPart = { id: "stiffener", name: "Base stiffener (leatherboard)", outer: rect(0, 0, Lb, wb), holes: [], place: { x: 0, y: 0, z: 0 } };
    pat.add(st);
    if (c.feet && !c.backpack) for (const du of [-fx, fx]) for (const v of [0.22, 0.78]) pat.mount("foot", st, [Lb / 2 + du, (c.wrapW * v) - e - 2], 0, "", 20, false);
  }
  if (c.feet && !c.backpack) for (const du of [-fx, fx]) for (const v of [0.22, 0.78]) pat.mount("foot", g, [uc + du, c.wrapW * v], 0, "bag feet");
  if (c.pocket && !c.wood) {
    const Wp = clamp(W - 2 * (c.r + 12), 40, W - 20), Hp = clamp(H * 0.42, 40, H - 30);
    const pk: GenPart = { id: "pocket", name: "Slip pocket", outer: roundRect(0, 0, Wp, Hp, [2, 2, 6, 6]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
    pat.add(pk);
    const run = runBelow(offsetContour(pk.outer, -e)!, tm + 0.05)!;
    const ox = (W - Wp) / 2, oy = flapTop(nFaces - 1) + Math.max(e + 30, H * 0.22);
    pat.seam("Slip pocket to the back", [{ part: pk, rows: [run] }, { part: back, rows: [run.map(([x, y]) => [x + ox, y + oy] as Pt)] }]);
    pat.line("Pocket top edge", pk, [[[e + s.pitch, e], [Wp - e - s.pitch, e]]]);
  }
  if (c.rails) {
    const rl = W - 2 * (e + 6), rh = 22, slotW = T + 0.6, pitchR = 25;
    const dvH = H - 24, dvL = c.wrapW - 2 * T - 2;
    for (const which of ["front", "back"]) {
      const rail: GenPart = { id: `rail-${which}`, name: `Divider rail (${which})`, outer: roundRect(0, 0, rl, rh, [3, 3, 3, 3]), holes: [], place: { x: 0, y: 0, z: 0 } };
      for (let x = pitchR; x < rl - pitchR / 2; x += pitchR) rail.holes.push(rect(x - slotW / 2, rh / 2 - 6, slotW, 12));
      pat.add(rail);
    }
    for (let j = 1; j <= c.rails; j++) {
      const dv: GenPart = { id: `camdiv${j}`, name: `Removable divider ${j}`, outer: [[0, 0], [dvL, 0], [dvL, dvH * 0.5 - 5], [dvL + 6, dvH * 0.5 - 5], [dvL + 6, dvH * 0.5 + 5], [dvL, dvH * 0.5 + 5], [dvL, dvH], [0, dvH], [0, dvH * 0.5 + 5], [-6, dvH * 0.5 + 5], [-6, dvH * 0.5 - 5], [0, dvH * 0.5 - 5]], holes: [], place: { x: 0, y: 0, z: 0 } };
      pat.add(dv);
    }
    pat.steps.push("Glue the two divider rails inside the front and back, level with each other; slide the dividers' tabs into whichever slots suit the camera.");
  }

  // ---- lining: copies of the faces and gussets, trimmed at the opening, with the seam holes
  if (lining) {
    const tl = clamp(p.build.liningT, 0.4, 2), cl2 = clamp(p.build.liningClear, 0, 4);
    for (const src of [...faces, ...strips]) {
      const isStrip = strips.includes(src);
      const trim = isStrip ? rect(cl2, -1, Ls - 2 * cl2, c.wrapW + 2) : rect(-1, src === back && flap ? -1 : cl2, W + 2, H + E + 2);
      const lp: GenPart = { id: `${src.id}-lining`, name: `${src.name} lining`, outer: src.outer, holes: [], t: tl, material: "second", place: { x: 0, y: 0, z: 0 } };
      // the lining's outline: the outer's, cut back at the opening edge
      const cutOuter = clipToRect(src.outer, trim);
      lp.outer = cutOuter;
      // the seam holes it shares with the outer (they are stitched through both)
      for (const h of pat.holes.get(src.id) ?? []) if (h.what.includes(" to ") && pointInContour(h.pt, cutOuter)) {
        if (s.mode === "laser") lp.holes.push(holeOutline({ pt: h.pt, t: h.t ?? [1, 0] }, s));
      }
      pat.add(lp);
    }
    pat.steps.push("Glue each lining to its panel, flesh sides together, before stitching: the seams go through both.");
  }

  // ---- decoration on the flap, or on the front
  const decoOn = flap ? back : front;
  const region = flap ? rect(e + 4, 4, W - 2 * e - 8, flap - 8) : face;
  decorate(p, pat, decoOn, region, flap ? 0 : tm + 20);

  // ---- assembly
  pat.steps.unshift(
    "Cut every part; check the hole counts on mating edges (the seam table lists them).",
    ...(c.wood ? ["Sand and finish the wood end panels before stitching; the stitch holes are cut in them too."] : []),
  );
  pat.steps.push(
    c.compartments > 1 ? "Stitch the front to the first gusset, the middle panel to both gussets through the same holes, then the back to the last gusset." : c.orient === "ends" ? "Stitch each end panel to the body, starting from a top corner." : "Stitch the front to the gusset from one top corner round to the other, then the back.",
    ...(c.dividers ? [`Stitch the divider wall${c.dividers > 1 ? "s" : ""} along the lines marked inside the gusset before the back goes on.`] : []),
    ...(c.feet ? ["Set the bag feet through the gusset base (and the stiffener inside it)."] : []),
    "Bevel, sand and burnish the edges.",
  );

  return { L, Ls, E, cfg: c, size: [c.orient === "front" ? W : c.wrapW, c.orient === "front" ? Dtot : W, H] as V3 };
}

/**
 * A strap: rounded ends, edge stitching on wider straps, optional buckle holes near its end. A strap
 * longer than the bed allows (pat.maxLen) is made in two pieces joined by a buckle: the first ends
 * in a buckle fold (prong slot, rivets mirrored about the fold), the second starts with a row of
 * adjustment holes; `strapEnd` maps a position near the strap's far end onto the second piece.
 */
export function strapPart(pat: Pattern, id: string, name: string, len: number, w: number, holes = 0): GenPart {
  const e = pat.s.edge;
  const one = (pid: string, pname: string, L: number) => {
    const st: GenPart = { id: pid, name: pname, outer: roundRect(0, 0, L, w, [w / 2.2, w / 2.2, w / 2.2, w / 2.2]), holes: [], score: [], place: { x: 0, y: 0, z: 0 } };
    pat.add(st);
    return st;
  };
  const edges = (st: GenPart, u0: number, u1: number) => { if (w >= 18 && u1 - u0 > 60) pat.line(`${st.name} edges`, st, [[[u0, e * 0.8], [u1, e * 0.8]], [[u0, w - e * 0.8], [u1, w - e * 0.8]]]); };
  if (len <= pat.maxLen) {
    const st = one(id, name, len);
    for (let i = 0; i < holes; i++) pat.punch(st, [len - 14 - i * 14, w / 2], clamp(w * 0.2, 3, 5), "Buckle holes");
    if (len > 120) edges(st, 30, len - (holes ? 28 + (holes - 1) * 14 : 30));
    return st;
  }
  const fb = 30, nh = 5, hp = 22;
  const la = Math.min(pat.maxLen, Math.round(len / 2 + 40)), lb = Math.min(pat.maxLen, Math.round(len - (la - fb) + 60));
  const a = one(id, `${name} (buckle half)`, la), b = one(`${id}b`, `${name} (hole half)`, lb);
  pat.fold(a, [la - fb, 0], [la - fb, w]);
  const sl = clamp(w * 0.7, 12, 30);
  a.holes.push(rect(la - fb - sl / 2, w / 2 - 2.5, sl, 5));
  pat.mount("rivet", a, [la - fb - 15, w / 2], 0, `${name.toLowerCase()} buckle fold`);
  pat.mount("rivet", a, [la - fb + 15, w / 2], 0, "", 20, false);
  pat.count("buckle", 1, `${Math.round(w)} mm, joins the ${name.toLowerCase()}`);
  for (let i = 0; i < nh; i++) pat.punch(b, [40 + i * hp, w / 2], clamp(w * 0.12, 3, 5), "Strap holes");
  for (let i = 0; i < holes; i++) pat.punch(b, [lb - 14 - i * 14, w / 2], clamp(w * 0.2, 3, 5), "Buckle holes");
  edges(a, 30, la - 2 * fb - 10);
  edges(b, 40 + (nh - 1) * hp + 25, lb - (holes ? 28 + (holes - 1) * 14 : 30));
  pat.splits.set(id, { part: b, off: len - lb });
  pat.notes.push(`The ${name.toLowerCase()} is longer than the bed, so it is cut in two halves joined by a buckle; its length adjusts over ${nh} holes.`);
  return a;
}

/** The part and its own position for a point `u` along a strap from strapPart (the second half when it was split and u is past the first). */
export function strapEnd(pat: Pattern, st: GenPart, u: number): { part: GenPart; u: number } {
  const sp = pat.splits.get(st.id);
  if (!sp || u < sp.off + 1) return { part: st, u };
  return { part: sp.part, u: u - sp.off };
}

/** The part of a contour inside a rectangle. */
export function clipToRect(c: Contour, r: Contour): Contour {
  // Sutherland–Hodgman against the rectangle's four sides
  const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let out = c;
  const clip = (inside: (q: Pt) => boolean, cross: (a: Pt, b: Pt) => Pt) => {
    const res: Pt[] = [];
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if (inside(b)) { if (!inside(a)) res.push(cross(a, b)); res.push(b); } else if (inside(a)) res.push(cross(a, b));
    }
    out = res;
  };
  const atX = (x: number) => (a: Pt, b: Pt): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const atY = (y: number) => (a: Pt, b: Pt): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  clip((q) => q[0] >= x0, atX(x0)); clip((q) => q[0] <= x1, atX(x1)); clip((q) => q[1] >= y0, atY(y0)); clip((q) => q[1] <= y1, atY(y1));
  return out;
}
