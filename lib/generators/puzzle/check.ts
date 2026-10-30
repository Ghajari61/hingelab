import type { Issue } from "@/lib/issues";
import { WHIMSY_WALL, neckOf, type PuzzleOutput } from "./build";
import type { PuzzleParams } from "./params";

/** Smallest comfortable piece, mm across. */
export const MIN_PIECE = 12;
/** Narrowest tab neck that survives handling, mm. */
export const MIN_NECK = 3;

const r0 = (v: number) => Math.round(v);

/** Fewer pieces so each is at least `size` mm across. */
function piecesFor(p: PuzzleParams, info: NonNullable<PuzzleOutput["info"]>, size: number): PuzzleParams {
  const k = Math.min(info.cw, info.ch) / size;
  if (p.pieces.auto) return { ...p, pieces: { ...p.pieces, count: Math.max(2, Math.floor(info.pieces * k * k)) } };
  return { ...p, pieces: { ...p.pieces, cols: Math.max(1, Math.floor(info.cols * k)), rows: Math.max(1, Math.floor(info.rows * k)) } };
}

export function checkPuzzle(p: PuzzleParams, out: PuzzleOutput): Issue<PuzzleParams>[] {
  const issues: Issue<PuzzleParams>[] = [];
  const info = out.info;
  if (!info) return issues;
  const size = Math.min(info.cw, info.ch);

  if (size < MIN_PIECE) {
    issues.push({
      code: "SMALL_PIECES", level: "warn",
      message: `Pieces are about ${r0(size)} mm across; under ${MIN_PIECE} mm they are fiddly and the tabs break.`,
      fixes: [{ id: "fewer", label: `Fewer pieces (${MIN_PIECE + 3} mm or more)`, safe: true, apply: (q) => piecesFor(q, info, MIN_PIECE + 3) }],
    });
  }

  const neck = neckOf(info.tab) * size;
  if (info.tab.style !== "straight" && info.tab.style !== "wavy" && neck < Math.max(MIN_NECK, p.T)) {
    const want = Math.min(30, Math.ceil((Math.max(MIN_NECK, p.T) / size / (neckOf({ ...info.tab, t: 1 }))) * 200) + 1);
    issues.push({
      code: "THIN_NECK", level: "warn",
      message: `Tab necks are about ${neck.toFixed(1)} mm wide and may snap; keep them at least ${Math.max(MIN_NECK, p.T)} mm.`,
      fixes: [
        ...(want <= 30 && want > p.tabs.size ? [{ id: "bigger-tabs", label: `Tab size ${want} %`, safe: true, apply: (q: PuzzleParams) => ({ ...q, tabs: { ...q.tabs, size: want } }) }] : []),
        { id: "fewer", label: "Fewer, larger pieces", safe: false, apply: (q: PuzzleParams) => piecesFor(q, info, size * 1.3) },
      ],
    });
  }

  if (info.flattened > 0) {
    issues.push({
      code: "PLAIN_EDGES", level: "info",
      message: `${info.flattened} edge${info.flattened === 1 ? "" : "s"} near the outline ${info.flattened === 1 ? "has" : "have"} no tab, as a tab would not fit.`,
      fixes: [{ id: "seed", label: "Try another layout", safe: false, apply: (q) => ({ ...q, tabs: { ...q.tabs, seed: (q.tabs.seed % 9999) + 1 } }) }],
    });
  }

  if (info.smallest > 0 && info.smallest < 0.3 * info.cw * info.ch) {
    issues.push({
      code: "TINY_PIECE", level: "warn",
      message: `The smallest piece is about ${r0(Math.sqrt(info.smallest))} mm across, much smaller than the rest.`,
      fixes: [{ id: "seed", label: "Try another layout", safe: false, apply: (q) => ({ ...q, tabs: { ...q.tabs, seed: (q.tabs.seed % 9999) + 1 } }) }],
    });
  }

  if (p.frame.kind !== "none" && p.frame.border < 8) {
    issues.push({
      code: "THIN_FRAME", level: "warn",
      message: `A ${p.frame.border} mm frame border is fragile; 10 mm or more holds its shape.`,
      fixes: [{ id: "border", label: "Border 12 mm", safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border: 12 } }) }],
    });
  }

  if (p.engrave.kind === "image" && !p.engrave.image) {
    issues.push({ code: "NO_PICTURE", level: "info", message: "Choose a picture to engrave under Engraving.", fixes: [] });
  }

  if (p.engrave.kind === "text" && info.textWidth > info.outlineW * 0.92) {
    const size = Math.floor(p.engrave.size * ((info.outlineW * 0.85) / info.textWidth));
    issues.push({
      code: "TEXT_WIDE", level: "warn",
      message: "The text is wider than the puzzle.",
      fixes: [{ id: "smaller", label: `Text height ${size} mm`, safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, size } }) }],
    });
  }

  if (info.whimsyMissed > 0) {
    const size = Math.max(25, p.whimsy.size - 15);
    issues.push({
      code: "WHIMSY_NO_ROOM", level: "warn",
      message: `Only ${info.whimsy} of the ${p.whimsy.count} whimsy pieces fit; the other pieces are too small for the figure with ${WHIMSY_WALL} mm of wood round it.`,
      fixes: [
        ...(size < p.whimsy.size ? [{ id: "smaller", label: `Figure size ${size} %`, safe: true, apply: (q: PuzzleParams) => ({ ...q, whimsy: { ...q.whimsy, size } }) }] : []),
        { id: "fewer", label: `${info.whimsy} whimsy piece${info.whimsy === 1 ? "" : "s"}`, safe: true, apply: (q) => ({ ...q, whimsy: { ...q.whimsy, count: info.whimsy } }) },
      ],
    });
  }

  if (p.knobs.on && p.knobs.diameter > 0.55 * size) {
    const diameter = Math.max(6, Math.floor(0.45 * size));
    issues.push({
      code: "KNOB_TOO_BIG", level: "warn",
      message: `${p.knobs.diameter} mm knobs are too big for pieces about ${r0(size)} mm across; they would hang over the cuts.`,
      fixes: [{ id: "smaller-knobs", label: `Knobs ${diameter} mm`, safe: true, apply: (q) => ({ ...q, knobs: { ...q.knobs, diameter } }) }],
    });
  }

  if (p.knobs.on && p.engrave.kind === "numbers") {
    issues.push({
      code: "KNOBS_HIDE_NUMBERS", level: "warn",
      message: "The knobs sit where the piece numbers are engraved and hide them.",
      fixes: [
        { id: "no-numbers", label: "No piece numbers", safe: false, apply: (q) => ({ ...q, engrave: { ...q.engrave, kind: "none" as const } }) },
        { id: "no-knobs", label: "No knobs", safe: false, apply: (q) => ({ ...q, knobs: { ...q.knobs, on: false } }) },
      ],
    });
  }

  if (p.frame.kind !== "none" && p.frame.hang && !info.hangFits) {
    const border = Math.max(15, p.frame.border + 5);
    issues.push({
      code: "HANG_NO_ROOM", level: "warn",
      message: "The frame's top border is too narrow for the hanging holes, so they are left out.",
      fixes: [{ id: "border", label: `Border ${border} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border } }) }],
    });
  }

  if (out.missing?.length) {
    const persian = out.missing.some((c) => /[\u0600-\u06FF]/.test(c));
    const font = persian ? "vazirmatn" : "fredoka";
    issues.push({
      code: "MISSING_GLYPHS", level: "error",
      message: `The font has no ${out.missing.map((c) => `“${c}”`).join(" ")}.`,
      fixes: p.engrave.fontId === font ? [] : [{ id: "font", label: `Use ${persian ? "Vazirmatn" : "Fredoka"}`, safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, fontId: font } }) }],
    });
  }
  return issues;
}
