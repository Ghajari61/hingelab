/**
 * The cut-out pattern any generator can offer: fretwork (lattice, rosettes, honeycomb...) or a motif
 * tiled across the part (a heart, a star, or the user's own picture or words), cut through,
 * engraved or scored, over the whole face or inside a shape in its middle. The pattern keeps clear
 * of the part's edge, its holes, its engraving and its pictures, so nothing it carries is cut into.
 *
 * `withPattern` adds it to a generator: the settings under `pattern`, the panel section, and the
 * holes after the build, on the parts the user picks. "None" (the default) leaves every part as it was.
 */
import { differenceShapes, intersectShapes, makeShape, offsetShapes, shapeContours, signedArea, unionShapes } from "@/lib/letters/polygon";
import { FRET_KINDS, FRET_NAMES, fretHoles, fretSample, type FretKind, type KeepOut } from "./fretwork";
import { circle, pointInContour, rect, regularPolygon } from "./geom";
import { MOTIF_ART, cleanMotifArt, motifArtFields, motifFonts, type MotifArt } from "./motifArt";
import { motifRef } from "./motifRef";
import { MOTIF_OPTIONS, isMotifKind, motif } from "./motifs";
import type { BuildContext, Contour, FieldSpec, GenBase, GenOutput, GenPart, GeneratorDef, Pt, SectionSpec } from "./types";
import type { Issue } from "@/lib/issues";
import { placePoint, unplacePoint } from "./place";
import { getPath } from "./path";
import { fitArt } from "./util";

/** The window the pattern fills: the whole face, or a shape in its middle. */
export type PierceShape = "full" | "circle" | "heart" | "star" | "hexagon" | "diamond";
export const PIERCE_SHAPES: Record<PierceShape, string> = { full: "Whole face", circle: "Circle", heart: "Heart", star: "Star", hexagon: "Hexagon", diamond: "Diamond" };
/** The pattern cut through, engraved, or scored as outlines. */
export type PierceMark = "cut" | "engrave" | "score";

export interface PatternParams {
  pattern: FretKind;
  /** Which parts carry it: a target's value, or "all". */
  on: string;
  /** Repeat, mm. */
  cell: number;
  /** Narrowest material left between holes, mm. */
  bar: number;
  shape: PierceShape;
  /** The shape's size, % of the face. */
  size: number;
  mark: PierceMark;
  /** The tile for `pattern: "motif"`: a library motif, "picture" or "text". */
  motif: string;
  art: MotifArt;
}

export const PATTERN_DEFAULTS: PatternParams = { pattern: "none", on: "all", cell: 16, bar: 3, shape: "full", size: 70, mark: "cut", motif: "heart", art: { ...MOTIF_ART } };

/** A choice of parts for "Put it on". */
export interface PatternTarget { v: string; text: string; match: (part: GenPart) => boolean }

export function cleanPattern(raw: unknown, targets: PatternTarget[]): PatternParams {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<PatternParams>;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    pattern: typeof r.pattern === "string" && r.pattern in FRET_NAMES ? r.pattern : "none",
    on: r.on === "all" || targets.some((t) => t.v === r.on) ? r.on! : "all",
    cell: n(r.cell, 4, 120, PATTERN_DEFAULTS.cell),
    bar: n(r.bar, 0.5, 20, PATTERN_DEFAULTS.bar),
    shape: typeof r.shape === "string" && r.shape in PIERCE_SHAPES ? r.shape : "full",
    size: n(r.size, 20, 100, PATTERN_DEFAULTS.size),
    mark: r.mark === "engrave" || r.mark === "score" ? r.mark : "cut",
    motif: typeof r.motif === "string" && isMotifKind(r.motif) ? r.motif : "heart",
    art: cleanMotifArt(r.art),
  };
}

