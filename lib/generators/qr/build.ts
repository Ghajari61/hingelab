import { markLetters } from "../textOps";
/**
 * QR code plates and signs. The module matrix comes from the encoder; this file turns it into shapes
 * in one of eight module styles (with the corner eyes in their own shapes if asked) and lays out the
 * plate: quiet zone, header picture, label, centre logo, frame, keyring ear or wall holes, and a
 * stand (tabs into a slotted base, slotted feet, or a tent card on a living hinge).
 * Three outputs: engraved; cut through a light top plate glued on a contrasting backplate; or a paint
 * stencil whose holes are row runs with bridges between the rows, so no part of it falls out.
 */
import { differenceShapes, intersectShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { arc, bboxOf, circle, customOutline, deg, rect, reverse, roundedRect, stadium } from "../geom";
import { itemOf, tagItem } from "../items";
import { makeShape } from "@/lib/letters/polygon";
import { orient } from "../shapes";
import { hingeSlits } from "../tablenum/build";
import { tabsUnder, withSticks } from "../weld";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { HEART_PATH } from "../util";
import { CONTENT_NAMES, qrMatrix, qrPayload, type QrMatrix } from "./encode";
import { cornerBox, eyeContours, resolveEyes, type EyeBall, type EyeFrame } from "./eyes";
import { badgeAspect, badgeContours } from "./icons";
import { cornerHole, plateOutline } from "./plates";
import { ECC_RECOVERY, type ModuleStyle, type QrParams } from "./params";

/** The code area (with its quiet zone) of a plate this build made, for the cut-out pattern to avoid. */
export const CODE_AREA = new WeakMap<GenPart, Contour[]>();

export interface QrInfo {
  payload: string;
  version: number;
  /** Modules across. */
  n: number;
  /** Module size, mm. */
  module: number;
  /** Light pieces that come loose from a cut-out top plate. */
  islands: number;
  /** Letter counters that fall out of a stencil. */
  counters: number;
  /** Share of the modules the logo clears. */
  logoShare: number;
  /** Light margin around the code, mm (quiet zone plus the plate border inside any frame). */
  margin: number;
  /** Stencil bridge, mm. */
  bridge: number;
  plateW: number;
  plateH: number;
  /** The keyring or a wall hole reaches into the quiet zone. */
  holeInQuiet: boolean;
  stand: QrParams["stand"]["kind"];
  /** Height of the sign over the depth of its base or feet (tall and shallow tips over). */
  standTip: number;
}

export type QrOutput = GenOutput & { info?: QrInfo };

const r1 = (v: number) => Math.round(v * 10) / 10;
const ASK: Record<QrParams["content"]["kind"], string> = {
  url: "the web address", text: "the text", wifi: "the Wi-Fi network name", vcard: "a name or company", email: "the email address", sms: "the phone number", phone: "the phone number",
  whatsapp: "the WhatsApp number", map: "an address or coordinates", event: "the event's title and date (YYYY-MM-DD)",
};
const move = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as Pt));

const finderAt = (n: number): [number, number][] => [[0, 0], [0, n - 7], [n - 7, 0]];
export const isFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/** Centres of the alignment patterns (QR spec table, as a formula), clear of the finders. */
export function alignCentres(n: number): [number, number][] {
  const v = (n - 17) / 4;
  if (v < 2) return [];
  const count = Math.floor(v / 7) + 2;
  const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (count * 2 - 2)) * 2;
  const pos = [6];
  for (let p = n - 7; pos.length < count; p -= step) pos.splice(1, 0, p);
  const out: [number, number][] = [];
  for (const r of pos) for (const c of pos) if (!isFinder(r, c, n)) out.push([r, c]);
  return out;
}

/** Finder (7 × 7) or alignment (5 × 5) patterns: top-left module and size. */
function patterns(n: number): [number, number, number][] {
  return [...finderAt(n).map(([r, c]) => [r, c, 7] as [number, number, number]), ...alignCentres(n).map(([r, c]) => [r - 2, c - 2, 5] as [number, number, number])];
}

function inPattern(r: number, c: number, pats: [number, number, number][]) {
  return pats.some(([pr, pc, k]) => r >= pr && r < pr + k && c >= pc && c < pc + k);
}

/**
 * A stencil finder or alignment pattern: its ring as four bars in a pinwheel, leaving a bridge at
 * each corner that holds the light ring inside, and the solid centre. The middle rows and columns,
 * which scanners measure, stay unbroken.
 */
