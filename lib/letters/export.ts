/**
 * Letters layout and SVG export, using the Hinge Box layer scheme:
 * inner cuts (C03) -> hinge (C01) -> outline (C02), labels on C00.
 */
import { clamp, colSegments, hingeCutPaths, hingeSegments, layeredSVG, layoutParts, outlinePath, polyD, r3 } from "@/lib/hinge";
import type { LayerContent, Layout } from "@/lib/hinge";
import { hingeParamsOf } from "./defaults";
import { fontInfo } from "./fonts";
import type { BoxInfo, LetterModel, LetterParams, LetterPart } from "./types";

/** Parts are packed in reading order so a word reads as typed on the sheet. */
export const layoutLetters = (model: LetterModel, p: LetterParams): Layout<LetterPart> => layoutParts(model.parts, p.bedW, p.gap, true);

export function letterLayerContent(lay: Layout<LetterPart>, p: LetterParams): LayerContent {
  const L: LayerContent = { outline: [], slots: [], hinge: [], labels: [], fills: [] };
  const hp = hingeParamsOf(p);
  for (const { pt, ox, oy } of lay.items) {
    if (pt.kind === "solid" || pt.kind === "plate") {
      const outer = polyD(pt.outer, ox, oy);
      const holes = pt.holes.map(h => polyD(h, ox, oy));
      L.outline.push(outer);
      L.slots.push(...holes);
      L.fills.push([outer, ...holes].join(" "));
      L.labels.push({ x: pt.label.x + ox, y: pt.label.y + oy, text: pt.name, size: pt.label.size });
      if (pt.kind === "plate") {
        for (const s of pt.slots) L.slots.push(polyD(s, ox, oy));
        for (const m of pt.marks) L.labels.push({ ...m, x: m.x + ox, y: m.y + oy });
      }
    } else {
      const d = pt.kind === "strip" ? outlinePath(pt, ox, oy) : polyD(pt.outline, ox, oy);
      L.outline.push(d);
      L.fills.push(d);
      if (pt.kind === "strip") {
        const hs = hingeSegments(pt.hBody, p.slit, p.bridge);
        for (const c of pt.cols) L.hinge.push(...hingeCutPaths(c.x, colSegments(c.kind, hs, pt.hBody, p.bridge), pt.hBody, hp, ox, oy));
        for (const m of pt.marks) L.labels.push({ ...m, x: m.x + ox, y: m.y + oy });
      }
      if (pt.label) L.labels.push({ x: pt.label.x + ox, y: pt.label.y + oy, text: pt.name, size: clamp(pt.hBody / 7, 3, 7) });
    }
  }
  return L;
}

/** Zone overlay colours: flat, comfortable curve, close to the limit, too tight. */
export const ZONE_COLORS = { flat: "#5b6472", ok: "#3fb950", tight: "#d29922", crack: "#f85149", seam: "#58a6ff" } as const;

export interface OverlayPath {
  d: string;
  color: string;
  /** Stroke width in screen pixels. */
  width: number;
}

/** Where a letter's base plate landed on the sheet, or null when it is not laid out. */
export function baseOffset(lay: Layout<LetterPart>, letter: string): [number, number] | null {
  const it = lay.items.find(({ pt }) => pt.kind === "plate" && (pt.name === `${letter} · base` || pt.name.startsWith(`${letter} · base `)));
  return it ? [it.ox, it.oy] : null;
}

/**
 * The "Show zones" overlay: every wall centerline coloured by zone with its seams marked
 * (hinge), or with its panel corners marked (flat panels). `place` gives each letter's offset;
 * by default everything stays in letter coordinates.
 */
export function zoneOverlay(box: BoxInfo, place: (letter: string) => [number, number] | null = () => [0, 0]): OverlayPath[] {
  const paths: OverlayPath[] = [];
  for (const w of box.walls) {
    const off = place(w.letter);
    if (!off) continue;
    const [ox, oy] = off;
    const line = (pts: [number, number][]) => "M" + pts.map(q => `${r3(q[0] + ox)},${r3(q[1] + oy)}`).join(" L");
    const c = w.centerline, n = c.length;
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + Math.hypot(c[(i + 1) % n][0] - c[i][0], c[(i + 1) % n][1] - c[i][1]));
    const at = (s: number): [number, number] => {
      let i = 0;
      while (i < n - 1 && cum[i + 1] < s) i++;
      const l = cum[i + 1] - cum[i], t = l > 0 ? (s - cum[i]) / l : 0, a = c[i], b = c[(i + 1) % n];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    };
    const piece = (s0: number, s1: number) => [at(s0), ...c.filter((_, i) => cum[i] > s0 && cum[i] < s1), at(s1)];
    const dot = (q: [number, number], r: number) =>
      `M${r3(q[0] + ox - r)},${r3(q[1] + oy)} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0`;
    if (w.style === "hinge") {
      for (const z of w.zones) {
        const color = z.kind === "flat" ? ZONE_COLORS.flat : ZONE_COLORS[z.verdict ?? "ok"];
        paths.push({ d: line(piece(z.s0, z.s1)), color, width: z.kind === "flat" ? 1.5 : 3 });
      }
      for (const s of w.seams) paths.push({ d: dot(at(s), 1.6), color: ZONE_COLORS.seam, width: 2 });
    } else {
      paths.push({ d: line([...c, c[0]]), color: ZONE_COLORS.flat, width: 1.5 });
      for (const j of w.joints) paths.push({ d: dot(at(j.s), 1.2), color: j.kind === "finger" ? ZONE_COLORS.ok : ZONE_COLORS.tight, width: 2 });
    }
  }
  return paths;
}

export function exportLetterSVG(lay: Layout<LetterPart>, p: LetterParams, fontName = fontInfo(p.fontId)?.name ?? p.fontId) {
  const text = p.text.replace(/\s+/g, " ").trim();
  const size = p.sizeMode === "capHeight" ? `cap height ${r3(p.size)} mm` : `total height ${r3(p.size)} mm`;
  const mode = p.mode === "box" ? `letter box (${p.wallStyle === "hinge" ? "living-hinge walls" : "flat-panel walls"}), depth ${r3(p.depth)} mm, ${p.lid} lid` : p.mode;
  const order = p.mode === "box" && p.wallStyle === "hinge" ? "inner cuts, hinge, outline" : "inner cuts, outline";
  const comment = `HingeLab letters: "${text}", ${fontName}, ${mode}, ${size}. Material ${p.T} mm, kerf ${p.K} mm (compensated). Cut order: ${order}.`;
  const layers = p.mode === "box" && p.wallStyle === "hinge" ? p.layers : { ...p.layers, hinge: { ...p.layers.hinge, exp: false } };
  return layeredSVG(lay.width, lay.height, comment, letterLayerContent(lay, p), layers, p.labels);
}