/** A shape of the given size (its width and height at most `s`) centred on (cx, cy), y down. */
export function windowShape(shape: PierceShape, cx: number, cy: number, s: number): Contour | null {
  const r = s / 2;
  switch (shape) {
    case "circle": return circle(cx, cy, r);
    case "hexagon": return regularPolygon(6, r, 30, cx, cy);
    case "diamond": return [[cx, cy - r], [cx + r * 0.75, cy], [cx, cy + r], [cx - r * 0.75, cy]];
    case "star": {
      const pts: Contour = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 5, R = i % 2 ? r * 0.45 : r;
        pts.push([cx + R * Math.cos(a), cy + 0.06 * r + R * Math.sin(a)]);
      }
      return pts;
    }
    case "heart": {
      // The classic heart curve (17 × 15.5 units across), its point down.
      const k = s / 34, pts: Contour = [];
      for (let i = 0; i < 96; i++) {
        const t = (2 * Math.PI * i) / 96;
        const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([cx + x * k, cy - (y + 2.5) * k]);
      }
      return pts;
    }
    default: return null;
  }
}

/**
 * The motif tile for `pattern: "motif"` (outer outlines only: an island inside a cut-out hole would
 * fall out), or undefined when there is none yet (no picture, no words, the font still loading).
 */
export function patternUnit(pp: Pick<PatternParams, "pattern" | "motif" | "art">, ctx?: BuildContext): Contour[] | undefined {
  if (pp.pattern !== "motif") return undefined;
  const { ref } = motifRef(pp.motif, pp.art, ctx);
  if (!ref) return undefined;
  const cs = motif(ref, 100);
  return unionShapes(cs, [], false, true).map((s) => s.outer);
}

const boxOf = (cs: Contour[]): KeepOut => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cs) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};

/** Areas of a part the pattern must leave solid: its holes, open cuts, engraving, scoring and pictures. */
export function partKeepOuts(part: GenPart, pad = 0): KeepOut[] {
  const grow = (k: KeepOut): KeepOut => ({ x0: k.x0 - pad, y0: k.y0 - pad, x1: k.x1 + pad, y1: k.y1 + pad });
  return [
    ...part.holes.map((h) => grow(boxOf([h]))),
    ...(part.cuts ?? []).map((c) => grow(boxOf([c]))),
    ...(part.engrave ?? []).map((c) => grow(boxOf([c]))),
    ...(part.score ?? []).map((c) => grow(boxOf([c]))),
    ...(part.images ?? []).map((im) => grow({ x0: im.x, y0: im.y, x1: im.x + im.w, y1: im.y + im.h })),
  ];
}

/** Puts pattern shapes on a part: cut through, engraved, or scored as outlines. */
export function markShapes(mark: PierceMark, part: GenPart, holes: Contour[]) {
  if (!holes.length) return;
  if (mark === "engrave") part.engrave = [...(part.engrave ?? []), ...holes];
  else if (mark === "score") part.score = [...(part.score ?? []), ...holes.map((c) => [...c, c[0]])];
  else part.holes.push(...holes);
}

/**
 * Where a pattern may go on a part: inside its outline by `edge`, within the window shape, and
 * clear of what it already carries. Holes and engraving are kept clear by their own outlines (the
 * counters of letters stay solid; a large opening, like the inside of a border, is open again);
 * open cuts, scoring and pictures by their boxes.
 */
export function patternArea(part: GenPart, edge: number, win: Contour | null, cell: number, solid: Contour[] = []): Contour[] {
  let area = offsetShapes([makeShape(part.outer, [])], -edge);
  if (win) area = intersectShapes(shapeContours(area), [win]);
  const marks = unionShapes([...part.holes, ...(part.engrave ?? [])].filter((c) => c.length > 2), [], true)
    .map((s) => makeShape(s.outer, s.holes.filter((h) => Math.abs(signedArea(h)) > 4 * cell * cell)));
  const boxes = (part.images ?? []).map((im) => rect(im.x, im.y, im.w, im.h));
  // Open lines (scoring, slits) as a strip a millimetre each side.
  const strips: Contour[] = [];
  for (const c of [...(part.cuts ?? []), ...(part.score ?? [])]) for (let i = 1; i < c.length; i++) {
    const [ax, ay] = c[i - 1], [bx, by] = c[i], l = Math.hypot(bx - ax, by - ay);
    if (l < 1e-6) continue;
    const nx = -(by - ay) / l, ny = (bx - ax) / l, ex = (bx - ax) / l, ey = (by - ay) / l;
    const q: Contour = [[ax - ex + nx, ay - ey + ny], [bx + ex + nx, by + ey + ny], [bx + ex - nx, by + ey - ny], [ax - ex - nx, ay - ey - ny]];
    strips.push(signedArea(q) < 0 ? q.reverse() : q);
  }
  const glued = solid.length ? shapeContours(offsetShapes(unionShapes(solid, [], false, true), 1)) : [];
  const block = [...shapeContours(offsetShapes(marks, 0.5)), ...boxes, ...strips, ...glued];
  return block.length && area.length ? shapeContours(differenceShapes(shapeContours(area), block)) : shapeContours(area);
}

