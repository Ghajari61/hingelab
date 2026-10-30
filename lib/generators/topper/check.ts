import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { TopperOutput } from "./build";
import type { TopperParams } from "./params";

/** Narrowest stick that survives being pushed into a cake, mm. */
export const MIN_STICK = 5;
/** Wider than this overhangs most cakes, mm. */
export const CAKE_WIDTH = 260;
/** Narrowest hoop ring or shaker wall that does not snap, mm. */
export const MIN_BAND = { hoop: 3, shaker: 4 } as const;

export function checkTopper(p: TopperParams, out: TopperOutput): Issue<TopperParams>[] {
  const issues: Issue<TopperParams>[] = [];
  const info = out.info;
  issues.push(...missingGlyphs<TopperParams>(out.missing, p.text.fontId, (q, f) => ({ ...q, text: { ...q.text, fontId: f }, cupcake: { ...q.cupcake, fontId: f } })));
  if (!info) return issues;

  if (p.kit.kind !== "cupcake" && p.sticks.count > 0 && p.sticks.width < MIN_STICK) {
    issues.push({
      code: "THIN_STICK", level: "warn",
      message: `${p.sticks.width} mm sticks snap easily; ${MIN_STICK + 2} mm or more holds a topper upright.`,
      fixes: [{ id: "wider", label: `Sticks ${MIN_STICK + 2} mm wide`, safe: true, apply: (q) => ({ ...q, sticks: { ...q.sticks, width: MIN_STICK + 2 } }) }],
    });
  }
  if (p.kit.kind !== "cupcake" && p.sticks.count === 0) {
    issues.push({ code: "NO_STICKS", level: "info", message: "The topper has no sticks; add them, or glue it to a stand or wooden skewers.", fixes: [{ id: "two", label: "Two sticks", safe: true, apply: (q) => ({ ...q, sticks: { ...q.sticks, count: 2 } }) }] });
  }
  if (info.width > CAKE_WIDTH) {
    const k = (CAKE_WIDTH - 20) / info.width;
    issues.push({
      code: "WIDE_TOPPER", level: "info",
      message: `The topper is ${Math.round(info.width)} mm wide, more than most cakes.`,
      fixes: [{ id: "smaller", label: `Text height ${Math.floor(p.text.size * k)} mm`, safe: true, apply: (q) => ({ ...q, text: { ...q.text, size: Math.floor(q.text.size * k) }, motif: { ...q.motif, size: Math.floor(q.motif.size * k) } }) }],
    });
  }
  if ((p.style.kind === "letters" || p.style.kind === "layered") && !p.style.noWeld && p.style.operation !== "score" && p.style.weld < 0.5) {
    issues.push({
      code: "THIN_WELD", level: "info",
      message: "Thin letters break where they join; a weld of 0.8 mm or more makes the joins stronger.",
      fixes: [{ id: "weld", label: "Weld 1 mm", safe: true, apply: (q) => ({ ...q, style: { ...q.style, weld: 1 } }) }],
    });
  }
  if (p.kit.kind !== "topper" && info.cupText > info.cupRoom && info.cupRoom > 0) {
    const size = Math.max(4, Math.floor(p.cupcake.textSize * (info.cupRoom / info.cupText) * 10) / 10);
    issues.push({
      code: "PICK_TEXT_WIDE", level: "warn",
      message: "A name is wider than its cupcake pick.",
      fixes: [{ id: "smaller", label: `Name height ${size} mm`, safe: true, apply: (q) => ({ ...q, cupcake: { ...q.cupcake, textSize: size } }) }],
    });
  }
  if ((p.style.kind === "plate" || p.style.kind === "shaker") && p.kit.kind !== "cupcake" && !p.plate.auto && (info.contentW > p.plate.width - 8 || info.contentH > p.plate.height - 8)) {
    issues.push({
      code: "PLATE_SMALL", level: "warn",
      message: "The text and motif run past the plate.",
      fixes: [{ id: "auto", label: "Size the plate to the text", safe: true, apply: (q) => ({ ...q, plate: { ...q.plate, auto: true } }) }],
    });
  }
  if (p.kit.kind !== "cupcake" && (p.style.kind === "hoop" || p.style.kind === "shaker") && info.band > 0 && info.band < MIN_BAND[p.style.kind]) {
    const band = MIN_BAND[p.style.kind] + 1;
    issues.push({
      code: "FRAME_THIN", level: "warn",
      message: `A ${info.band} mm ${p.style.kind === "hoop" ? "ring" : "spacer wall"} snaps easily; ${band} mm or more holds.`,
      fixes: [{ id: "band", label: `Frame ${band} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, band } }) }],
    });
  }
  if (p.kit.kind !== "cupcake" && p.style.kind === "shaker" && p.mat.mat2 !== "acrylic-clear") {
    issues.push({
      code: "SHAKER_WINDOW", level: "info",
      message: "The shaker's window is cut from the second material; clear acrylic shows the sprinkles behind the words.",
      fixes: [{ id: "clear", label: "Clear acrylic window", safe: true, apply: (q) => ({ ...q, mat: { ...q.mat, mat2: "acrylic-clear", T2: 3 } }) }],
    });
  }
  if (p.material === "acr3" && p.style.mark === "score" && p.style.kind !== "letters") {
    issues.push({ code: "SCORE_ACRYLIC", level: "info", message: "Scored lines on acrylic are faint; engrave the back of clear acrylic for a frosted look.", fixes: [{ id: "engrave", label: "Engrave the text", safe: true, apply: (q) => ({ ...q, style: { ...q.style, mark: "engrave" } }) }] });
  }
  return issues;
}
