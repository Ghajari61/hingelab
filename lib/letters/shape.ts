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

/** Shape `text` and return glyph outlines in mm. Line breaks are treated as spaces (one line). */
export function shapeText(hb: HarfBuzz, font: LoadedFont, rawText: string, o: ShapeOptions): TextOutline {
  const text = rawText.replace(/[\r\n\t]/g, " ");
  const dir = resolveDirection(o.direction, text);

  const buf = new hb.Buffer();
  buf.addText(text);
  buf.setDirection(dir === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
  buf.guessSegmentProperties();
  hb.shape(font.hb, buf);
  const infos = buf.getGlyphInfos();
  const pos = buf.getGlyphPositions();

  // Layout in font units first; the scale depends on the size mode.
  const units: { gid: number; cluster: number; x: number; y: number; boundary: boolean }[] = [];
  let pen = 0;
  for (let i = 0; i < infos.length; i++) {
    const c = infos[i].cluster;
    const prevC = i > 0 ? infos[i - 1].cluster : c;
    const boundary = i > 0 && c !== prevC && spacingAllowed(text, Math.max(c, prevC));
    units.push({ gid: infos[i].codepoint, cluster: c, x: pen + pos[i].xOffset, y: -pos[i].yOffset, boundary });
    pen += pos[i].xAdvance;
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
