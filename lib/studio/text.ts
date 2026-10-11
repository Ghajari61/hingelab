/**
 * Text layout for the studio Type tool: HarfBuzz shaping (contextual forms, ligatures, RTL) and
 * opentype.js outlines kept as Bézier curves. `size` is the em size in mm; tracking is in 1/1000 em
 * and is never inserted between cursively joined Arabic-script letters. Point text has its first
 * baseline at y = 0 with the anchor at x = 0; area text wraps inside [0, width].
 *
 * Manual kerns, baseline shifts and glyph turns are keyed by a character's index in `text` (with
 * \r\n read as \n). Text on a path and flowed text read `frame` (the linked object in the text's own
 * coordinates); vertical text stacks glyphs down columns that run right to left.
 */
import type { PathCommand } from "opentype.js";
import { resolveDirection, spacingAllowed } from "@/lib/letters/shape";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { apply, flatten, mul, PathBuilder, rotateAt, subpathsBox, translate } from "./geom";
import { bandSpans, pathWalker } from "./textGeom";
import type { Mat, Subpath, TextNode } from "./types";

export type TextSettings = Pick<TextNode, "text" | "size" | "tracking" | "lineHeight" | "align" | "direction" | "width"
  | "onPath" | "pathStart" | "pathSide" | "flowInto" | "frame" | "vertical" | "kerns" | "shifts" | "rotations">;

/**
 * One placed glyph: `x, y` is its origin on the baseline (the pen position, before any baseline
 * shift), `angle` the direction the pen moves (degrees, y down: 0 = right, 90 = down) and `advance`
 * how far; `index` is the character it starts at.
 */
export interface GlyphPlace { index: number; x: number; y: number; angle: number; advance: number }

export interface TextLayout {
  outline: Subpath[];
  lines: { text: string; width: number; x: number; baseline: number; direction: "ltr" | "rtl" }[];
  glyphs: GlyphPlace[];
  missing: string[];
  /** Some text did not fit (past the end of an open path, or below a flow frame) and is not drawn. */
  overflow?: boolean;
}

/** True when a text has none of the frame, vertical or per-glyph settings (it lays out as plain point or area text). */
export function isPlainText(t: Pick<TextNode, "onPath" | "flowInto" | "vertical" | "kerns" | "shifts" | "rotations">): boolean {
  const empty = (r?: Record<number, number>) => !r || !Object.keys(r).length;
  return !t.onPath && !t.flowInto && !t.vertical && empty(t.kerns) && empty(t.shifts) && empty(t.rotations);
}

/** `x`, `y`: where the glyph is drawn; `pen`: its origin along the line; `adv`: its advance; `cl`: its cluster. */
interface Glyph { gid: number; x: number; y: number; pen: number; adv: number; cl: number }
interface Run { width: number; glyphs: Glyph[]; missing: string[]; direction: "ltr" | "rtl" }

const em = (s: TextSettings, v: number | undefined) => ((v ?? 0) / 1000) * s.size;
const hasAny = (r?: Record<number, number>) => !!r && Object.keys(r).length > 0;

/** Manual kerning between two clusters: every kern on the characters between them (`at` = the line's first index). */
function kernBetween(s: TextSettings, at: number, a: number, b: number): number {
  let t = 0;
  for (let i = Math.min(a, b) + 1; i <= Math.max(a, b); i++) t += s.kerns![at + i] ?? 0;
  return (t / 1000) * s.size;
}

