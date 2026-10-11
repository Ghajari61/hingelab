import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { KeyrackOutput } from "./build";
import type { KeyrackParams } from "./params";

/** Keys and bunches need about this much room each, mm. */
export const MIN_SPACING = 28;

export function checkKeyrack(p: KeyrackParams, out: KeyrackOutput): Issue<KeyrackParams>[] {
  const issues: Issue<KeyrackParams>[] = [];
  issues.push(...missingGlyphs<KeyrackParams>(out.missing, p.text.fontId, (q, f) => ({ ...q, text: { ...q.text, fontId: f }, hooks: { ...q.hooks, labelFont: f } })));
  const info = out.info;
  if (!info) return issues;

  if (info.spacing > 0 && info.spacing < MIN_SPACING) {
    const fit = Math.max(1, Math.floor((p.board.width - 2 * p.hooks.margin) / MIN_SPACING) + 1);
    issues.push({
      code: "HOOKS_CROWDED", level: "warn",
      message: `Hooks ${Math.round(info.spacing)} mm apart leave little room for a bunch of keys.`,
      fixes: [{ id: "fewer", label: `${fit} hooks`, safe: true, apply: (q) => ({ ...q, hooks: { ...q.hooks, count: fit } }) }],
    });
  }
  if (info.contentW > info.room) {
    const size = Math.max(5, Math.floor(p.text.size * (info.room / info.contentW)));
    issues.push({
      code: "TEXT_WIDE", level: "warn",
      message: "The text and motif are wider than the board.",
      fixes: [
        { id: "smaller", label: `Text height ${size} mm`, safe: true, apply: (q) => ({ ...q, text: { ...q.text, size }, motif: { ...q.motif, size: Math.max(10, Math.floor(q.motif.size * (info.room / info.contentW))) } }) },
        { id: "wider", label: `Board ${Math.ceil(info.contentW + 30)} mm wide`, safe: false, apply: (q) => ({ ...q, board: { ...q.board, width: Math.ceil(info.contentW + 30) } }) },
      ],
    });
  }
  if (info.outside.length) {
    issues.push({
      code: "OUTSIDE_BOARD", level: "error",
      message: `${[...new Set(info.outside)].join(", ")} ${info.outside.length > 1 ? "fall" : "falls"} outside the board's shape.`,
      fixes: [
        { id: "margin", label: "Hooks further from the edges", safe: false, apply: (q) => ({ ...q, hooks: { ...q.hooks, margin: Math.min(q.board.width / 3, q.hooks.margin + 15) } }) },
        { id: "rect", label: "Rounded board", safe: false, apply: (q) => ({ ...q, board: { ...q.board, shape: "rounded" } }) },
      ],
    });
  }
  if (p.hooks.style === "hook" && p.hooks.reach < 20) {
    issues.push({ code: "SHORT_HOOK", level: "info", message: "Hooks shorter than 20 mm hold only one or two keys.", fixes: [{ id: "reach", label: "Reach 30 mm", safe: true, apply: (q) => ({ ...q, hooks: { ...q.hooks, reach: 30 } }) }] });
  }
  if (p.hooks.style === "hook" && p.T < 3) {
    issues.push({ code: "THIN_HOOKS", level: "warn", message: `Hooks cut from ${p.T} mm material bend under a bunch of keys; use 3 mm or thicker, or pegs.`, fixes: [{ id: "pegs", label: "Use dowel pegs", safe: false, apply: (q) => ({ ...q, hooks: { ...q.hooks, style: "peg", hole: 8 } }) }] });
  }
  if (p.hooks.style === "screw" && p.hooks.hole > 5) {
    issues.push({ code: "BIG_PILOT", level: "info", message: "Screw-in hooks need a 2.5 to 3 mm pilot hole.", fixes: [{ id: "pilot", label: "3 mm pilot holes", safe: true, apply: (q) => ({ ...q, hooks: { ...q.hooks, hole: 3 } }) }] });
  }
  if (p.shelf.on && p.shelf.at + p.text.size > (p.board.height * p.text.y) / 100 + p.text.size / 2 && p.text.mark !== "none" && p.text.text.trim()) {
    issues.push({ code: "SHELF_OVER_TEXT", level: "info", message: "The shelf brackets may cover part of the text; move the text lower or the shelf higher.", fixes: [{ id: "lower", label: "Text lower", safe: true, apply: (q) => ({ ...q, text: { ...q.text, y: Math.min(60, q.text.y + 12) } }) }] });
  }
  return issues;
}
