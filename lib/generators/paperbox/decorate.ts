/**
 * Windows and cut-out patterns on a paper box's faces. Both go face by face, in each face's own
 * frame, so nothing crosses a fold: a window (a shape cut out of the middle of the face, to show
 * what is inside) and the shared cut-out pattern (lib/generators/pattern.ts), kept clear of the
 * face's edges and of any window or hole already in it. Faces folded out of sight are left alone.
 */
import { intersectShapes, makeShape, offsetShapes, shapeContours } from "@/lib/letters/polygon";
import type { Dieline, Face, Pt } from "@/lib/paperbox";
import { tucked } from "@/lib/paperbox/fold";
import { circle, pointInContour } from "../geom";
import { patternOn, patternUnit, windowShape, type PatternParams, type PatternTarget, type PierceShape } from "../pattern";
import type { BuildContext, Contour, GenPart } from "../types";

export type WindowShape = "rect" | "rounded" | "circle" | "oval" | "arch" | "heart" | "star" | "hexagon" | "diamond";
export const WINDOW_SHAPES: Record<WindowShape, string> = {
  rect: "Rectangle", rounded: "Rounded rectangle", circle: "Circle", oval: "Oval", arch: "Arch", heart: "Heart", star: "Star", hexagon: "Hexagon", diamond: "Diamond",
};

export interface WindowParams {
  /** Which faces get one: a target's value, "all", or "none". */
  on: string;
  shape: WindowShape;
  /** Its size, % of the face. */
  size: number;
  /** Corner radius of a rounded rectangle, mm. */
  corner: number;
}
export const WINDOW_DEFAULTS: WindowParams = { on: "none", shape: "rounded", size: 60, corner: 6 };

/** The faces a window or pattern can go on, by name. */
export const FACE_TARGETS: (PatternTarget & { faces: RegExp })[] = [
  { v: "front", text: "Front", faces: /^front( wall)?$/i },
  { v: "top", text: "Top or lid", faces: /^(top|top lid|lid|roof|handle)$/i },
  { v: "back", text: "Back", faces: /^(back|back wall|header|hang tab)$/i },
  { v: "sides", text: "Sides", faces: /^(side|left wall|right wall|gable end)$/i },
].map((t) => ({ ...t, match: () => false }));

export function cleanWindow(raw: unknown): WindowParams {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<WindowParams>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    on: r.on === "all" || r.on === "none" || FACE_TARGETS.some((t) => t.v === r.on) ? r.on! : "none",
    shape: typeof r.shape === "string" && r.shape in WINDOW_SHAPES ? r.shape : WINDOW_DEFAULTS.shape,
    size: n(r.size, 15, 95, WINDOW_DEFAULTS.size),
    corner: n(r.corner, 0, 100, WINDOW_DEFAULTS.corner),
  };
}

const chosen = (on: string, f: Face) => !tucked(f) && FACE_TARGETS.some((t) => (on === "all" || t.v === on) && t.faces.test(f.name));

/** Sheet to face frame and back (u and v are unit and square to each other). */
function frame(f: Face) {
  const [ox, oy] = f.origin, [ux, uy] = f.u, [vx, vy] = f.v;
  return {
    local: (p: Pt): Pt => [(p[0] - ox) * ux + (p[1] - oy) * uy, (p[0] - ox) * vx + (p[1] - oy) * vy],
    sheet: (p: Pt): Pt => [ox + ux * p[0] + vx * p[1], oy + uy * p[0] + vy * p[1]],
  };
}

const bbox = (c: Contour) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

function roundedRect(x0: number, y0: number, x1: number, y1: number, r: number): Contour {
  r = Math.max(0, Math.min(r, (x1 - x0) / 2 - 0.01, (y1 - y0) / 2 - 0.01));
  if (r < 0.2) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const out: Contour = [], c = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + (Math.PI / 2) * (i / 8); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  c(x1 - r, y0 + r, -Math.PI / 2); c(x1 - r, y1 - r, 0); c(x0 + r, y1 - r, Math.PI / 2); c(x0 + r, y0 + r, Math.PI);
  return out;
}

