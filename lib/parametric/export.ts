/**
 * Parametric export: one layered SVG per sheet (same layer scheme and colours as Hinge Box, cut
 * order C03 inner cuts → C00 engrave → C02 outline), an assembly guide, and a ZIP of everything.
 */
import { strToU8, zipSync } from "fflate";
import { EXPORT_LAYERS, r3, type LayerContent, type Layers } from "@/lib/hinge";
import { signedArea } from "@/lib/letters/polygon";
import { layoutSheets, SHEET_GAP } from './sheetLayout';
import { calibrationBar } from "@/lib/fit/calibration";
import { xmlCommentText } from "@/lib/security/svg";
import { addWatermark } from "@/lib/plans";
import { fmtMinutes } from "./cutTime";
import { finSpacingOf } from "./defaults";
import { toSheet } from "./nest";
import type { Contour, ParametricParams, Part, Point, Sheet, SliceResult } from "./types";

const closedD = (c: Contour) => (c.length ? `M${c.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L")}Z` : "");
const openD = (c: Contour) => (c.length ? `M${c.map(([x, y]) => `${r3(x)} ${r3(y)}`).join("L")}` : "");
const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export interface SheetPaths {
  outline: string[];
  inner: string[];
  engrave: string[];
  /** Scored lines: fold lines and the calibration scale. */
  score: string[];
  fills: string[];
}

/** Paths of one sheet in sheet mm, by layer. Outer contours go to the outline layer, holes and slots to inner cuts. */
export function sheetPaths(sheet: Sheet, parts: Map<string, Part>, K = 0, origin = { x: 0, y: 0 }): SheetPaths {
  const out: SheetPaths = { outline: [], inner: [], engrave: [], score: [], fills: [] };
  // Round in sheet coordinates first, so individual sheets and a combined file have identical
  // toolpaths even when a placement or an oversized sheet has fractional dimensions.
  const place = ([x, y]: Point): Point => [r3(x) + origin.x, r3(y) + origin.y];
  for (const it of sheet.items) {
    const part = parts.get(it.partId);
    if (!part?.cut) continue;
    const tf = (c: Contour) => c.map(q => place(toSheet(q, it)));
    const outers = part.cut.outline.filter(c => signedArea(c) > 0).map(tf);
    const holes = part.cut.outline.filter(c => signedArea(c) <= 0).map(tf);
    out.outline.push(...outers.map(closedD));
    out.inner.push(...holes.map(closedD), ...part.cut.inner.map(c => closedD(tf(c))));
    out.engrave.push(...part.engrave.map(c => openD(tf(c))));
    out.score.push(...(part.score ?? []).map(c => openD(tf(c))));
    out.fills.push([...outers, ...holes].map(closedD).join(""));
  }
  if (sheet.calibration) {
    const { x, y, w } = sheet.calibration;
    const bar = calibrationBar(x, y, w, K);
    out.outline.push(...bar.cut.map(c => closedD(c.map(place))));
    out.score.push(...bar.score.map(c => openD(c.map(place))));
  }
  return out;
}

/** Sheet paths in the shared LayerContent shape, for the editor canvas (engrave and score go to `hinge`, drawn as hairlines). */
export function sheetLayerContent(sheet: Sheet, parts: Map<string, Part>, ox: number, oy: number, K = 0): LayerContent {
  const s = sheetPaths(sheet, parts, K, { x: ox, y: oy });
  return { outline: s.outline, slots: s.inner, hinge: [...s.engrave, ...s.score], labels: [], fills: s.fills };
}

const LAYER = (key: "outline" | "slots" | "labels" | "hinge") => EXPORT_LAYERS.find(l => l.key === key)!;

export function sheetSVG(result: SliceResult, sheetIndex: number, p: ParametricParams, opts: { watermark?: boolean } = {}): string {
  const sheet = result.sheets[sheetIndex];
  const parts = new Map(result.parts.map(q => [q.id, q]));
  const S = sheetPaths(sheet, parts, p.material.K);
  const ids = sheet.items.map(it => it.partId).join(", ");
  const comment = `HingeLab Parametric: ${p.name}, sheet ${sheetIndex + 1} of ${result.sheets.length}${sheet.oversize ? " (OVERSIZE: larger than the material)" : ""}. Material ${p.material.T} mm, kerf ${p.material.K} mm (compensated). Parts: ${ids}. Cut order: inner cuts, ${S.score.length ? "score, " : ""}engrave, outline.`;
  return layeredSVG(sheet.width, sheet.height, comment, S, p, opts);
}