function pinwheel(x: number, y: number, k: number, m: number, b: number): Contour[] {
  const e = (k - 1) * m, h = b / 2, c = k === 7 ? 3 : 1;
  return [
    rect(x + h, y + h, e - b - h, m - h), rect(x + e, y + h, m - h, e - b - h),
    rect(x + m + b, y + e, e - b - h, m - h), rect(x + h, y + m + b, m - h, e - b - h),
    rect(x + 2 * m, y + 2 * m, c * m, c * m),
  ];
}

/** Modules a centre logo of `pct` % of the code clears (every module its square touches). */
export function logoCells(n: number, pct: number): number {
  const L = (n * Math.min(40, Math.max(5, pct))) / 100;
  let k = 0;
  for (let c = 0; c < n; c++) if (Math.abs(c + 0.5 - n / 2) < L / 2 + 0.5) k++;
  return k * k;
}

/** A finder (k = 7) or alignment (k = 5) pattern as one rounded ring and a rounded centre (dots and connected styles). */
function roundPattern(x: number, y: number, k: number, m: number): Contour[] {
  const c = k === 7 ? 3 : 1;
  return [
    roundedRect(x, y, k * m, k * m, (k - 3) * 0.5 * m), reverse(roundedRect(x + m, y + m, (k - 2) * m, (k - 2) * m, (k - 3) * 0.35 * m)),
    roundedRect(x + 2 * m, y + 2 * m, c * m, c * m, c * 0.3 * m),
  ];
}

/** Horizontal runs of dark modules in each row: [row, first column, last column]. */
function runs(on: (r: number, c: number) => boolean, n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let r = 0; r < n; r++) {
    let c = 0;
    while (c < n) {
      if (!on(r, c)) { c++; continue; }
      const c0 = c;
      while (c < n && on(r, c)) c++;
      out.push([r, c0, c - 1]);
    }
  }
  return out;
}

/** Finder eyes drawn in their own shapes (custom eye frame or ball). */
export interface EyeShapes { frame: Exclude<EyeFrame, "auto">; ball: Exclude<EyeBall, "auto"> }

/** Runs of dark modules down each column: [column, first row, last row]. */
const columnRuns = (on: (r: number, c: number) => boolean, n: number) => runs((c, r) => on(r, c), n);

/** The dark modules as filled shapes in a module style, the grid's top-left at (ox, oy). */
export function moduleShapes(on: (r: number, c: number) => boolean, n: number, m: number, style: ModuleStyle, dot: number, ox = 0, oy = 0, eyes?: EyeShapes): Shape[] {
  if (eyes) {
    // the finders in their own shapes, the other modules in the style
    const rest = moduleShapes((r, c) => on(r, c) && !isFinder(r, c, n), n, m, style, dot, ox, oy);
    const cs = finderAt(n).filter(([r, c]) => on(r + 3, c + 3)).flatMap(([r, c]) => eyeContours(r, c, m, eyes.frame, eyes.ball, ox, oy));
    return unionShapes([...shapeContours(rest), ...cs], [], false, true);
  }
  const at = (r: number, c: number): Pt => [ox + (c + 0.5) * m, oy + (r + 0.5) * m];
  if (style === "square" || style === "rounded") {
    const cs = runs(on, n).map(([r, c0, c1]) => rect(ox + c0 * m, oy + r * m, (c1 - c0 + 1) * m, m));
    const sq = unionShapes(cs, [], false, true);
    if (style === "square") return sq;
    const k = 0.4 * m;
    return offsetShapes(offsetShapes(sq, -k), k);
  }
  const d = (Math.min(100, Math.max(40, dot)) / 100) * m;
  const cs: Contour[] = [];
  const pats = patterns(n).filter(([pr, pc, k]) => on(pr + (k >> 1), pc + (k >> 1)));
  for (const [pr, pc, k] of pats) cs.push(...roundPattern(ox + pc * m, oy + pr * m, k, m));
  const free = (r: number, c: number) => on(r, c) && !inPattern(r, c, pats);
  if (style === "vlines" || style === "hlines") {
    // bars along each column (or row) of dark modules, single modules as round dots
    const v = style === "vlines";
    for (const [a, b0, b1] of v ? columnRuns(free, n) : runs(free, n)) {
      const [x0, y0] = v ? at(b0, a) : at(a, b0), [x1, y1] = v ? at(b1, a) : at(a, b1);
      cs.push(b0 === b1 ? circle(x0, y0, d / 2, 0.02) : stadium(x0, y0, x1, y1, d));
    }
    return unionShapes(cs, [], false, true);
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!free(r, c)) continue;
    const [x, y] = at(r, c);
    if (style === "tiny") cs.push(rect(x - d / 2, y - d / 2, d, d));
    else if (style === "diamond") { const R = Math.min(0.49 * m, 0.62 * d); cs.push([[x, y - R], [x + R, y], [x, y + R], [x - R, y]]); }
    else cs.push(circle(x, y, d / 2, 0.02));
    if (style === "connected") {
      if (c + 1 < n && free(r, c + 1)) cs.push(stadium(x, y, x + m, y, d));
      if (r + 1 < n && free(r + 1, c)) cs.push(stadium(x, y, x, y + m, d));
    }
  }
  return unionShapes(cs, [], false, true);
}

