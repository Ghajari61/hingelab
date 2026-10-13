/**
 * Text -> shaped glyph run (HarfBuzz) -> glyph outlines in mm (opentype.js, by glyph ID).
 *
 * HarfBuzz picks the contextual forms, ligatures and positions; glyphs come back in visual
 * order (left to right on the canvas) for both directions. The baseline is y = 0, y points down.
 */
import type { PathCommand } from "opentype.js";
import type { HarfBuzz, LoadedFont } from "./fonts";
import { flatten } from "./polygon";
import type { Contour, Direction, LetterParams, ShapedGlyph, ShapedText } from "./types";

export interface GlyphOutline {
  gid: number;
  cluster: number;
  contours: Contour[];
}

export interface TextOutline {
  shaped: ShapedText;
  glyphs: GlyphOutline[];
}

type ShapeOptions = Pick<LetterParams, "direction" | "size" | "sizeMode" | "letterSpacing">;

const RTL_CHAR = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;
const STRONG_CHAR = /\p{L}/u;

/** Direction from the first strong character; "ltr" when there is none. */
export function detectDirection(text: string): "ltr" | "rtl" {
  for (const ch of text) {
    if (RTL_CHAR.test(ch)) return "rtl";
    if (STRONG_CHAR.test(ch)) return "ltr";
  }
  return "ltr";
}

export const resolveDirection = (d: Direction, text: string) => (d === "auto" ? detectDirection(text) : d);

/** Arabic-script letters that never connect to the following letter. */
const RIGHT_JOINING = new Set([..."ءآأؤإاةدذرزوٱژۀ"]);
const isArabicLetter = (ch: string) => /[\u0620-\u064a\u066e-\u06d3\u06d5\u06fa-\u06ff\u0750-\u077f]/u.test(ch);

/**
 * True if letter spacing may go between text[b-1] and text[b]. It is skipped where two Arabic-script
 * letters are cursively joined, so connected Persian letters stay connected.
 */
export function spacingAllowed(text: string, b: number) {
  const prev = text[b - 1], next = text[b];
  if (prev === undefined || next === undefined) return false;
  const joins = (isArabicLetter(prev) || prev === "\u0640") && !RIGHT_JOINING.has(prev);
  return !(joins && (isArabicLetter(next) || next === "\u0640"));
}

/** Glyph path commands in font units with y down, cached per font. */
const pathCache = new WeakMap<LoadedFont, Map<number, PathCommand[]>>();
function glyphCommands(font: LoadedFont, gid: number) {
  let m = pathCache.get(font);
  if (!m) pathCache.set(font, (m = new Map()));
  let cmds = m.get(gid);
  if (!cmds) {
    cmds = font.ot.glyphs.get(gid).getPath(0, 0, font.unitsPerEm).commands;
    m.set(gid, cmds);
  }
  return cmds;
}

const DIGIT = /[0-9\u0660-\u0669\u06f0-\u06f9]/u;

/** A stretch of text shaped in one direction, in the order it is drawn (left to right). */
export interface DirectionRun { start: number; end: number; rtl: boolean }

/**
 * The text cut into runs of one direction, in visual order: a small form of the Unicode bidi
 * algorithm (strong letters, numbers that read left to right inside right-to-left text, neutrals
 * that take the direction around them). Text in one direction is a single run.
 */