/**
 * The pattern on one part, `edge` mm clear of its outline, of what it carries, and of `keep`;
 * returns how many shapes it made. The window shape sits in the middle of the face inside the edge.
 */
export function patternOn(pp: PatternParams, part: GenPart, edge: number, unit?: Contour[], keep: KeepOut[] = [], solid: Contour[] = []): number {
  if (pp.pattern === "none" || (pp.pattern === "motif" && !unit?.length)) return 0;
  const b = boxOf([part.outer]);
  const x0 = b.x0 + edge, y0 = b.y0 + edge, x1 = b.x1 - edge, y1 = b.y1 - edge;
  if (x1 - x0 < 4 || y1 - y0 < 4) return 0;
  const cell = Math.max(4, pp.cell);
  const win = windowShape(pp.shape, (x0 + x1) / 2, (y0 + y1) / 2, Math.min(x1 - x0, y1 - y0) * Math.min(100, Math.max(20, pp.size)) / 100);
  const area = patternArea(part, edge, win, cell, solid);
  if (!area.length) return 0;
  const holes = fretHoles({ kind: pp.pattern, cell, bar: Math.max(0.5, pp.bar), unit }, x0, y0, x1, y1, keep, (q) => pointInContour(q, part.outer), area);
  markShapes(pp.mark, part, holes);
  return holes.length;
}

/**
 * Outlines of the other parts lying flat against `part` (glued on its face, or it on theirs), in
 * `part`'s own coordinates: raised letters, an emblem, a front layer, a knob. The pattern leaves
 * them solid, so nothing is cut under a glued part or shows through it.
 */
export function stackedOn(part: GenPart, parts: GenPart[], T: number): Contour[] {
  if (!part.place) return [];
  const tp = part.t ?? T, out: Contour[] = [];
  for (const q of parts) {
    if (q === part || !q.place || q.outer.length < 3 || q.pieces?.length) continue;
    const to = (c: Contour) => c.map(([u, v]) => unplacePoint(part.place!, placePoint(q.place!, u, v, 0)));
    const local = to(q.outer);
    let hmin = Infinity, hmax = -Infinity;
    for (const p of local) { hmin = Math.min(hmin, p[2]); hmax = Math.max(hmax, p[2]); }
    // Parallel to the part and lying on its top face: glued there. A clock hand rides clear of it.
    if (hmax - hmin > 0.5 || Math.abs(hmin - tp) > 0.25) continue;
    const flat = (c: ReturnType<typeof to>): Contour => { const f = c.map((p) => [p[0], p[1]] as Pt); return signedArea(f) < 0 ? f.reverse() : f; };
    // Only its solid area: a frame glued on leaves its window open.
    out.push(...(q.holes.length ? shapeContours(differenceShapes([flat(local)], q.holes.map((h) => flat(to(h))))) : [flat(local)]));
  }
  return out;
}