/**
 * Stencil holes: each row's runs of dark modules, thinned by the bridge so a strip of material runs
 * the full width between every two rows (between every two columns for vertical bars). Every bit of
 * the stencil is joined to the border.
 */
export function stencilHoles(on: (r: number, c: number) => boolean, n: number, m: number, style: ModuleStyle, dot: number, bridge: number, ox = 0, oy = 0): Contour[] {
  const w = m - bridge;
  const out: Contour[] = [];
  const pats = patterns(n).filter(([pr, pc, k]) => on(pr + (k >> 1), pc + (k >> 1)));
  for (const [pr, pc, k] of pats) out.push(...pinwheel(ox + pc * m, oy + pr * m, k, m, bridge));
  const free = (r: number, c: number) => on(r, c) && !inPattern(r, c, pats);
  if (style === "dots" || style === "tiny" || style === "diamond") {
    const rr = Math.min(((Math.min(100, Math.max(40, dot)) / 100) * m) / 2, w / 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!free(r, c)) continue;
      const x = ox + (c + 0.5) * m, y = oy + (r + 0.5) * m;
      if (style === "tiny") out.push(rect(x - rr, y - rr, 2 * rr, 2 * rr));
      else if (style === "diamond") { const R = Math.min(rr * 1.2, w / 2); out.push([[x, y - R], [x + R, y], [x, y + R], [x - R, y]]); }
      else out.push(circle(x, y, rr, 0.02));
    }
    return out;
  }
  if (style === "vlines") {
    for (const [c, r0, r1] of columnRuns(free, n)) {
      const y0 = oy + r0 * m, y1 = oy + (r1 + 1) * m, x = ox + c * m + bridge / 2;
      out.push(stadium(x + w / 2, y0 + w / 2, x + w / 2, y1 - w / 2, w));
    }
    return out;
  }
  for (const [r, c0, c1] of runs(free, n)) {
    const x0 = ox + c0 * m, x1 = ox + (c1 + 1) * m, y = oy + r * m + bridge / 2;
    if (style === "square") out.push(rect(x0, y, x1 - x0, w));
    else out.push(stadium(x0 + w / 2, y + w / 2, x1 - w / 2, y + w / 2, w));
  }
  return out;
}

/** Centre logo outline(s) in a box of side s centred on (0, 0). */
function logoContours(p: QrParams, s: number, ctx: BuildContext, missing: string[]): { cs: Contour[]; loading: boolean } {
  const L = p.logo;
  if (L.kind === "heart") {
    const h = customOutline(HEART_PATH, s, s * 0.9);
    return { cs: h ? [h] : [], loading: false };
  }
  if (L.kind === "star") {
    const pts: Contour = [];
    for (let i = 0; i < 10; i++) {
      const a = deg(-90 + i * 36), R = i % 2 ? s * 0.21 : s / 2;
      pts.push([R * Math.cos(a), R * Math.sin(a) + s * 0.06]);
    }
    return { cs: [pts], loading: false };
  }
  if (L.kind === "wifi") {
    const cy = s * 0.34;
    const band = (r0: number, r1: number): Contour => [...arc(0, cy, r1, deg(-135), deg(-45)), ...arc(0, cy, r0, deg(-45), deg(-135))];
    return { cs: [circle(0, cy - s * 0.02, s * 0.1), band(s * 0.26, s * 0.4), band(s * 0.54, s * 0.68)], loading: false };
  }
  if (L.kind === "text" && L.text.trim()) {
    if (!ctx.text) return { cs: [], loading: true };
    let t = ctx.text(L.text.trim(), p.label.fontId, s * 0.5);
    if (!t) return { cs: [], loading: true };
    if (t.width > s) t = ctx.text(L.text.trim(), p.label.fontId, (s * 0.5 * s) / t.width) ?? t;
    for (const c of t.missing) if (!missing.includes(c)) missing.push(c);
    return { cs: t.contours, loading: false };
  }
  return { cs: [], loading: false };
}