export function directionRuns(text: string, base: "ltr" | "rtl"): DirectionRun[] {
  const e = base === "rtl" ? 1 : 0;
  const items: { start: number; len: number; kind: "R" | "L" | "EN" | "N"; level: number }[] = [];
  let i = 0;
  for (const ch of text) {
    const kind = RTL_CHAR.test(ch) && !DIGIT.test(ch) ? "R" : DIGIT.test(ch) ? "EN" : STRONG_CHAR.test(ch) ? "L" : "N";
    items.push({ start: i, len: ch.length, kind, level: e });
    i += ch.length;
  }
  const rtlAny = items.some((x) => x.kind === "R");
  const ltrAny = items.some((x) => x.kind === "L" || x.kind === "EN");
  if (!rtlAny || (base === "rtl" && !ltrAny)) return [{ start: 0, end: text.length, rtl: base === "rtl" && rtlAny }];
  // Numbers after right-to-left letters (or at the start of right-to-left text) count as right-to-left for neutrals.
  let lastStrong: "R" | "L" = base === "rtl" ? "R" : "L";
  const side = items.map((x) => {
    if (x.kind === "R" || x.kind === "L") lastStrong = x.kind;
    return x.kind === "EN" ? (lastStrong === "R" ? "R" : "L") : x.kind === "N" ? null : x.kind;
  });
  for (let k = 0; k < items.length; k++) {
    const x = items[k];
    if (x.kind === "R") x.level = 1;
    else if (x.kind === "L") x.level = e === 1 ? 2 : 0;
    else if (x.kind === "EN") x.level = side[k] === "R" || e === 1 ? 2 : 0;
  }
  for (let k = 0; k < items.length; k++) {
    if (items[k].kind !== "N") continue;
    let a = k - 1, b = k + 1;
    while (a >= 0 && items[a].kind === "N") a--;
    while (b < items.length && items[b].kind === "N") b++;
    const before = a >= 0 ? side[a] : base === "rtl" ? "R" : "L";
    const after = b < items.length ? side[b] : base === "rtl" ? "R" : "L";
    items[k].level = before === after ? (before === "R" ? 1 : e === 1 ? 2 : 0) : e;
  }
  // Reverse every stretch at or above each level, highest first (UAX #9 rule L2).
  const order = items.map((_, k) => k);
  const maxLevel = Math.max(...items.map((x) => x.level));
  for (let lv = maxLevel; lv >= 1; lv--) {
    for (let k = 0; k < order.length;) {
      if (items[order[k]].level < lv) { k++; continue; }
      let j = k;
      while (j < order.length && items[order[j]].level >= lv) j++;
      order.splice(k, j - k, ...order.slice(k, j).reverse());
      k = j;
    }
  }
  const runs: DirectionRun[] = [];
  let cur: { lo: number; hi: number; level: number; last: number } | null = null;
  for (const k of order) {
    const x = items[k];
    const rtl = x.level % 2 === 1;
    if (cur && cur.level === x.level && k === cur.last + (rtl ? -1 : 1)) {
      cur.lo = Math.min(cur.lo, x.start); cur.hi = Math.max(cur.hi, x.start + x.len); cur.last = k;
      continue;
    }
    if (cur) runs.push({ start: cur.lo, end: cur.hi, rtl: cur.level % 2 === 1 });
    cur = { lo: x.start, hi: x.start + x.len, level: x.level, last: k };
  }
  if (cur) runs.push({ start: cur.lo, end: cur.hi, rtl: cur.level % 2 === 1 });
  return runs;
}

/** Shape `text` and return glyph outlines in mm. Line breaks are treated as spaces (one line). */
export function shapeText(hb: HarfBuzz, font: LoadedFont, rawText: string, o: ShapeOptions): TextOutline {
  const text = rawText.replace(/[\r\n\t]/g, " ");
  const dir = resolveDirection(o.direction, text);

  // Layout in font units first; the scale depends on the size mode.
  const units: { gid: number; cluster: number; x: number; y: number; boundary: boolean }[] = [];
  let pen = 0;
  const runs = directionRuns(text, dir);
  for (const run of runs.length === 1 ? [{ start: 0, end: text.length, rtl: dir === "rtl" }] : runs) {
    const buf = new hb.Buffer();
    buf.addText(text.slice(run.start, run.end));
    buf.setDirection(run.rtl ? hb.Direction.RTL : hb.Direction.LTR);
    buf.guessSegmentProperties();
    hb.shape(font.hb, buf);
    const infos = buf.getGlyphInfos();
    const pos = buf.getGlyphPositions();
    for (let i = 0; i < infos.length; i++) {
      const c = infos[i].cluster + run.start;
      const prevC = units.length ? units[units.length - 1].cluster : c;
      const boundary = units.length > 0 && c !== prevC && spacingAllowed(text, Math.max(c, prevC));
      units.push({ gid: infos[i].codepoint, cluster: c, x: pen + pos[i].xOffset, y: -pos[i].yOffset, boundary });
      pen += pos[i].xAdvance;
    }
  }

  let scale: number;
  if (o.sizeMode === "capHeight") {
    scale = o.size / font.capHeight;
  } else {
    let y0 = Infinity, y1 = -Infinity;
    for (const g of units) {
      if (g.gid === 0) continue;
      for (const c of flatten(glyphCommands(font, g.gid), (x, y) => [x, y + g.y], 1)) for (const q of c) {
        y0 = Math.min(y0, q[1]);
        y1 = Math.max(y1, q[1]);
      }
    }
    scale = y1 > y0 ? o.size / (y1 - y0) : o.size / font.capHeight;
  }

  // Letter spacing in mm goes before every allowed cluster boundary.
  const glyphs: ShapedGlyph[] = [];
  let extra = 0;
  for (const g of units) {
    if (g.boundary) extra += o.letterSpacing;
    glyphs.push({ gid: g.gid, cluster: g.cluster, x: g.x * scale + extra, y: g.y * scale, notdef: g.gid === 0 });
  }

  const missing = new Set<string>();
  for (const g of glyphs) {
    if (!g.notdef) continue;
    const ch = String.fromCodePoint(text.codePointAt(g.cluster) ?? 0xfffd);
    if (!/\s/u.test(ch)) missing.add(ch);
  }

  const outlines: GlyphOutline[] = [];
  for (const g of glyphs) {
    if (g.notdef) continue;
    const contours = flatten(glyphCommands(font, g.gid), (x, y) => [g.x + x * scale, g.y + y * scale]);
    if (contours.length) outlines.push({ gid: g.gid, cluster: g.cluster, contours });
  }

  return { shaped: { glyphs, direction: dir, scale, missing: [...missing] }, glyphs: outlines };
}