/** "The pattern hardly shows": a shape window with too few shapes in it, and the fixes. */
export function patternIssues<P>(p: P, out: GenOutput, base = "pattern"): Issue<P>[] {
  const r = out.pattern, pp = getPath(p, base) as PatternParams | undefined;
  if (!r || !pp || pp.pattern === "none" || !r.parts) return [];
  const per = r.shapes / r.parts;
  if (per >= SPARSE) return [];
  const set = (patch: Partial<PatternParams>) => (q: P) => {
    const cur = getPath(q, base) as PatternParams;
    return setAt(q, base, { ...cur, ...patch });
  };
  return [{
    code: "PATTERN_SPARSE", level: r.shapes === 0 ? "warn" : "info",
    message: r.shapes === 0
      ? "The pattern does not fit: no shape fits inside the edges and the part's own holes and marks. Make the pattern smaller, or the shape larger."
      : `The pattern is large for its space: ${Math.round(per)} ${Math.round(per) === 1 ? "shape" : "shapes"} per part. A smaller pattern or a larger shape shows it better.`,
    fixes: [
      { id: "pattern-smaller", label: "Smaller pattern", safe: false, apply: set({ cell: Math.max(4, Math.round(pp.cell * 0.6 * 2) / 2), bar: Math.min(pp.bar, Math.max(1, pp.cell * 0.15)) }) },
      ...(r.windowed && pp.size < 100 ? [{ id: "pattern-wider", label: "Larger shape", safe: false, apply: set({ size: Math.min(100, pp.size + 20) }) }] : []),
    ],
  }];
}

/** Fewer shapes per part than this, and the check suggests a smaller pattern. */
const SPARSE = 6;

/** A copy of `p` with `value` at the dotted path `key`. */
function setAt<P>(p: P, key: string, value: unknown): P {
  const [head, ...rest] = key.split(".");
  const o = p as Record<string, unknown>;
  return { ...o, [head]: rest.length ? setAt(o[head], rest.join("."), value) : value } as P;
}

/** The panel fields of a pattern under `base` (Boxes keeps its own section under "pierce"). */
export function patternFields<P>(base: string, targets: { v: string; text: string }[] | null, help: { on?: string; bar?: string } = {}): FieldSpec<P>[] {
  const pk = (p: P) => getPath(p, `${base}.pattern`) as string;
  const on = (p: P) => pk(p) !== "none";
  return [
    { kind: "choice", key: `${base}.pattern`, label: "Pattern", rail: true, shuffle: true, help: "The shape of the holes; None leaves the parts plain. A motif repeats a shape from the library, or your own picture or words.", options: FRET_KINDS.map((v) => ({ v, text: FRET_NAMES[v] })) },
    { kind: "choice", key: `${base}.motif`, label: "Motif", show: (p) => pk(p) === "motif", help: "The shape that repeats: one from the library, a picture of yours (traced into outlines) or your own words.", options: MOTIF_OPTIONS.filter((o) => o.v !== "none") },
    ...motifArtFields<P>(`${base}.motif`, `${base}.art`, (p) => pk(p) === "motif"),
    ...(targets && targets.length > 1 ? [{ kind: "choice" as const, key: `${base}.on`, label: "Put it on", show: on, help: help.on ?? "Which parts carry the pattern.", options: [{ v: "all", text: "All of them" }, ...targets.map((t) => ({ v: t.v, text: t.text }))] }] : []),
    { kind: "choice", key: `${base}.shape`, label: "Shape", show: on, help: "Fill the whole face, or only a shape in its middle: a circle, heart, star, hexagon or diamond.", options: (Object.keys(PIERCE_SHAPES) as PierceShape[]).map((v) => ({ v, text: PIERCE_SHAPES[v] })) },
    { kind: "number", key: `${base}.size`, label: "Shape size", unit: "%", min: 20, max: 100, step: 1, show: (p) => on(p) && getPath(p, `${base}.shape`) !== "full", help: "The shape's size as a share of the face." },
    { kind: "choice", key: `${base}.mark`, label: "Mark", show: on, help: "Cut the pattern through, engrave it, or score its outlines. Engraved and scored patterns keep the part closed and strong.", options: [{ v: "cut", text: "Cut out" }, { v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }] },
    { kind: "number", key: `${base}.cell`, label: "Pattern size", unit: "mm", min: 4, max: 120, step: 0.5, show: on, help: "How far the pattern repeats; larger shapes cut faster." },
    { kind: "number", key: `${base}.bar`, label: "Bar width", unit: "mm", min: 0.5, max: 20, step: 0.25, show: on, help: help.bar ?? "The narrowest material left between holes; keep it at least the material thickness for wood." },
  ];
}