function shapeLine(hb: HarfBuzz, font: LoadedFont, text: string, s: TextSettings, at = 0): Run {
  const direction = resolveDirection(s.direction, text);
  if (!text) return { width: 0, glyphs: [], missing: [], direction };
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.setDirection(direction === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
  buf.guessSegmentProperties();
  hb.shape(font.hb, buf);
  const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
  (buf as { destroy?: () => void }).destroy?.();
  const scale = s.size / font.unitsPerEm;
  const track = (s.tracking / 1000) * s.size;
  const kerned = hasAny(s.kerns);
  const lead = kerned ? em(s, s.kerns![at]) : 0;
  const glyphs: Run["glyphs"] = [];
  const missing = new Set<string>();
  let pen = 0, extra = direction === "ltr" ? lead : 0;
  for (let k = 0; k < infos.length; k++) {
    const cl = infos[k].cluster, prev = k > 0 ? infos[k - 1].cluster : cl;
    if (k > 0 && cl !== prev && spacingAllowed(text, Math.max(cl, prev))) extra += track;
    if (kerned && k > 0 && cl !== prev) extra += kernBetween(s, at, prev, cl);
    const gid = infos[k].codepoint;
    if (gid === 0) {
      const ch = String.fromCodePoint(text.codePointAt(cl) ?? 0xfffd);
      if (!/\s/u.test(ch)) missing.add(ch);
    } else {
      glyphs.push({ gid, x: (pen + pos[k].xOffset) * scale + extra, y: -pos[k].yOffset * scale, pen: pen * scale + extra, adv: pos[k].xAdvance * scale, cl });
    }
    pen += pos[k].xAdvance;
  }
  return { width: pen * scale + extra + (direction === "rtl" ? lead : 0), glyphs, missing: [...missing], direction };
}

const vmtx = new WeakMap<LoadedFont, boolean>();
const hasVerticalMetrics = (font: LoadedFont) => {
  let v = vmtx.get(font);
  if (v === undefined) { v = !!font.hb.face.referenceTable("vmtx")?.length; vmtx.set(font, v); }
  return v;
};

/**
 * A column of vertical text (HarfBuzz top-to-bottom shaping). Advances come from the font's vertical
 * metrics, or are the font's line height (ascender − descender) when it has none. `x` is relative to
 * the column's centre line, `pen`/`y` measured down from its top.
 */
function shapeColumn(hb: HarfBuzz, font: LoadedFont, text: string, s: TextSettings, at: number): Run {
  const direction = resolveDirection(s.direction, text);
  if (!text) return { width: 0, glyphs: [], missing: [], direction };
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.setDirection(hb.Direction.TTB);
  buf.guessSegmentProperties();
  hb.shape(font.hb, buf);
  const infos = buf.getGlyphInfos(), pos = buf.getGlyphPositions();
  (buf as { destroy?: () => void }).destroy?.();
  const scale = s.size / font.unitsPerEm;
  const ext = font.hb.hExtents();
  const lineAdv = ext.ascender - ext.descender || font.unitsPerEm;
  const own = hasVerticalMetrics(font);
  const track = (s.tracking / 1000) * s.size;
  const kerned = hasAny(s.kerns);
  const glyphs: Run["glyphs"] = [];
  const missing = new Set<string>();
  let pen = 0, extra = kerned ? em(s, s.kerns![at]) : 0;
  for (let k = 0; k < infos.length; k++) {
    const cl = infos[k].cluster, prev = k > 0 ? infos[k - 1].cluster : cl;
    if (k > 0 && cl !== prev && spacingAllowed(text, Math.max(cl, prev))) extra += track;
    if (kerned && k > 0 && cl !== prev) extra += kernBetween(s, at, prev, cl);
    const adv = own ? -pos[k].yAdvance : lineAdv;
    const gid = infos[k].codepoint;
    if (gid === 0) {
      const ch = String.fromCodePoint(text.codePointAt(cl) ?? 0xfffd);
      if (!/\s/u.test(ch)) missing.add(ch);
    } else {
      glyphs.push({ gid, x: pos[k].xOffset * scale, y: (pen - pos[k].yOffset) * scale + extra, pen: pen * scale + extra, adv: adv * scale, cl });
    }
    pen += adv;
  }
  return { width: pen * scale + extra, glyphs, missing: [...missing], direction };
}

const commandCache = new WeakMap<LoadedFont, Map<number, PathCommand[]>>();
function glyphCommands(font: LoadedFont, gid: number): PathCommand[] {
  let m = commandCache.get(font);
  if (!m) commandCache.set(font, (m = new Map()));
  let cmds = m.get(gid);
  if (!cmds) { cmds = font.ot.glyphs.get(gid).getPath(0, 0, font.unitsPerEm).commands; m.set(gid, cmds); }
  return cmds;
}

function glyphPaths(cmds: PathCommand[], scale: number, ox: number, oy: number, pb: PathBuilder) {
  const X = (v: number) => ox + v * scale, Y = (v: number) => oy + v * scale;
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.type === "M") { pb.move(X(c.x), Y(c.y)); cx = c.x; cy = c.y; }
    else if (c.type === "L") { pb.line(X(c.x), Y(c.y)); cx = c.x; cy = c.y; }
    else if (c.type === "Q") {
      pb.cubic(X(cx + (2 / 3) * (c.x1 - cx)), Y(cy + (2 / 3) * (c.y1 - cy)), X(c.x + (2 / 3) * (c.x1 - c.x)), Y(c.y + (2 / 3) * (c.y1 - c.y)), X(c.x), Y(c.y));
      cx = c.x; cy = c.y;
    } else if (c.type === "C") { pb.cubic(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y)); cx = c.x; cy = c.y; }
    else if (c.type === "Z") pb.close();
  }
}