/** The window's outline in the face's frame, inside `inner` (the face less its margin). */
function windowOf(w: WindowParams, inner: Contour): Contour[] {
  const b = bbox(inner), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const k = w.size / 100, bw = (b.x1 - b.x0) * k, bh = (b.y1 - b.y0) * k, s = Math.min(b.x1 - b.x0, b.y1 - b.y0) * k;
  let c: Contour | null;
  switch (w.shape) {
    case "rect": c = roundedRect(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, 0); break;
    case "rounded": c = roundedRect(cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2, w.corner); break;
    case "oval": c = Array.from({ length: 72 }, (_, i) => { const a = (2 * Math.PI * i) / 72; return [cx + (bw / 2) * Math.cos(a), cy + (bh / 2) * Math.sin(a)] as Pt; }); break;
    case "arch": {
      const r = Math.min(bw / 2, bh / 2), top = cy - bh / 2 + r;
      c = [[cx + bw / 2, cy + bh / 2], [cx - bw / 2, cy + bh / 2], [cx - bw / 2, top]];
      for (let i = 1; i < 24; i++) { const a = Math.PI + (Math.PI * i) / 24; c.push([cx + (bw / 2) * Math.cos(a), top + r * Math.sin(a)]); }
      c.push([cx + bw / 2, top]);
      break;
    }
    case "circle": c = circle(cx, cy, s / 2); break;
    default: c = windowShape(w.shape as PierceShape, cx, cy, s);
  }
  return c ? intersectShapes([c], [inner]).map((x) => x.outer) : [];
}

/**
 * Cuts the windows and the pattern into the dieline's parts (as paths); returns the stats lines.
 * `edge` is how far both stay inside a face's edges, mm.
 */
export function decorate(d: Dieline, win: WindowParams, pp: PatternParams, t: number, ctx?: BuildContext): { label: string; value: string }[] {
  const unit = pp.pattern !== "none" ? patternUnit(pp, ctx) : undefined;
  const edge = Math.max(3, 2 * t + 1);
  let windows = 0, shapes = 0;
  for (const part of d.parts) {
    for (const f of part.faces) {
      const wantWin = win.on !== "none" && chosen(win.on, f), wantPat = pp.pattern !== "none" && chosen(pp.on, f);
      if (!wantWin && !wantPat) continue;
      const fr = frame(f), outer = f.poly.map(fr.local);
      const inner = shapeContours(offsetShapes([makeShape(outer, [])], -edge));
      if (!inner.length) continue;
      if (wantWin) for (const c of windowOf(win, inner[0])) {
        part.paths.push({ type: "cut", pts: c.map(fr.sheet), closed: true });
        windows++;
      }
      if (wantPat) {
        // The face as a part: its outline, and every hole already cut in it to keep clear of.
        const holes = part.paths.filter((q) => q.type === "cut" && q.closed && q.pts.length > 2).map((q) => q.pts.map(fr.local)).filter((c) => c.every((p) => pointInContour(p, outer)));
        const tmp: GenPart = { id: f.id, name: f.name, outer, holes: [...holes] };
        if (pp.mark === "engrave") tmp.engrave = [];
        if (pp.mark === "score") tmp.score = [];
        shapes += patternOn(pp, tmp, edge, unit);
        const made = pp.mark === "engrave" ? tmp.engrave ?? [] : pp.mark === "score" ? tmp.score ?? [] : tmp.holes.slice(holes.length);
        for (const c of made) part.paths.push(pp.mark === "engrave" ? { type: "engrave", pts: c.map(fr.sheet), closed: true } : pp.mark === "score" ? { type: "crease", pts: c.map(fr.sheet), closed: false } : { type: "cut", pts: c.map(fr.sheet), closed: true });
      }
    }
  }
  const out: { label: string; value: string }[] = [];
  if (win.on !== "none") out.push({ label: "Windows", value: windows ? `${windows} ${win.shape === "circle" ? "round" : WINDOW_SHAPES[win.shape].toLowerCase()} window${windows > 1 ? "s" : ""}` : "None fit: make the faces larger or the window smaller" });
  if (pp.pattern !== "none") out.push({ label: "Pattern", value: pp.pattern === "motif" && !unit ? "Waiting for the motif" : `${shapes} ${pp.mark === "engrave" ? "engraved shapes" : pp.mark === "score" ? "scored shapes" : "holes"}` });
  return out;
}