/**
 * Every sheet in one layered SVG, in the same grid as the canvas and Lay Flat (the main
 * export; the ZIP and single sheets are extras).
 */
export function allSheetsSVG(result: SliceResult, p: ParametricParams, opts: { watermark?: boolean } = {}): string {
  const parts = new Map(result.parts.map(q => [q.id, q]));
  const S: SheetPaths = { outline: [], inner: [], engrave: [], score: [], fills: [] };
  const { rects, W, H } = layoutSheets(result.sheets);
  for (const [i, sh] of result.sheets.entries()) {
    const one = sheetPaths(sh, parts, p.material.K, rects[i]);
    for (const k of ["outline", "inner", "engrave", "score", "fills"] as const) S[k].push(...one[k]);
  }
  const n = result.sheets.length;
  const sizes = result.sheets.map(sh => `${r3(sh.width)} × ${r3(sh.height)}${sh.oversize ? " (OVERSIZE)" : ""}`).join(", ");
  const comment = `HingeLab Parametric: ${p.name}, ${n} sheet${n === 1 ? "" : "s"} in rows ${SHEET_GAP} mm apart (${sizes} mm), matching Lay Flat. Material ${p.material.T} mm, kerf ${p.material.K} mm (compensated). Parts: ${result.parts.map(q => q.id).join(", ")}. Cut order: inner cuts, ${S.score.length ? "score, " : ""}engrave, outline.`;
  return layeredSVG(W, H, comment, S, p, opts);
}

function layeredSVG(width: number, height: number, comment: string, S: SheetPaths, p: ParametricParams, opts: { watermark?: boolean }): string {
  const W = r3(width), H = r3(height);
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">\n`;
  s += `<!-- ${xmlCommentText(comment)} -->\n`;
  const layer = (key: "outline" | "slots" | "labels" | "hinge", paths: string[], name = LAYER(key).name) => {
    const def = LAYER(key);
    // Folded nets keep their edge numbers when part labels are off.
    if (!p.layers[key].exp || (key === "labels" && !p.labels.enabled && p.method !== "folded") || (key === "hinge" && !paths.length)) return;
    s += `<g id="${key}" inkscape:groupmode="layer" inkscape:label="${def.code} ${name}" fill="none" stroke="${def.color}" stroke-width="0.1">\n`;
    for (const d of paths) if (d) s += `  <path d="${d}"/>\n`;
    s += `</g>\n`;
  };
  layer("slots", S.inner);
  layer("hinge", S.score, "Score lines");
  layer("labels", S.engrave);
  layer("outline", S.outline);
  s += `</svg>\n`;
  return opts.watermark ? addWatermark(s) : s;
}

/* ---------- Assembly guide ---------- */