/** Glyph outline through an affine map from font units (y down) to the text's coordinates. */
function glyphPathsM(cmds: PathCommand[], m: Mat, pb: PathBuilder) {
  const P = (x: number, y: number) => apply(m, { x, y });
  let cx = 0, cy = 0;
  for (const c of cmds) {
    if (c.type === "M") { const p = P(c.x, c.y); pb.move(p.x, p.y); cx = c.x; cy = c.y; }
    else if (c.type === "L") { const p = P(c.x, c.y); pb.line(p.x, p.y); cx = c.x; cy = c.y; }
    else if (c.type === "Q") {
      const a = P(cx + (2 / 3) * (c.x1 - cx), cy + (2 / 3) * (c.y1 - cy)), b = P(c.x + (2 / 3) * (c.x1 - c.x), c.y + (2 / 3) * (c.y1 - c.y)), p = P(c.x, c.y);
      pb.cubic(a.x, a.y, b.x, b.y, p.x, p.y);
      cx = c.x; cy = c.y;
    } else if (c.type === "C") { const a = P(c.x1, c.y1), b = P(c.x2, c.y2), p = P(c.x, c.y); pb.cubic(a.x, a.y, b.x, b.y, p.x, p.y); cx = c.x; cy = c.y; }
    else if (c.type === "Z") pb.close();
  }
}

/** Paragraphs of the text with the index of their first character. */
function paragraphs(text: string): { text: string; at: number }[] {
  let at = 0;
  return text.replace(/\r\n?/g, "\n").split("\n").map((p) => { const r = { text: p.replace(/\t/g, " "), at }; at += p.length + 1; return r; });
}

/** Greedy word wrap of one paragraph to `width` mm (a word longer than the width gets its own line). */
function wrap(hb: HarfBuzz, font: LoadedFont, para: string, at: number, s: TextSettings): { text: string; at: number }[] {
  if (!s.width || s.width <= 0) return [{ text: para, at }];
  const words = para.split(/(\s+)/u);
  const lines: { text: string; at: number }[] = [];
  let cur = "", curAt = at, pos = at;
  for (let k = 0; k < words.length; k += 2) {
    const word = words[k], space = words[k + 1] ?? "";
    const trial = cur ? cur + word : word;
    if (cur && shapeLine(hb, font, trial.trimEnd(), s, curAt).width > s.width) { lines.push({ text: cur.trimEnd(), at: curAt }); cur = word + space; curAt = pos; }
    else cur = trial + space;
    pos += word.length + space.length;
  }
  lines.push({ text: cur.trimEnd(), at: curAt });
  return lines;
}

/** Collects glyph outlines and placements; `place` maps line coordinates (x along the baseline, y down) to the text's coordinates. */
class Emitter {
  pb = new PathBuilder();
  glyphs: GlyphPlace[] = [];
  missing = new Set<string>();
  constructor(private font: LoadedFont, private s: TextSettings) {}

