import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { TrophyOutput } from "./build";
import type { TrophyParams } from "./params";

/** A figure taller than this many times the base's depth tips over. */
export const MAX_TIP = 3.5;

export function checkTrophy(p: TrophyParams, out: TrophyOutput): Issue<TrophyParams>[] {
  const issues: Issue<TrophyParams>[] = [];
  issues.push(...missingGlyphs<TrophyParams>(out.missing, p.plate.fontId, (q, f) => ({ ...q, emblem: { ...q.emblem, fontId: f }, plate: { ...q.plate, fontId: f, titleFont: f } })));
  const info = out.info;
  if (!info) return issues;

  if (info.badPath) {
    issues.push({ code: "BAD_PATH", level: "error", message: "The custom outline could not be read; paste the d attribute of one closed SVG path.", fixes: [{ id: "star", label: "Use a star", safe: false, apply: (q) => ({ ...q, emblem: { ...q.emblem, kind: "star" } }) }] });
  }
  if (info.foot + 10 > info.top) {
    const width = Math.ceil(info.foot + 20 + 2 * (p.base.tiers - 1) * p.base.step);
    issues.push({
      code: "BASE_NARROW", level: "error",
      message: "The base's top tier is too narrow for the figure's tabs.",
      fixes: [{ id: "wider", label: `Base ${width} mm wide`, safe: true, apply: (q) => ({ ...q, base: { ...q.base, width } }) }],
    });
  }
  if (p.base.depth - 2 * (p.base.tiers - 1) * p.base.step < info.Tf + 14) {
    issues.push({ code: "BASE_SHALLOW", level: "error", message: "The top tier is too shallow to hold the slot.", fixes: [{ id: "step", label: "Smaller steps", safe: true, apply: (q) => ({ ...q, base: { ...q.base, step: 3, depth: Math.max(q.base.depth, 50) } }) }] });
  }
  if (info.tip > MAX_TIP) {
    const depth = Math.ceil(info.FH / MAX_TIP / 5) * 5;
    issues.push({ code: "TIPPY", level: "warn", message: "The figure is tall for its base and may tip over.", fixes: [{ id: "deeper", label: `Base ${depth} mm deep`, safe: true, apply: (q) => ({ ...q, base: { ...q.base, depth } }) }] });
  }
  if (info.textW > info.room * 2 + 0.5) {
    const size = Math.max(5, Math.floor(p.emblem.size * ((info.room * 2) / info.textW)));
    issues.push({ code: "EMBLEM_TEXT_WIDE", level: "warn", message: "The emblem's text runs past the emblem.", fixes: [{ id: "smaller", label: `Text height ${size} mm`, safe: true, apply: (q) => ({ ...q, emblem: { ...q.emblem, size } }) }] });
  }
  if (p.plate.on && info.lineW + 2 * p.plate.pad > p.plate.width + 0.5) {
    issues.push({
      code: "PLATE_GREW", level: "info",
      message: `The name plate grew to ${Math.ceil(info.lineW + 2 * p.plate.pad)} mm to fit its longest line.`,
      fixes: [{ id: "smaller", label: "Smaller plate text", safe: true, apply: (q) => ({ ...q, plate: { ...q.plate, nameSize: Math.max(4, Math.floor(q.plate.nameSize * 0.8)), titleSize: Math.max(4, Math.floor(q.plate.titleSize * 0.8)) } }) }],
    });
  }
  if (p.base.fit < 0 || p.base.fit > 0.6) {
    issues.push({ code: "SLOT_FIT", level: "warn", message: "A slot clearance outside 0 to 0.6 mm makes the figure jam or wobble.", fixes: [{ id: "fit", label: "Clearance 0.1 mm", safe: true, apply: (q) => ({ ...q, base: { ...q.base, fit: 0.1 } }) }] });
  }
  return issues;
}
