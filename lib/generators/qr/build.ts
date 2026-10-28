import { markLetters } from "../textOps";
/**
 * QR code plates. The module matrix comes from the encoder; this file turns it into shapes in one of
 * four module styles and lays out the plate: quiet zone, label, centre logo, frame and keyring ear.
 * Three outputs: engraved; cut through a light top plate glued on a contrasting backplate; or a paint
 * stencil whose holes are row runs with bridges between the rows, so no part of it falls out.
 */
import { differenceShapes, intersectShapes, offsetShapes, shapeContours, unionShapes } from "@/lib/letters/polygon";
import type { Shape } from "@/lib/letters/types";
import { arc, bboxOf, circle, customOutline, deg, rect, reverse, roundedRect, stadium } from "../geom";
import { tagItem } from "../items";
import type { BuildContext, Contour, GenOutput, GenPart, Pt } from "../types";
import { HEART_PATH } from "../util";
import { CONTENT_NAMES, qrMatrix, qrPayload, type QrMatrix } from "./encode";
import { ECC_RECOVERY, type ModuleStyle, type QrParams } from "./params";

/** The code area (with its quiet zone) of a plate this build made, for the cut-out pattern to avoid. */
export const CODE_AREA = new WeakMap<GenPart, Contour>();

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
  /** The keyring hole reaches into the quiet zone. */
  holeInQuiet: boolean;
}

export type QrOutput = GenOutput & { info?: QrInfo };

const r1 = (v: number) => Math.round(v * 10) / 10;
const ASK: Record<QrParams["content"]["kind"], string> = {
  url: "the web address", text: "the text", wifi: "the Wi-Fi network name", vcard: "a name or company", email: "the email address", sms: "the phone number", phone: "the phone number",
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

/** The dark modules as filled shapes in a module style, the grid's top-left at (ox, oy). */
export function moduleShapes(on: (r: number, c: number) => boolean, n: number, m: number, style: ModuleStyle, dot: number, ox = 0, oy = 0): Shape[] {
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
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!free(r, c)) continue;
    const [x, y] = at(r, c);
    cs.push(circle(x, y, d / 2, 0.02));
    if (style === "connected") {
      if (c + 1 < n && free(r, c + 1)) cs.push(stadium(x, y, x + m, y, d));
      if (r + 1 < n && free(r + 1, c)) cs.push(stadium(x, y, x, y + m, d));
    }
  }
  return unionShapes(cs, [], false, true);
}

/**
 * Stencil holes: each row's runs of dark modules, thinned by the bridge so a strip of material runs
 * the full width between every two rows. Every bit of the stencil is joined to the border.
 */