  /** Horizontal line: `x` is where the run starts on the baseline; `place` the line's map (absent = a plain translate). */
  line(run: Run, at: number, x: number, baseline: number, place?: (g: Glyph) => Mat | null) {
    const { s, font } = this;
    const scale = s.size / font.unitsPerEm;
    run.missing.forEach((m) => this.missing.add(m));
    for (const g of run.glyphs) {
      const index = at + g.cl, shift = em(s, s.shifts?.[index]), turn = s.rotations?.[index] ?? 0;
      const lm = place ? place(g) : translate(x, baseline);
      if (!lm) continue;
      if (!place && !shift && !turn) glyphPaths(glyphCommands(font, g.gid), scale, x + g.x, baseline + g.y, this.pb);
      else {
        const pivot = { x: g.pen + g.adv / 2, y: 0 };
        glyphPathsM(glyphCommands(font, g.gid), mul(lm, mul(rotateAt(turn, pivot.x, pivot.y), [scale, 0, 0, scale, g.x, g.y - shift])), this.pb);
      }
      const o = apply(lm, { x: g.pen, y: 0 }), e = apply(lm, { x: g.pen + 1, y: 0 });
      this.glyphs.push({ index, x: o.x, y: o.y, angle: (Math.atan2(e.y - o.y, e.x - o.x) * 180) / Math.PI, advance: g.adv });
    }
  }

  /** Vertical column centred on `x`, its top at `y`. */
  column(run: Run, at: number, x: number, y: number) {
    const { s, font } = this;
    const scale = s.size / font.unitsPerEm;
    run.missing.forEach((m) => this.missing.add(m));
    for (const g of run.glyphs) {
      const index = at + g.cl, shift = em(s, s.shifts?.[index]), turn = s.rotations?.[index] ?? 0;
      glyphPathsM(glyphCommands(font, g.gid), mul(rotateAt(turn, x, y + g.pen + g.adv / 2), [scale, 0, 0, scale, x + g.x + shift, y + g.y]), this.pb);
      this.glyphs.push({ index, x, y: y + g.pen, angle: 90, advance: g.adv });
    }
  }

  done(lines: TextLayout["lines"], overflow = false): TextLayout {
    return { outline: this.pb.done(), lines, glyphs: this.glyphs, missing: [...this.missing], ...(overflow ? { overflow } : {}) };
  }
}

/** Where a run starts for an alignment around an anchor (point text) or inside a box of width `box`. */
function startX(run: Run, align: TextSettings["align"], box: number): number {
  const flip = run.direction === "rtl";
  const startEdge = box ? (flip ? box - run.width : 0) : flip ? -run.width : 0;
  const endEdge = box ? (flip ? 0 : box - run.width) : flip ? 0 : -run.width;
  return align === "center" ? (box ? (box - run.width) / 2 : -run.width / 2) : align === "end" ? endEdge : startEdge;
}

export function layoutText(hb: HarfBuzz, font: LoadedFont, s: TextSettings): TextLayout {
  if (s.onPath && s.frame?.some((f) => f.nodes.length > 1)) return layoutOnPath(hb, font, s);
  if (s.flowInto && s.frame?.length) return layoutFlow(hb, font, s);
  if (s.vertical) return layoutVertical(hb, font, s);
  const out = new Emitter(font, s);
  const lines: TextLayout["lines"] = [];
  paragraphs(s.text).flatMap((p) => wrap(hb, font, p.text, p.at, s)).forEach((ln, k) => {
    const run = shapeLine(hb, font, ln.text, s, ln.at);
    const baseline = k * s.lineHeight * s.size;
    const x = startX(run, s.align, s.width && s.width > 0 ? s.width : 0);
    out.line(run, ln.at, x, baseline);
    lines.push({ text: ln.text, width: run.width, x, baseline, direction: run.direction });
  });
  return out.done(lines);
}

/**
 * One line along the frame's first outline. Each glyph's baseline midpoint sits on the path at its
 * distance along the line and the glyph turns with the tangent there (SVG text-on-path placement).
 * Alignment is around the start point; closed paths wrap round, open paths hide what runs off.
 */