const TAB_W = 14;
const CLEAR = 0.1;
const rot180 = (cs: Contour[], cx: number, cy: number) => cs.map((c) => c.map(([x, y]) => [2 * cx - x, 2 * cy - y] as Pt));

/** A foot for a leaning sign: a low block with a slot that leans back by `lean` degrees. */
export function footProfile(D: number, hF: number, slotW: number, lean: number, at: number): { outer: Contour; floor: number } {
  const floor = Math.max(3, hF * 0.28);
  const a = deg(lean), u: Pt = [-Math.sin(a), -Math.cos(a)], nn: Pt = [Math.cos(a), -Math.sin(a)];
  const P: Pt = [at, hF - floor], hw = slotW / 2, len = hF * 3;
  const slot: Contour = [
    [P[0] - nn[0] * hw, P[1] - nn[1] * hw], [P[0] + nn[0] * hw, P[1] + nn[1] * hw],
    [P[0] + nn[0] * hw + u[0] * len, P[1] + nn[1] * hw + u[1] * len], [P[0] - nn[0] * hw + u[0] * len, P[1] - nn[1] * hw + u[1] * len],
  ];
  const body = cornerBox(0, 0, D, hF, [hF * 0.75, hF * 0.75, 1, 1]);
  const s = differenceShapes([orient(body)], [orient(slot)]);
  return { outer: s.reduce((x, y) => (y.area > x.area ? y : x)).outer, floor };
}

