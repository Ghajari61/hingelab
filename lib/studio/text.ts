/**
 * Text layout for the studio Type tool: HarfBuzz shaping (contextual forms, ligatures, RTL) and
 * opentype.js outlines kept as Bézier curves. `size` is the em size in mm; tracking is in 1/1000 em
 * and is never inserted between cursively joined Arabic-script letters. Point text has its first
 * baseline at y = 0 with the anchor at x = 0; area text wraps inside [0, width].
 */
import type { PathCommand } from "opentype.js";
import { resolveDirection, spacingAllowed } from "@/lib/letters/shape";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { PathBuilder } from "./geom";
import type { Subpath, TextNode } from "./types";

export type TextSettings = Pick<TextNode, "text" | "size" | "tracking" | "lineHeight" | "align" | "direction" | "width">;

export interface TextLayout {
  outline: Subpath[];
  lines: { text: string; width: number; x: number; baseline: number; direction: "ltr" | "rtl" }[];
  missing: string[];
}

interface Run { width: number; glyphs: { gid: number; x: number; y: number }[]; missing: string[]; direction: "ltr" | "rtl" }

function shapeLine(hb: HarfBuzz, font: LoadedFont, text: string, s: TextSettings): Run {
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
  const glyphs: Run["glyphs"] = [];
  const missing = new Set<string>();
  let pen = 0, extra = 0;
  for (let k = 0; k < infos.length; k++) {
    const cl = infos[k].cluster, prev = k > 0 ? infos[k - 1].cluster : cl;
    if (k > 0 && cl !== prev && spacingAllowed(text, Math.max(cl, prev))) extra += track;
    const gid = infos[k].codepoint;
    if (gid === 0) {
      const ch = String.fromCodePoint(text.codePointAt(cl) ?? 0xfffd);
      if (!/\s/u.test(ch)) missing.add(ch);
    } else {
      glyphs.push({ gid, x: (pen + pos[k].xOffset) * scale + extra, y: -pos[k].yOffset * scale });
    }
    pen += pos[k].xAdvance;
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

/** Greedy word wrap of one paragraph to `width` mm (a word longer than the width gets its own line). */
function wrap(hb: HarfBuzz, font: LoadedFont, para: string, s: TextSettings): string[] {
  if (!s.width || s.width <= 0) return [para];
  const words = para.split(/(\s+)/u);
  const lines: string[] = [];
  let cur = "";
  for (let k = 0; k < words.length; k += 2) {
    const word = words[k], space = words[k + 1] ?? "";
    const trial = cur ? cur + word : word;
    if (cur && shapeLine(hb, font, trial.trimEnd(), s).width > s.width) { lines.push(cur.trimEnd()); cur = word + space; }
    else cur = trial + space;
  }
  lines.push(cur.trimEnd());
  return lines;
}

export function layoutText(hb: HarfBuzz, font: LoadedFont, s: TextSettings): TextLayout {
  const out: TextLayout = { outline: [], lines: [], missing: [] };
  const missing = new Set<string>();
  const scale = s.size / font.unitsPerEm;
  const lines = s.text.replace(/\r\n?/g, "\n").split("\n").flatMap((p) => wrap(hb, font, p.replace(/\t/g, " "), s));
  const pb = new PathBuilder();
  lines.forEach((text, k) => {
    const run = shapeLine(hb, font, text, s);
    run.missing.forEach((m) => missing.add(m));
    const baseline = k * s.lineHeight * s.size;
    const flip = run.direction === "rtl";
    const box = s.width && s.width > 0 ? s.width : 0;
    const startEdge = box ? (flip ? box - run.width : 0) : flip ? -run.width : 0;
    const endEdge = box ? (flip ? 0 : box - run.width) : flip ? 0 : -run.width;
    const x = s.align === "center" ? (box ? (box - run.width) / 2 : -run.width / 2) : s.align === "end" ? endEdge : startEdge;
    for (const g of run.glyphs) glyphPaths(glyphCommands(font, g.gid), scale, x + g.x, baseline + g.y, pb);
    out.lines.push({ text, width: run.width, x, baseline, direction: run.direction });
  });
  out.outline = pb.done();
  out.missing = [...missing];
  return out;
}