function layoutOnPath(hb: HarfBuzz, font: LoadedFont, s: TextSettings): TextLayout {
  const text = s.text.replace(/\r\n?/g, "\n").replace(/[\n\t]/g, " ");
  const run = shapeLine(hb, font, text, s, 0);
  const walk = pathWalker(s.frame!.find((f) => f.nodes.length > 1)!, s.pathSide === "right");
  const L = walk.length;
  const x0 = startX(run, s.align, 0);
  const off = ((s.pathStart ?? 0) / 100) * L;
  let overflow = false;
  const out = new Emitter(font, s);
  out.line(run, 0, x0, 0, (g) => {
    const mid = x0 + g.pen + g.adv / 2;
    let at = off + mid;
    if (walk.closed && L > 0) at = ((at % L) + L) % L;
    else if (at < -1e-9 || at > L + 1e-9) { overflow = true; return null; }
    const { p, angle } = walk.at(at);
    const c = Math.cos(angle), sn = Math.sin(angle);
    return mul([c, sn, -sn, c, p.x, p.y], translate(-(g.pen + g.adv / 2), 0));
  });
  return out.done([{ text, width: run.width, x: x0, baseline: 0, direction: run.direction }], overflow);
}

/**
 * Lines fill the inside of the frame's closed outlines from the top. Each line band (ascender to
 * descender) is cut into the spans the shape covers over the band's whole height; words fill the
 * spans in reading order like area text. A first word wider than its span is still placed when the
 * span is at least half the frame wide (as area text puts a long word on its own line), else the span
 * is skipped. Paragraphs start on a new band.
 */
function layoutFlow(hb: HarfBuzz, font: LoadedFont, s: TextSettings): TextLayout {
  const rings = s.frame!.map((f) => flatten(f, 0.01)).filter((r) => r.length > 2);
  const box = subpathsBox(s.frame!);
  const out = new Emitter(font, s);
  const lines: TextLayout["lines"] = [];
  if (!rings.length) return out.done(lines, !!s.text);
  const scale = s.size / font.unitsPerEm;
  const ext = font.hb.hExtents();
  const asc = ext.ascender * scale, desc = -ext.descender * scale, step = s.lineHeight * s.size;
  const frameW = box.maxX - box.minX;
  let baseline = box.minY + asc, overflow = false;
  for (const para of paragraphs(s.text)) {
    const words = para.text.split(/(\s+)/u);
    const starts: number[] = [];
    words.reduce((pos, w) => { starts.push(pos); return pos + w.length; }, para.at);
    const rtl = resolveDirection(s.direction, para.text) === "rtl";
    let k = 0;
    while (k < words.length) {
      if (baseline - asc > box.maxY) { overflow = true; break; }
      const spans = bandSpans(rings, baseline - asc, baseline + desc);
      for (const [x0, x1] of rtl ? [...spans].reverse() : spans) {
        if (k >= words.length) break;
        const w = x1 - x0, first = k;
        let cur = "";
        while (k < words.length) {
          const word = words[k], space = words[k + 1] ?? "";
          const trial = cur ? cur + word : word;
          if (cur && shapeLine(hb, font, trial.trimEnd(), s, starts[first]).width > w) break;
          if (!cur && word && w < frameW / 2 && shapeLine(hb, font, word, s, starts[k]).width > w) break;
          cur = trial + space;
          k += 2;
        }
        if (k === first) continue;
        const text = cur.trimEnd();
        const run = shapeLine(hb, font, text, s, starts[first]);
        const x = x0 + startX(run, s.align, w);
        out.line(run, starts[first], x, baseline);
        lines.push({ text, width: run.width, x, baseline, direction: run.direction });
      }
      baseline += step;
    }
    if (overflow) break;
  }
  return out.done(lines, overflow);
}

/** Paragraphs become columns, the first at x = 0 and the next ones to its left; alignment is along the column. */
function layoutVertical(hb: HarfBuzz, font: LoadedFont, s: TextSettings): TextLayout {
  const out = new Emitter(font, s);
  const lines: TextLayout["lines"] = [];
  paragraphs(s.text).forEach((p, k) => {
    const run = shapeColumn(hb, font, p.text, s, p.at);
    const x = 0 - k * s.lineHeight * s.size;
    const y = s.align === "center" ? -run.width / 2 : s.align === "end" ? -run.width : 0;
    out.column(run, p.at, x, y);
    lines.push({ text: p.text, width: run.width, x, baseline: y, direction: run.direction });
  });
  return out.done(lines);
}