export function stencilHoles(on: (r: number, c: number) => boolean, n: number, m: number, style: ModuleStyle, dot: number, bridge: number, ox = 0, oy = 0): Contour[] {
  const w = m - bridge;
  const out: Contour[] = [];
  const pats = patterns(n).filter(([pr, pc, k]) => on(pr + (k >> 1), pc + (k >> 1)));
  for (const [pr, pc, k] of pats) out.push(...pinwheel(ox + pc * m, oy + pr * m, k, m, bridge));
  const free = (r: number, c: number) => on(r, c) && !inPattern(r, c, pats);
  if (style === "dots") {
    const rr = Math.min(((Math.min(100, Math.max(40, dot)) / 100) * m) / 2, w / 2);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (free(r, c)) out.push(circle(ox + (c + 0.5) * m, oy + (r + 0.5) * m, rr, 0.02));
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

export function buildQr(p: QrParams, ctx: BuildContext): QrOutput {
  const payload = qrPayload(p.content);
  if (!payload) return { parts: [], stats: [], error: `Add ${ASK[p.content.kind]} under Content.` };
  const mat: QrMatrix | null = qrMatrix(payload, p.code.ecc);
  if (!mat) return { parts: [], stats: [], error: "There is too much content for one QR code; shorten it or choose a lower error correction." };
  const { n } = mat;
  const out = p.output.kind;
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

  // Plate outline.
  const pad = Math.max(0, p.plate.padding);
  const round = p.plate.shape === "circle";
  const R = Math.hypot(cw, ch) / 2 + pad;
  const plate = round ? circle(cw / 2, ch / 2, R) : roundedRect(-pad, -pad, cw + 2 * pad, ch + 2 * pad, Math.max(0, p.plate.corner));
  const top = round ? ch / 2 - R : -pad;
  let outer = plate;
  const keyHoles: Contour[] = [];
  let keyClear: Contour | null = null;
  let holeInQuiet = false;
  if (p.keyring.kind !== "none") {
    const d = Math.max(2, p.keyring.diameter), Re = d / 2 + Math.max(2.5, d * 0.5);
    const corner = p.keyring.kind === "corner" && !round;
    const c: Pt = corner ? [-pad + 0.2 * Re, -pad + 0.2 * Re] : [cw / 2, top - 0.5 * Re];
    outer = unionShapes([plate, circle(c[0], c[1], Re)])[0]?.outer ?? plate;
    keyHoles.push(reverse(circle(c[0], c[1], d / 2)));
    keyClear = circle(c[0], c[1], d / 2 + 1.5);
    holeInQuiet = c[0] + d / 2 > qx && c[1] + d / 2 > qy && c[0] - d / 2 < qx + W && c[1] - d / 2 < qy + W;
  }

  // Frame: a ring in the plate border, clear of the keyring hole.
  const fw = Math.max(0.3, p.plate.frameWidth);
  const framed = p.plate.frame && out !== "stencil" && pad > fw;
  let ring: Contour[] = [];
  if (framed) {
    const inset = Math.max(0.5, (pad - fw) / 2);
    const base = unionShapes([plate]);
    const o = offsetShapes(base, -inset), i = offsetShapes(base, -inset - fw);
    ring = shapeContours(differenceShapes(shapeContours(o), [...shapeContours(i), ...(keyClear ? [keyClear] : [])]));
    if (p.plate.frameStyle === "corners") {
      const b = bboxOf([plate]), k = Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.24;
      const boxes = [rect(b.x0, b.y0, k, k), rect(b.x1 - k, b.y0, k, k), rect(b.x0, b.y1 - k, k, k), rect(b.x1 - k, b.y1 - k, k, k)];
      ring = shapeContours(intersectShapes(ring, shapeContours(unionShapes(boxes))));
    }
  }
  const inverted = out === "engrave" && p.code.invert;
  const margin = inverted ? q : q + Math.min(framed ? Math.max(0.5, (pad - fw) / 2) : pad, lines.length ? gap : Infinity);

  // Modules.
  const b = out === "stencil" ? (m * Math.min(45, Math.max(5, p.output.bridge))) / 100 : 0;
  let islands = 0;
  let modules: Contour[];
  if (out === "stencil") modules = stencilHoles(on, n, m, p.code.style, p.code.dot, b, ox, oy);
  else {
    const shapes = moduleShapes(on, n, m, p.code.style, p.code.dot, ox, oy);
    islands = shapes.reduce((a, s) => a + s.holes.length, 0);
    modules = shapeContours(shapes);
    if (inverted) modules = shapeContours(differenceShapes([rect(qx, qy, W, W)], modules));
  }
  const text = [...label, ...(p.logo.kind === "text" ? logo : [])];
  const counters = text.length ? unionShapes(text, [], true).reduce((a, s) => a + s.holes.length, 0) : 0;
  if (out === "cutout") islands += counters;

  // Parts, moved so the plate's top-left is at (0, 0).
  const bb = bboxOf([outer]);
  const dx = -bb.x0, dy = -bb.y0;
  const T = p.T;
  const mv = (cs: Contour[]) => move(cs, dx, dy);
  const parts: GenPart[] = [];
  // The code with its quiet zone and a module more, which a cut-out pattern must leave solid to scan.
  const codeArea = mv([rect(qx - m, qy - m, W + 2 * m, W + 2 * m)])[0];
  if (out === "engrave") {
    // a plain engraved label can be scored instead (a barred label is knocked out of its bar)
    const scored = p.label.mark === "score" && !bar && label.length > 0;
    parts.push({ id: "plate", name: "Plate", outer: mv([outer])[0], holes: mv(keyHoles), engrave: [...tagItem(mv(modules), "Code"), ...tagItem(mv(logo), "Logo"), ...(scored ? [] : tagItem(mv(label), "Label")), ...mv(ring)], ...(scored ? { score: tagItem(markLetters({ contours: mv(label) }, "score").score ?? [], "Label") } : {}) });
    CODE_AREA.set(parts[0], codeArea);
  } else if (out === "cutout") {
    parts.push({ id: "top", name: "Top plate", outer: mv([outer])[0], holes: mv([...keyHoles, ...modules, ...logo, ...label, ...ring]), place: { x: 0, y: 0, z: T } });
    CODE_AREA.set(parts[0], codeArea);
    parts.push({ id: "back", name: "Backplate", outer: mv([outer])[0], holes: mv(keyHoles), tone: 0.25, place: { x: 0, y: 0, z: 0 } });
    CODE_AREA.set(parts[1], codeArea);
  } else {
    parts.push({ id: "stencil", name: "Stencil", outer: mv([outer])[0], holes: mv([...keyHoles, ...modules, ...logo, ...label]) });
  }

  const plateW = bb.x1 - bb.x0, plateH = bb.y1 - bb.y0;
  const info: QrInfo = {
    payload, version: mat.version, n, module: m, islands, counters, logoShare: cleared / (n * n), margin, bridge: b, plateW, plateH, holeInQuiet,
  };
  const how = out === "engrave" ? "engraved" : out === "cutout" ? "cut out" : "stencil";
  return {
    parts,
    stats: [
      { label: "Content", value: CONTENT_NAMES[p.content.kind] },
      { label: "Version", value: `${mat.version} (${n} × ${n} modules)` },
      { label: "Module", value: `${m.toFixed(2)} mm` },
      { label: "Error correction", value: `${p.code.ecc}, recovers ${ECC_RECOVERY[p.code.ecc]} %` },
      { label: "Plate", value: round ? `${r1(plateW)} mm round` : `${r1(plateW)} × ${r1(plateH)} mm` },
      ...(out === "cutout" && islands ? [{ label: "Loose pieces", value: String(islands) }] : []),
      ...(out === "stencil" ? [{ label: "Bridges", value: `${b.toFixed(2)} mm` }] : []),
    ],
    assembly: out === "engrave" ? [
      "Engrave first at a high contrast setting (dark, even fill), then cut the outline without moving the sheet.",
      "Test-scan the plate with a phone before you cut a batch.",
    ] : out === "cutout" ? [
      "Cut the top plate from a light material and the backplate from a dark or contrasting one.",
      ...(islands ? [`Before lifting the top plate, cover it with transfer tape so its ${islands} loose piece${islands === 1 ? "" : "s"} stay in place.`] : []),
      "Glue the top plate onto the backplate; the backplate shows through as the dark modules.",
    ] : [
      "Tape the stencil flat, then spray light coats straight down; the bridges between rows fill in or stay as thin lines that phones ignore.",
      "Lift it straight up and let the paint dry before scanning.",
    ],
    notice: loading ? "Loading the font." : undefined,
    missing,
    info,
  };
}
