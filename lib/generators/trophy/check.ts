import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { TrophyOutput } from "./build";
import type { TrophyParams } from "./params";
import { LED_WALL, ledPocket } from "../sign/led";

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
  const onBase = p.display.kind === "base";
  if (onBase && info.foot + 10 > info.top) {
    const width = Math.ceil(info.foot + 20 + 2 * (p.base.tiers - 1) * p.base.step);
    issues.push({
      code: "BASE_NARROW", level: "error",
      message: "The base's top tier is too narrow for the figure's tabs.",
      fixes: [{ id: "wider", label: `Base ${width} mm wide`, safe: true, apply: (q) => ({ ...q, base: { ...q.base, width } }) }],
    });
  }
  if (onBase && p.base.depth - 2 * (p.base.tiers - 1) * p.base.step < info.Tf + 14) {
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
  if (onBase && (p.base.fit < 0 || p.base.fit > 0.6)) {
    issues.push({ code: "SLOT_FIT", level: "warn", message: "A slot clearance outside 0 to 0.6 mm makes the figure jam or wobble.", fixes: [{ id: "fit", label: "Clearance 0.1 mm", safe: true, apply: (q) => ({ ...q, base: { ...q.base, fit: 0.1 } }) }] });
  }
  if (onBase && p.base.led) {
    if (info.ledWall > 0 && info.ledWall < LED_WALL) {
      const depth = Math.ceil(ledPocket(info.Tf + p.base.fit) + 2 * LED_WALL + 2);
      issues.push({
        code: "LED_BASE_SHALLOW", level: "warn",
        message: `The base leaves only ${info.ledWall.toFixed(1)} mm of wall round the LED pocket; it may crack or let light leak out.`,
        fixes: [{ id: "deeper", label: `Base ${depth} mm deep`, safe: true, apply: (q) => ({ ...q, base: { ...q.base, depth } }) }],
      });
    }
    const clear = p.build.kind === "mixed" ? p.mat.mat2 === "acrylic-clear" : p.material.startsWith("acr");
    if (!clear) {
      issues.push({
        code: "LED_FIGURE", level: "info",
        message: "LEDs light the edge of clear acrylic only; cut the figure from clear acrylic for it to glow.",
        fixes: [{ id: "acrylic", label: "Clear acrylic figure", safe: false, apply: (q) => ({ ...q, build: { kind: "mixed" as const }, mat: { ...q.mat, mat2: "acrylic-clear", T2: 3 } }) }],
      });
    }
  }
  if (p.display.kind === "plaque") {
    if (info.plaqueOut > 0) {
      issues.push({
        code: "PLAQUE_SMALL", level: "warn",
        message: "The figure reaches past the plaque's edge.",
        fixes: [
          { id: "margin", label: `Margin ${Math.round(p.display.margin + 15)} mm`, safe: true, apply: (q) => ({ ...q, display: { ...q.display, margin: Math.round(q.display.margin + 15) } }) },
          { id: "rounded", label: "Rounded plaque", safe: false, apply: (q) => ({ ...q, display: { ...q.display, shape: "rounded" as const } }) },
        ],
      });
    }
    if (info.holesOnFigure > 0) {
      issues.push({
        code: "PLAQUE_HOLES", level: "warn",
        message: "A hanging hole runs into the figure or off the plaque; give the plaque a wider margin.",
        fixes: [{ id: "margin", label: `Margin ${Math.round(p.display.margin + 10)} mm`, safe: true, apply: (q) => ({ ...q, display: { ...q.display, margin: Math.round(q.display.margin + 10) } }) }],
      });
    }
  }
  if (p.display.kind === "medal" && info.loopW > info.FW + 0.5) {
    issues.push({
      code: "RIBBON_WIDE", level: "warn",
      message: `The ribbon loop (${Math.round(info.loopW)} mm) is wider than the medal.`,
      fixes: [{ id: "ribbon", label: "Ribbon 15 mm", safe: true, apply: (q) => ({ ...q, display: { ...q.display, ribbon: 15 } }) }],
    });
  }
  return issues;
}
