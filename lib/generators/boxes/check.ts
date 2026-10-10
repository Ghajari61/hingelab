import type { Issue } from "@/lib/issues";
import type { BoxesOutput } from "./build";
import { fingerCount } from "./joints";
import type { BoxesParams } from "./params";

/** Narrowest tray compartment that still takes fingers, mm. */
export const MIN_COMPARTMENT = 20;
/** Closest hooks that still take a bunch of keys each, mm. */
export const MIN_HOOK_SPACING = 30;

const jointed = (p: BoxesParams) => p.design === "box" || p.design === "tray" || p.design === "bird";

export function checkBoxes(p: BoxesParams, out: BoxesOutput): Issue<BoxesParams>[] {
  const issues: Issue<BoxesParams>[] = [];
  const info = out.info;
  if (!info) return issues;
  const T = p.T, f = p.joint.finger;

  if (jointed(p)) {
    if (f < 1.5 * T) {
      const finger = Math.ceil(2 * T);
      issues.push({
        code: "FINGER_SMALL", level: "warn",
        message: `Fingers of ${f} mm in ${T} mm material are fragile; make them at least ${Math.ceil(1.5 * T)} mm.`,
        fixes: [{ id: "finger", label: `Fingers ${finger} mm`, safe: true, apply: (q) => ({ ...q, joint: { ...q.joint, finger } }) }],
      });
    }
    const inner = info.minEdge ?? 0;
    if (inner > 0 && fingerCount(inner, f) < 3) {
      const finger = Math.max(Math.ceil(1.5 * T), Math.floor(inner / 3));
      issues.push({
        code: "FEW_FINGERS", level: "warn",
        message: `The ${Math.round(inner)} mm edge gets fewer than three fingers, so the joint is weak.`,
        fixes: finger < f && fingerCount(inner, finger) >= 3 ? [{ id: "finger", label: `Fingers ${finger} mm`, safe: true, apply: (q) => ({ ...q, joint: { ...q.joint, finger } }) }] : [],
      });
    }
  }

  if (p.design === "tray" && info.compartment !== undefined && info.compartment < MIN_COMPARTMENT) {
    const t = p.tray;
    const X = (p.joint.outside ? t.width - 2 * T : t.width), Y = (p.joint.outside ? t.depth - 2 * T : t.depth);
    const cols = Math.max(1, Math.floor((X + T) / (MIN_COMPARTMENT + T))), rows = Math.max(1, Math.floor((Y + T) / (MIN_COMPARTMENT + T)));
    issues.push({
      code: "SMALL_COMPARTMENTS", level: "warn",
      message: `Compartments are only ${info.compartment.toFixed(0)} mm across; fingers need ${MIN_COMPARTMENT} mm or more.`,
      fixes: [{ id: "fewer", label: `${Math.min(cols, Math.round(t.cols))} × ${Math.min(rows, Math.round(t.rows))} compartments`, safe: true, apply: (q) => ({ ...q, tray: { ...q.tray, cols: Math.min(cols, Math.round(q.tray.cols)), rows: Math.min(rows, Math.round(q.tray.rows)) } }) }],
    });
  }

  if ((p.design === "sign" || p.design === "keys") && info.textWidth && info.textRoom && info.textWidth > info.textRoom) {
    const key = p.design;
    const cur = p[key].size, size = Math.max(4, Math.floor((cur * info.textRoom) / info.textWidth));
    const width = Math.ceil(p[key].width + info.textWidth - info.textRoom);
    issues.push({
      code: "TEXT_WIDE", level: "warn",
      message: `The text is ${info.textWidth.toFixed(0)} mm wide and runs off the ${key === "sign" ? "sign" : "board"}.`,
      fixes: [
        { id: "smaller", label: `Text ${size} mm`, safe: true, apply: (q) => ({ ...q, [key]: { ...q[key], size } }) },
        { id: "wider", label: `${key === "sign" ? "Sign" : "Board"} ${width} mm wide`, safe: false, apply: (q) => ({ ...q, [key]: { ...q[key], width } }) },
      ],
    });
  }

  if (p.design === "frame") {
    const fr = p.frame;
    if (fr.overlap < 2) {
      issues.push({ code: "FRAME_OVERLAP", level: "warn", message: "With less than 2 mm of overlap the photo can slip out through the window.", fixes: [{ id: "overlap", label: "Overlap 4 mm", safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, overlap: Math.max(4, Math.min(q.frame.border - 6, 4)) } }) }] });
    }
    if (fr.border < fr.overlap + 6) {
      const border = Math.ceil(fr.overlap + 10);
      issues.push({ code: "FRAME_BORDER", level: "warn", message: "The border is too narrow to hold the photo layer together.", fixes: [{ id: "border", label: `Border ${border} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border } }) }] });
    }
  }

  if (p.design === "stand" && p.stand.slot < 9) {
    issues.push({ code: "PHONE_SLOT", level: "warn", message: `A ${p.stand.slot} mm slot only takes a bare phone; most phones in a case need 11–14 mm.`, fixes: [{ id: "slot", label: "Slot 14 mm", safe: true, apply: (q) => ({ ...q, stand: { ...q.stand, slot: 14 } }) }] });
  }

  if (p.design === "keys" && info.spacing !== undefined && info.spacing < MIN_HOOK_SPACING) {
    const hooks = Math.max(1, Math.floor(p.keys.width / (MIN_HOOK_SPACING + 5)));
    issues.push({ code: "HOOK_SPACING", level: "warn", message: `Hooks ${info.spacing.toFixed(0)} mm apart leave no room for a bunch of keys.`, fixes: [{ id: "fewer", label: `${hooks} hooks`, safe: true, apply: (q) => ({ ...q, keys: { ...q.keys, hooks } }) }] });
  }

  if (p.design === "bird") {
    const room = info.size[0] - 2 * T - 20;
    if (p.bird.hole > room) {
      const hole = Math.max(20, Math.floor(room));
      issues.push({ code: "BIRD_HOLE", level: "warn", message: `A ${p.bird.hole} mm entrance is too wide for the front panel.`, fixes: [{ id: "hole", label: `Entrance ${hole} mm`, safe: true, apply: (q) => ({ ...q, bird: { ...q.bird, hole } }) }] });
    }
  }

  if (out.missing?.length) {
    const persian = out.missing.some((c) => /[\u0600-\u06FF]/.test(c));
    const font = persian ? "vazirmatn" : "fredoka";
    const key = p.design === "keys" ? "keys" : "sign";
    issues.push({
      code: "MISSING_GLYPHS", level: "error",
      message: `The font has no ${out.missing.map((c) => `“${c}”`).join(" ")}.`,
      fixes: p[key].fontId === font ? [] : [{ id: "font", label: `Use ${persian ? "Vazirmatn" : "Fredoka"}`, safe: true, apply: (q) => ({ ...q, [key]: { ...q[key], fontId: font } }) }],
    });
  }
  return issues;
}