export function buildQr(p: QrParams, ctx: BuildContext): QrOutput {
  const payload = qrPayload(p.content);
  if (!payload) return { parts: [], stats: [], error: `Add ${ASK[p.content.kind]} under Content.` };
  const mat: QrMatrix | null = qrMatrix(payload, p.code.ecc);
  if (!mat) return { parts: [], stats: [], error: "There is too much content for one QR code; shorten it or choose a lower error correction." };
  const { n } = mat;
  const out = p.output.kind;
  const stand = out === "stencil" ? "none" : out === "cutout" && p.stand.kind === "tent" ? "none" : p.stand.kind;
  const S = Math.max(5, p.code.size), m = S / n;
  const q = Math.max(0, Math.round(p.code.quiet)) * m;
  const W = S + 2 * q;
  const missing: string[] = [];
  let loading = false;

  // Label lines.
  const lines: { cs: Contour[]; w: number }[] = [];
  const ls = Math.max(1, p.label.size), lead = ls * 1.5;
  if (p.label.text.trim()) {
    if (!ctx.text) loading = true;
    else for (const line of p.label.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const t = ctx.text(line, p.label.fontId, ls);
      if (!t) { loading = true; break; }
      for (const c of t.missing) if (!missing.includes(c)) missing.push(c);
      lines.push({ cs: t.contours, w: t.width });
    }
  }
  const bar = lines.length > 0 && p.label.style === "bar" && out === "engrave";
  const bp = bar ? ls * 0.45 : 0;
  const lw = lines.reduce((a, l) => Math.max(a, l.w), 0) + 2 * bp;
  const lh = lines.length ? ls + (lines.length - 1) * lead + 2 * bp : 0;
  const pos = p.label.position;
  const gap = lines.length ? (pos === "right" ? Math.max(ls * 0.8, 2) : Math.max(ls * 0.5, 1)) : 0;

  // Content box: the code with its quiet zone, and the label.
  let cw: number, ch: number, qx: number, qy: number;
  let label: Contour[] = [];
  let labelBox: Contour | null = null;
  if (!lines.length) { cw = W; ch = W; qx = 0; qy = 0; }
  else if (pos === "right") {
    cw = W + gap + lw; ch = Math.max(W, lh); qx = 0; qy = (ch - W) / 2;
    const y0 = (ch - lh) / 2;
    lines.forEach((l, k) => label.push(...move(l.cs, W + gap + bp + l.w / 2, y0 + bp + ls / 2 + k * lead)));
    labelBox = roundedRect(W + gap, y0, lw, lh, bp * 1.2);
  } else {
    cw = Math.max(W, lw); ch = W + gap + lh; qx = (cw - W) / 2;
    qy = pos === "above" ? lh + gap : 0;
    const y0 = pos === "above" ? 0 : W + gap;
    lines.forEach((l, k) => label.push(...move(l.cs, cw / 2, y0 + bp + ls / 2 + k * lead)));
    labelBox = roundedRect((cw - lw) / 2, y0, lw, lh, bp * 1.2);
  }

  // Header picture above everything (review stars, a menu, Wi-Fi…).
  let badge: Contour[] = [];
  if (p.badge.kind !== "none") {
    const bh = Math.max(3, p.badge.size), bw = bh * badgeAspect(p.badge.kind), bgap = Math.max(2, bh * 0.4);
    const dy = bh + bgap, dx = bw > cw ? (bw - cw) / 2 : 0;
    qx += dx; qy += dy;
    label = move(label, dx, dy);
    if (labelBox) labelBox = move([labelBox], dx, dy)[0];
    cw = Math.max(cw, bw); ch += dy;
    badge = badgeContours(p.badge.kind, bh, cw / 2, bh / 2);
  }
  if (bar && labelBox) label = shapeContours(differenceShapes([labelBox], label));
  const ox = qx + q, oy = qy + q;

  // Centre logo: modules under it are cleared.
  const logoBox = p.logo.kind === "none" || (p.logo.kind === "text" && !p.logo.text.trim()) ? 0 : (S * Math.min(40, Math.max(5, p.logo.size))) / 100;
  const lcx = ox + S / 2, lcy = oy + S / 2;
  const near = (i: number) => Math.abs(i + 0.5 - n / 2) < logoBox / m / 2 + 0.5;
  const clear = (r: number, c: number) => logoBox > 0 && near(r) && near(c);
  const cleared = logoBox > 0 ? logoCells(n, p.logo.size) : 0;
  const on = (r: number, c: number) => mat.dark[r][c] && !clear(r, c);
  const logoRes = logoBox > 0 ? logoContours(p, logoBox * 0.8, ctx, missing) : { cs: [], loading: false };
  if (logoRes.loading) loading = true;
  const logo = move(logoRes.cs, lcx, lcy);

  // Plate outline (a tent folds along a straight top edge, so it is always a rectangle).
  const pad = Math.max(0, p.plate.padding);
  const shape = stand === "tent" ? "rect" : p.plate.shape;
  const pl = plateOutline(shape, cw, ch, pad, Math.max(0, p.plate.corner), p.plate.stake);
  const plate = pl.outline;
  const round = shape === "circle";
  let outer = plate;
  const keyHoles: Contour[] = [];
  const clears: Contour[] = [];
  let holeInQuiet = false;
  const inQuiet = (c: Pt, r: number) => c[0] + r > qx && c[1] + r > qy && c[0] - r < qx + W && c[1] - r < qy + W;
  if (p.keyring.kind !== "none" && stand !== "tent") {
    const d = Math.max(2, p.keyring.diameter), Re = d / 2 + Math.max(2.5, d * 0.5);
    let c: Pt;
    if (p.keyring.kind === "corner" && shape === "rect") {
      c = [-pad + 0.2 * Re, -pad + 0.2 * Re];
      outer = unionShapes([plate, circle(c[0], c[1], Re)])[0]?.outer ?? plate;
    } else if (p.keyring.kind === "corner") c = cornerHole(plate, 0, 0, d / 2, Math.max(2, d * 0.5));
    else {
      c = [cw / 2, pl.top - 0.5 * Re];
      outer = unionShapes([plate, circle(c[0], c[1], Re)])[0]?.outer ?? plate;
    }
    keyHoles.push(reverse(circle(c[0], c[1], d / 2)));
    clears.push(circle(c[0], c[1], d / 2 + 1.5));
    holeInQuiet ||= inQuiet(c, d / 2);
  }
  if (stand === "wall") {
    const d = Math.max(2, p.stand.holeD);
    const at: [number, number][] = p.stand.holes === "four" ? [[0, 0], [1, 0], [0, 1], [1, 1]] : [[0, 0], [1, 0]];
    for (const [fx, fy] of at) {
      const c = cornerHole(plate, fx, fy, d / 2, Math.max(2.5, d * 0.6));
      keyHoles.push(reverse(circle(c[0], c[1], d / 2)));
      clears.push(circle(c[0], c[1], d / 2 + 1.5));
      holeInQuiet ||= inQuiet(c, d / 2);
    }
  }

  // Frame: a ring in the plate border, clear of the holes.
  const fw = Math.max(0.3, p.plate.frameWidth);
  const framed = p.plate.frame && out !== "stencil" && pad > fw;
  let ring: Contour[] = [];
  if (framed) {
    const inset = Math.max(0.5, (pad - fw) / 2);
    const base = unionShapes([plate]);
    const o = offsetShapes(base, -inset), i = offsetShapes(base, -inset - fw);
    ring = shapeContours(differenceShapes(shapeContours(o), [...shapeContours(i), ...clears]));
    if (p.plate.frameStyle === "corners") {
      const b = bboxOf([plate]), k = Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.24;
      const boxes = [rect(b.x0, b.y0, k, k), rect(b.x1 - k, b.y0, k, k), rect(b.x0, b.y1 - k, k, k), rect(b.x1 - k, b.y1 - k, k, k)];
      ring = shapeContours(intersectShapes(ring, shapeContours(unionShapes(boxes))));
    }
  }
  const inverted = out === "engrave" && p.code.invert;
  const roomBelow = lines.length && pos !== "above" ? gap : Infinity;
  const roomAbove = p.badge.kind !== "none" || (lines.length && pos === "above") ? Math.max(1, Math.max(2, p.badge.size * 0.4)) : Infinity;
  const margin = inverted ? q : q + Math.min(framed ? Math.max(0.5, (pad - fw) / 2) : pad, roomBelow, lines.length && pos === "above" ? gap : roomAbove);

  // Modules.
  const b = out === "stencil" ? (m * Math.min(45, Math.max(5, p.output.bridge))) / 100 : 0;
  const customEyes = out !== "stencil" && (p.code.eyeFrame !== "auto" || p.code.eyeBall !== "auto");
  const eyes = customEyes ? resolveEyes(p.code.style, p.code.eyeFrame, p.code.eyeBall) : undefined;
  let islands = 0;
  let modules: Contour[];
  if (out === "stencil") modules = stencilHoles(on, n, m, p.code.style, p.code.dot, b, ox, oy);
  else {
    const shapes = moduleShapes(on, n, m, p.code.style, p.code.dot, ox, oy, eyes);
    islands = shapes.reduce((a, s) => a + s.holes.length, 0);
    modules = shapeContours(shapes);
    if (inverted) modules = shapeContours(differenceShapes([rect(qx, qy, W, W)], modules));
  }
  const text = [...label, ...(p.logo.kind === "text" ? logo : [])];
  const badgeHoles = badge.length ? unionShapes(badge, [], false, true).reduce((a, s) => a + s.holes.length, 0) : 0;
  const counters = (text.length ? unionShapes(text, [], true).reduce((a, s) => a + s.holes.length, 0) : 0) + (out === "stencil" ? badgeHoles : 0);
  if (out === "cutout") islands += counters + badgeHoles;

  // Parts, moved so the plate's top-left is at (0, 0).
  const bb = bboxOf([outer]);
  const dx = -bb.x0, dy = -bb.y0;
  const T = p.T;
  const mv = (cs: Contour[]) => move(cs, dx, dy);
  const Wp = bb.x1 - bb.x0, Hp = bb.y1 - bb.y0;
  // The code with its quiet zone and a module more, which a cut-out pattern must leave solid to scan.
  const codeArea = mv([rect(qx - m, qy - m, W + 2 * m, W + 2 * m)])[0];
  let face = mv([outer])[0];

  // Stands: tabs into a slotted base, or a level bottom for the feet.
  const plates = out === "cutout" ? 2 : 1;
  const slotW = plates * T + CLEAR;
  const layers = Math.max(1, Math.min(3, Math.round(p.stand.layers)));
  const depth = Math.max(25, p.stand.depth);
  const baseL = Math.max(Wp * 0.85, 2 * TAB_W + 30);
  let tabXs: number[] = [], tabW = TAB_W, tabLen = 0;
  if (stand === "base") {
    tabLen = layers === 1 ? T : T * (layers - 1);
    const tabs = tabsUnder(face, Wp, Hp, Math.min(Wp * 0.28, baseL * 0.3), TAB_W);
    tabXs = tabs.xs; tabW = tabs.w;
    face = withSticks(makeShape(face, []), tabXs.map((x) => ({ x, length: tabLen, width: tabW, tip: 0 }))).outer;
  }
  const feetXs = stand === "feet" ? [Wp * 0.2, Wp * 0.8] : [];
  if (stand === "feet") face = withSticks(makeShape(face, []), feetXs.map((x) => ({ x, length: 0, width: Math.max(10, 3 * T), tip: 0 }))).outer;
  const Hs = bboxOf([face]).y1;

  const parts: GenPart[] = [];
  const engraved = out === "engrave";
  const scored = engraved && p.label.mark === "score" && !bar && label.length > 0;
  const marks = {
    engrave: [...tagItem(mv(modules), "Code"), ...tagItem(mv(logo), "Logo"), ...tagItem(mv(badge), "Picture"), ...(scored ? [] : tagItem(mv(label), "Label")), ...mv(ring)],
    score: scored ? tagItem(markLetters({ contours: mv(label) }, "score").score ?? [], "Label") : [],
  };
  if (stand === "tent") {
    // one piece: the back face upside down above a living hinge, the front face below; folded over
    // it stands as a tent with the code on both sides
    const band = Math.max(8, p.stand.band);
    const top = rot180([face], Wp / 2, Hp / 2)[0];
    const outerT = unionShapes([orient(top), orient(rect(0, Hp - 1, Wp, band + 2)), orient(move([face], 0, Hp + band)[0])]).reduce((a2, b2) => (b2.area > a2.area ? b2 : a2)).outer;
    const slit = Math.max(10, Math.min(30, Wp / 4));
    const front = (cs: Contour[]) => move(cs, 0, Hp + band), back = (cs: Contour[]) => rot180(cs, Wp / 2, Hp / 2);
    const tagged = (cs: Contour[], f: (x: Contour[]) => Contour[]) => cs.map((c) => { const [r] = f([c]); const it = itemOf(c); if (it) tagItem([r], it); return r; });
    const part: GenPart = {
      id: "plate", name: "Tent card", outer: outerT, holes: [], cuts: hingeSlits(Wp, Hp + 1, Hp + band - 1, { band, slit, bridge: 3, pitch: 2 }),
      engrave: [...tagged(marks.engrave, front), ...tagged(marks.engrave, back)],
      ...(scored ? { score: [...tagged(marks.score, front), ...tagged(marks.score, back)] } : {}),
    };
    parts.push(part);
    CODE_AREA.set(part, [move([codeArea], 0, Hp + band)[0], rot180([codeArea], Wp / 2, Hp / 2)[0]]);
  } else if (engraved) {
    parts.push({ id: "plate", name: "Plate", outer: face, holes: mv(keyHoles), engrave: marks.engrave, ...(scored ? { score: marks.score } : {}) });
    CODE_AREA.set(parts[0], [codeArea]);
  } else if (out === "cutout") {
    parts.push({ id: "top", name: "Top plate", outer: face, holes: mv([...keyHoles, ...modules, ...logo, ...badge, ...label, ...ring]), place: { x: 0, y: 0, z: T } });
    CODE_AREA.set(parts[0], [codeArea]);
    parts.push({ id: "back", name: "Backplate", outer: face, holes: mv(keyHoles), tone: 0.25, place: { x: 0, y: 0, z: 0 } });
    CODE_AREA.set(parts[1], [codeArea]);
  } else {
    parts.push({ id: "stencil", name: "Stencil", outer: face, holes: mv([...keyHoles, ...modules, ...logo, ...badge, ...label]) });
  }

  // The stand's own parts, and the sign stood up in it (3D).
  const plateParts = parts.filter((x) => x.id === "plate" || x.id === "top" || x.id === "back");
  const front = (x: GenPart) => x.id !== "back";
  let footInfo = { D: 0, hF: 0 };
  if (stand === "base") {
    const lift = layers * T;
    const z0 = depth / 2 - (plates * T) / 2;
    for (const x of plateParts) x.place = { x: 0, y: -(Hp + lift), z: z0 + (plates === 2 && front(x) ? T : 0), upright: true };
    for (let l = 0; l < layers; l++) {
      const inset = l * 4;
      const bl = baseL - 2 * inset, bd = depth - 2 * inset;
      const ox2 = (Wp - baseL) / 2 + inset;
      const slotted = layers === 1 || l > 0;
      const slots = slotted ? tabXs.map((x) => rect(x - ox2 - tabW / 2 - CLEAR / 2, bd / 2 - slotW / 2, tabW + CLEAR, slotW)) : [];
      parts.push({ id: `base${l + 1}`, name: `Base${layers > 1 ? ` layer ${l + 1}` : ""}`, outer: orient(roundedRect(0, 0, bl, bd, Math.min(6, bd / 2 - 1))), holes: slots, place: { x: ox2, y: inset, z: l * T } });
    }
  } else if (stand === "feet") {
    const D = Math.max(30, depth), hF = Math.max(12, Math.min(32, Hs * 0.14));
    const lean = Math.max(0, Math.min(25, p.stand.lean));
    const at = D * 0.58;
    const f = footProfile(D, hF, slotW + 0.05, lean, at);
    footInfo = { D, hF };
    const a = deg(lean);
    for (const x of plateParts) {
      const back0 = at - (plates * T) / 2 + (plates === 2 && front(x) ? T : 0);
      x.place = { x: 0, y: -(f.floor + Hs * Math.cos(a)), z: back0 - Hs * Math.sin(a), upright: true, tilt: 90 - lean };
    }
    feetXs.forEach((x, k) => parts.push({ id: `foot${k + 1}`, name: `Foot ${k + 1}`, outer: f.outer, holes: [], place: { x: x + T / 2, y: -hF, z: 0, upright: true, yaw: 90 } }));
  }

  const plateW = Wp, plateH = Hp;
  const info: QrInfo = {
    payload, version: mat.version, n, module: m, islands, counters, logoShare: cleared / (n * n), margin, bridge: b, plateW, plateH, holeInQuiet,
    stand, standTip: stand === "base" ? Hs / depth : stand === "feet" ? Hs / Math.max(1, footInfo.D) : 0,
  };
  const STAND_NAMES = { none: "", base: "slotted base", feet: "two feet", tent: "tent card", wall: "wall holes" } as const;
  return {
    parts,
    stats: [
      { label: "Content", value: CONTENT_NAMES[p.content.kind] },
      { label: "Version", value: `${mat.version} (${n} × ${n} modules)` },
      { label: "Module", value: `${m.toFixed(2)} mm` },
      { label: "Error correction", value: `${p.code.ecc}, recovers ${ECC_RECOVERY[p.code.ecc]} %` },
      { label: "Plate", value: round ? `${r1(plateW)} mm round` : `${r1(plateW)} × ${r1(plateH)} mm` },
      ...(stand !== "none" ? [{ label: "Stand", value: stand === "base" ? `${STAND_NAMES.base}, ${r1(baseL)} × ${r1(depth)} mm, ${layers} layer${layers > 1 ? "s" : ""}` : stand === "feet" ? `${STAND_NAMES.feet}, leaning ${Math.round(p.stand.lean)}°` : STAND_NAMES[stand] }] : []),
      ...(out === "cutout" && islands ? [{ label: "Loose pieces", value: String(islands) }] : []),
      ...(out === "stencil" ? [{ label: "Bridges", value: `${b.toFixed(2)} mm` }] : []),
    ],
    assembly: [
      ...(out === "engrave" ? [
        "Engrave first at a high contrast setting (dark, even fill), then cut the outline without moving the sheet.",
        "Test-scan the plate with a phone before you cut a batch.",
      ] : out === "cutout" ? [
        "Cut the top plate from a light material and the backplate from a dark or contrasting one.",
        ...(islands ? [`Before lifting the top plate, cover it with transfer tape so its ${islands} loose piece${islands === 1 ? "" : "s"} stay in place.`] : []),
        "Glue the top plate onto the backplate; the backplate shows through as the dark modules.",
      ] : [
        "Tape the stencil flat, then spray light coats straight down; the bridges between rows fill in or stay as thin lines that phones ignore.",
        "Lift it straight up and let the paint dry before scanning.",
      ]),
      ...(stand === "base" ? [`Glue the base layers in a stack, slots lined up${layers > 1 ? " over the solid bottom layer" : ""}, then push the sign's tabs into the slots (a drop of glue makes it permanent).`] : []),
      ...(stand === "feet" ? ["Slide the bottom of the sign into the slots of the two feet; it leans back a little so phones read it from a table."] : []),
      ...(stand === "tent" ? ["Bend the card slowly along the slits until the two faces stand as a tent; warm the hinge with a hair dryer if the wood is stiff. The code reads from both sides."] : []),
      ...(stand === "wall" ? [p.stand.holes === "four" ? "Mount it with standoffs or screws through the four corner holes." : "Hang it with two screws through the top holes."] : []),
      ...(p.badge.kind === "tap" ? ["Stick an NFC tag (NTAG213 or 215, written with the same link) behind the tap picture, so phones can tap as well as scan."] : []),
    ],
    notice: loading ? "Loading the font." : undefined,
    missing,
    info,
  };
}