/** Rail pictures for the pattern choice: a plain tile, with the pattern's holes for every other option. */
export function patternArt(value: string): { d: string; fill?: boolean }[] {
  const cs = value === "none" ? [] : fretSample(value as FretKind);
  return [{ d: fitArt([rect(0, 0, 40, 40), ...cs], 38).join(" "), fill: true }];
}

/**
 * A generator with the cut-out pattern: settings under `pattern`, a "Cut-out pattern" section, and
 * the pattern applied after the build to the parts of the chosen target. `edge` is how far the
 * pattern stays from a part's outline (joints, slots and the rim), mm.
 */
export function withPattern<P extends GenBase>(def: GeneratorDef<P>, targets: PatternTarget[], opts: { edge?: (p: P) => number; help?: string; barHelp?: string; keep?: (p: P, part: GenPart) => Contour[] } = {}): GeneratorDef<P> {
  type Q = P & { pattern: PatternParams };
  const pp = (p: P) => (p as Q).pattern ?? PATTERN_DEFAULTS;
  const edge = opts.edge ?? ((p: P) => Math.max(4, (p.T ?? 3) + pp(p).bar + 1));
  const section: SectionSpec<P> = {
    id: "pattern", title: "Cut-out pattern", open: false,
    help: opts.help ?? "A decorative pattern cut through the parts you choose (or engraved or scored), clear of their edges, holes and engraving.",
    fields: patternFields<P>("pattern", targets, { bar: opts.barHelp }),
  };
  return {
    ...def,
    defaults: () => ({ ...def.defaults(), pattern: { ...PATTERN_DEFAULTS, art: { ...MOTIF_ART } } }),
    merge: (raw) => ({ ...def.merge(raw), pattern: cleanPattern((raw as { pattern?: unknown } | null)?.pattern, targets) }),
    sections: [...def.sections, section],
    fonts: (p) => [...(def.fonts?.(p) ?? []), ...(pp(p).pattern === "motif" ? motifFonts(pp(p).motif, pp(p).art) : [])],
    art: (key, value) => (key === "pattern.pattern" ? patternArt(value) : def.art?.(key, value) ?? []),
    build: (p, ctx): GenOutput => {
      const out = def.build(p, ctx);
      const q = pp(p);
      if (out.error || q.pattern === "none" || !out.parts.length) return out;
      const unit = patternUnit(q, ctx);
      const chosen = q.on === "all" ? targets : targets.filter((t) => t.v === q.on);
      const e = edge(p);
      let n = 0, on = 0;
      for (const part of out.parts) {
        if (part.pieces?.length || !chosen.some((t) => t.match(part))) continue;
        n += patternOn(q, part, e, unit, [], [...stackedOn(part, out.parts, p.T ?? 3), ...(opts.keep?.(p, part) ?? [])]);
        on++;
      }
      const what = q.mark === "engrave" ? "engraved shapes" : q.mark === "score" ? "scored shapes" : "holes";
      const waiting = q.pattern === "motif" && !unit;
      return { ...out, ...(waiting ? {} : { pattern: { shapes: n, parts: on, windowed: q.shape !== "full" } }), stats: [...out.stats, { label: "Pattern", value: waiting ? "Waiting for the motif" : `${FRET_NAMES[q.pattern]}: ${n} ${what}` }] };
    },
    check: (p, out) => [...def.check(p, out), ...patternIssues(p, out)],
  };
}

/** Matches parts whose id starts with one of `ids` (copies are "plate-2", "tier1"...). */
export const byId = (...ids: string[]) => (part: GenPart) => ids.some((id) => part.id === id || part.id.startsWith(`${id}-`) || new RegExp(`^${id}\\d`).test(part.id));