type V3 = [number, number, number];
const apply = (m: number[], x: number, y: number, z: number): V3 => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/** Exploded isometric line drawing of the assembled parts (painter's order), as SVG elements fitted into w × h. */
function isoThumbnail(result: SliceResult, T: number, w: number, h: number): string {
  const yaw = (-35 * Math.PI) / 180, pitch = (25 * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const view = ([x, y, z]: V3): V3 => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  const mid = (result.planes.length - 1) / 2;
  const gap = Math.max(4, finSpacingOfResult(result) * 0.8);
  const polys: { pts: [number, number][]; depth: number; board: boolean }[] = [];
  for (const part of result.parts) {
    if (part.faces3d) {
      const f = part.faces3d;
      for (let i = 0; i + 8 < f.length; i += 9) {
        const pts3 = [0, 3, 6].map(k => view([f[i + k], f[i + k + 1], f[i + k + 2]]));
        polys.push({ pts: pts3.map(q => [q[0], -q[1]]), depth: pts3.reduce((a, q) => a + q[2], 0) / 3, board: false });
      }
      continue;
    }
    const board = part.kind === "backboard";
    const n = part.plane >= 0 ? result.planes[part.plane].normal : ([0, 0, 1] as V3);
    const fanned = (result.method === "radial" || result.method === "curveNormal") && part.plane >= 0 && part.kind !== "backboard" && part.kind !== "hub";
    const u = part.plane >= 0 ? result.planes[part.plane].u : ([1, 0, 0] as V3);
    const ex = board ? [0, 0, -40] : fanned ? [u[0] * gap, u[1] * gap, u[2] * gap] : [n[0] * (part.plane - mid) * gap * 0.5, n[1] * (part.plane - mid) * gap * 0.5, 0];
    for (const z of [T / 2, -T / 2]) {
      const pts3 = part.shape.outer.map(([x, y]) => { const q = apply(part.placement, x, y, z); return view([q[0] + ex[0], q[1] + ex[1], q[2] + ex[2]]); });
      polys.push({ pts: pts3.map(q => [q[0], -q[1]]), depth: pts3.reduce((a, q) => a + q[2], 0) / pts3.length, board });
    }
  }
  if (!polys.length) return "";
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const pg of polys) for (const [x, y] of pg.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const k = Math.min(w / (x1 - x0), h / (y1 - y0));
  polys.sort((a, b) => a.depth - b.depth);
  return polys.map(pg => `<path d="${closedD(pg.pts.map(([x, y]) => [(x - x0) * k, (y - y0) * k] as Point))}" fill="${pg.board ? "#E8DCC8" : "#F2E2C4"}" stroke="#6B4D24" stroke-width="0.25" stroke-linejoin="round"/>`).join("\n");
}

const finSpacingOfResult = (r: SliceResult) => (r.planes.length > 1 ? Math.abs(r.planes[1].offset - r.planes[0].offset) : 10);

const METHOD_NAMES: Record<ParametricParams["method"], string> = {
  parallel: "parallel fins", stacked: "stacked layers", waffle: "waffle ribs", radial: "radial fins", curveNormal: "fins along a curve", folded: "folded nets",
};

/** Distance between neighbouring slots on the board, for the slot label size. */
const guideSpacing = (p: ParametricParams) => (p.method === "curveNormal" ? p.curveNormal.spacingAtGuide : finSpacingOf(p));

function methodLine(p: ParametricParams): string {
  if (p.method === "stacked") return `layers ${p.material.T} mm thick stacked along ${p.stacked.axis}`;
  if (p.method === "waffle") return `ribs every ${r3(p.waffle.spacingA)} / ${r3(p.waffle.spacingB)} mm across ${p.waffle.familyAxes.join(" and ")}`;
  if (p.method === "radial") return `${p.radial.count} fins round ${p.radial.axis} from ${r3(p.radial.angleRange[0])}° to ${r3(p.radial.angleRange[1])}°, hub radius ${r3(p.radial.innerRadius)} mm`;
  if (p.method === "curveNormal") {
    const g = p.curveNormal.guide;
    return `fins square to ${g.kind === "circle" ? `a ${r3(g.d)} mm circle` : `a ${r3(g.w)} × ${r3(g.h)} mm oval`}`;
  }
  if (p.method === "folded") return `about ${p.folded.faces} faces${p.folded.tabs ? `, ${r3(p.folded.tabWidth)} mm glue tabs` : ""}`;
  return `fins every ${r3(finSpacingOf(p))} mm along ${p.parallel.axis}`;
}

export function assemblyGuideSVG(result: SliceResult, p: ParametricParams): string {
  const board = result.parts.find(q => q.kind === "backboard");
  const bb = board ? board.shape.bbox : null;
  const boardW = bb ? bb.x1 - bb.x0 : 0, boardH = bb ? bb.y1 - bb.y0 : 0;
  const W = Math.max(420, boardW + 40, 300);
  const thumbW = Math.min(260, W - 40), thumbH = 180;
  const time = result.stats.estimatedCutTime ? ` (${fmtMinutes(result.stats.estimatedCutTime)} on the laser)` : "";
  const steps = [
    `Cut all ${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"}${time}. Every part is engraved with its id.`,
    ...(p.material.partGap === 0 ? ["The parts touch on the sheet (Part gap 0), so their shared lines are cut once: press them apart along those lines."] : []),
    ...result.guide,
  ];

  const lineH = 7;
  const top = 34;
  const boardY = top + thumbH + 20;
  const stepsY = boardY + (board ? boardH + 28 : 0);
  const H = stepsY + steps.length * lineH + 16;
  let s = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${r3(W)}mm" height="${r3(H)}mm" viewBox="0 0 ${r3(W)} ${r3(H)}" font-family="Arial, Helvetica, sans-serif">\n`;
  s += `<rect width="100%" height="100%" fill="#FFFFFF"/>\n`;
  s += `<text x="20" y="18" font-size="8" font-weight="bold">${escapeXml(p.name)} · assembly guide</text>\n`;
  s += `<text x="20" y="27" font-size="4.2" fill="#444">${escapeXml(METHOD_NAMES[p.method])}: ${result.parts.length} parts on ${result.sheets.length} sheet${result.sheets.length === 1 ? "" : "s"} · ${p.material.T} mm material, kerf ${p.material.K} mm · ${escapeXml(methodLine(p))}</text>\n`;
  s += `<g id="thumbnail" transform="translate(20 ${top})">${isoThumbnail(result, p.material.T, thumbW, thumbH)}</g>\n`;
  if (board && bb) {
    s += `<text x="20" y="${r3(boardY - 6)}" font-size="4.5" font-weight="bold">Backboard ${board.id} at full size (front view)</text>\n`;
    // Plates whose local y runs up the wall are drawn flipped so the guide shows the front.
    const flip = board.placement[5] > 0;
    s += `<g id="backboard" transform="${flip ? `translate(${r3(20 - bb.x0)} ${r3(boardY + bb.y1)}) scale(1 -1)` : `translate(${r3(20 - bb.x0)} ${r3(boardY - bb.y0)})`}" fill="none" stroke="#000" stroke-width="0.3">\n`;
    s += `  <path d="${[board.shape.outer, ...board.shape.holes].map(closedD).join("")}"/>\n`;
    for (const c of board.innerCuts) s += `  <path d="${closedD(c)}" stroke="#00A000"/>\n`;
    // The board's slots are stored in part order, one per tab.
    let si = 0;
    for (const part of result.parts) {
      if (!part.tabs?.length) continue;
      for (let t = 0; t < part.tabs.length && si < board.innerCuts.length; t++, si++) {
        const c = board.innerCuts[si];
        const xs = c.map(q => q[0]), ys = c.map(q => q[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const vertical = Math.max(...ys) - Math.min(...ys) > Math.max(...xs) - Math.min(...xs);
        const fs = Math.min(2.6, Math.max(1.2, guideSpacing(p) - p.material.T - 1));
        if (flip) {
          const [a, b] = Math.hypot(c[1][0] - c[0][0], c[1][1] - c[0][1]) >= Math.hypot(c[2][0] - c[1][0], c[2][1] - c[1][1]) ? [c[0], c[1]] : [c[1], c[2]];
          let ang = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI;
          if (ang > 90) ang -= 180;
          if (ang <= -90) ang += 180;
          s += `  <text x="0" y="0" font-size="${r3(fs)}" fill="#000" stroke="none" text-anchor="middle" dominant-baseline="middle" transform="translate(${r3(cx)} ${r3(cy)}) scale(1 -1) rotate(${r3(ang)})">${escapeXml(part.id)}</text>\n`;
          continue;
        }
        s += `  <text x="${r3(cx)}" y="${r3(cy)}" font-size="${r3(fs)}" fill="#000" stroke="none" text-anchor="middle" dominant-baseline="middle"${vertical ? ` transform="rotate(-90 ${r3(cx)} ${r3(cy)})"` : ""}>${escapeXml(part.id)}</text>\n`;
      }
    }
    s += `</g>\n`;
  }
  s += `<g id="steps" font-size="4.2">\n`;
  steps.forEach((t, i) => { s += `  <text x="20" y="${r3(stepsY + i * lineH)}">${i + 1}. ${escapeXml(t)}</text>\n`; });
  s += `</g>\n</svg>\n`;
  return s;
}

export const projectJSON = (p: ParametricParams) => JSON.stringify({ app: "HingeLab", product: "parametric", version: 1, params: p }, null, 2);

/** File-name stem for a project's exports, e.g. "parametric-Wave-panel". */
export const slugName = (name: string) => `parametric-${name.trim().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 32) || "sculpture"}`;

export const sheetFileName = (i: number, n: number) => `sheet-${String(i + 1).padStart(Math.max(2, String(n).length), "0")}.svg`;

/** Each sheet, all sheets in one file, the assembly guide and the project file as one ZIP. */
export function exportZip(result: SliceResult, p: ParametricParams, opts: { watermark?: boolean } = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  result.sheets.forEach((_, i) => { files[sheetFileName(i, result.sheets.length)] = strToU8(sheetSVG(result, i, p, opts)); });
  files["all-sheets.svg"] = strToU8(allSheetsSVG(result, p, opts));
  files["assembly-guide.svg"] = strToU8(assemblyGuideSVG(result, p));
  files["project.hingelab.json"] = strToU8(projectJSON(p));
  return zipSync(files, { level: 6 });
}

export type { Layers };
