import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { SignOutput } from "./build";
import type { SignParams } from "./params";

/** Inlay letters narrower than this break or will not press in cleanly, mm. */
export const MIN_INLAY = 2.5;

export function checkSign(p: SignParams, out: SignOutput): Issue<SignParams>[] {
  const issues: Issue<SignParams>[] = [];
  issues.push(...missingGlyphs<SignParams>(out.missing, p.text.fontId, (q, f) => ({ ...q, text: { ...q.text, fontId: f } })));
  const info = out.info;
  if (!info) return issues;
  const word = p.style.kind === "word" || p.style.kind === "neon";

  if (!word && (info.contentW > info.roomW + 0.5 || info.contentH > info.roomH + 0.5)) {
    const k = Math.min(info.roomW / Math.max(1, info.contentW), info.roomH / Math.max(1, info.contentH));
    const size = Math.max(5, Math.floor(p.text.size * k));
    issues.push({
      code: "TEXT_WIDE", level: "warn",
      message: "The text and motif run into the board's edge.",
      fixes: [
        { id: "auto", label: "Size the board to the text", safe: true, apply: (q) => ({ ...q, board: { ...q.board, auto: true } }) },
        { id: "smaller", label: `Text height ${size} mm`, safe: true, apply: (q) => ({ ...q, text: { ...q.text, size }, motif: { ...q.motif, size: Math.max(8, Math.floor(q.motif.size * k)) } }) },
      ],
    });
  }
  if (info.outside.length) {
    issues.push({
      code: "MOUNT_OUTSIDE", level: "error",
      message: `${[...new Set(info.outside)][0]}s fall outside the sign's shape.`,
      fixes: [
        { id: "rounded", label: "Rounded board", safe: false, apply: (q) => ({ ...q, board: { ...q.board, shape: "rounded" } }) },
        { id: "keyhole", label: "Keyhole slots", safe: false, apply: (q) => ({ ...q, mount: { ...q.mount, kind: "keyhole" } }) },
      ],
    });
  }
  if (info.onText > 0) {
    issues.push({
      code: "HOLE_ON_TEXT", level: "warn",
      message: "A mounting hole cuts into the text or motif.",
      fixes: [
        { id: "pad", label: `Margin ${Math.round(p.board.pad + 12)} mm`, safe: true, apply: (q) => ({ ...q, board: { ...q.board, auto: true, pad: Math.round(q.board.pad + 12) } }) },
        { id: "none", label: "No holes (adhesive pads)", safe: false, apply: (q) => ({ ...q, mount: { ...q.mount, kind: "none" } }) },
      ],
    });
  }
  if (word && p.mount.kind !== "none" && p.mount.kind !== "stand") {
    issues.push({
      code: "WORD_MOUNT", level: "info",
      message: `A ${p.style.kind === "neon" ? "neon-look sign" : "cut-out word"} has no board to drill; hang it with adhesive pads or stand it on a base.`,
      fixes: [{ id: "stand", label: "Stand on a base", safe: true, apply: (q) => ({ ...q, mount: { ...q.mount, kind: "stand" } }) }],
    });
  }
  if (p.style.kind === "inlay") {
    if (info.thinInlay > 0 && info.thinInlay < MIN_INLAY) {
      issues.push({
        code: "THIN_INLAY", level: "warn",
        message: `Some inlay strokes are only ${info.thinInlay.toFixed(1)} mm wide and may snap; use a bolder font or bigger letters.`,
        fixes: [
          { id: "bigger", label: `Text height ${Math.ceil(p.text.size * 1.4)} mm`, safe: true, apply: (q) => ({ ...q, text: { ...q.text, size: Math.ceil(q.text.size * 1.4) } }) },
          { id: "bold", label: "Lalezar font", safe: false, apply: (q) => ({ ...q, text: { ...q.text, fontId: "lalezar" } }) },
        ],
      });
    }
    if (Math.abs(p.mat.T2 - p.T) > 0.6) {
      issues.push({
        code: "INLAY_THICKNESS", level: "info",
        message: `The inlay material (${p.mat.T2} mm) is not as thick as the board (${p.T} mm), so the letters sit ${p.mat.T2 < p.T ? "below" : "above"} the face.`,
        fixes: [{ id: "match", label: `Inlay ${p.T} mm`, safe: true, apply: (q) => ({ ...q, mat: { ...q.mat, T2: q.T } }) }],
      });
    }
  }
  if ((p.style.kind === "engraved" || p.style.kind === "neon") && !p.style.mirror && p.material.startsWith("acr")) {
    issues.push({
      code: "BACK_ENGRAVE", level: "info",
      message: "Clear acrylic looks best engraved from the back: mirror the engraving and flip the sheet.",
      fixes: [{ id: "mirror", label: "Mirror the engraving", safe: true, apply: (q) => ({ ...q, style: { ...q.style, mirror: true } }) }],
    });
  }
  return issues;
}
