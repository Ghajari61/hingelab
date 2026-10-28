import type { Issue } from "@/lib/issues";
import type { BoxesOutput } from "./build";
import { fingerCount } from "./joints";
import type { BoxesParams } from "./params";
import { patternIssues } from "../pattern";

/** Narrowest tray compartment that still takes fingers, mm. */
export const MIN_COMPARTMENT = 20;
/** Closest hooks that still take a bunch of keys each, mm. */
export const MIN_HOOK_SPACING = 30;

const jointed = (p: BoxesParams) => ["box", "tray", "bird", "drawer", "money", "stack"].includes(p.design);
/** Lowest drawer that still holds something, mm inside. */
export const MIN_DRAWER = 20;

/** Where the engraving goes, in words. */
const artFace = (p: BoxesParams) => (p.design === "money" || p.design === "card" ? "front" : p.design === "coaster" ? "coasters" : "lid");

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

  if (p.design === "insert" && info.compartment !== undefined && info.compartment < MIN_COMPARTMENT) {
    const s = p.insert;
    const cols = Math.max(1, Math.floor((s.width + T) / (MIN_COMPARTMENT + T))), rows = Math.max(1, Math.floor((s.depth + T) / (MIN_COMPARTMENT + T)));
    issues.push({
      code: "SMALL_COMPARTMENTS", level: "warn",
      message: `Compartments are only ${info.compartment.toFixed(0)} mm across; little fits in less than ${MIN_COMPARTMENT} mm.`,
      fixes: [{ id: "fewer", label: `${Math.min(cols, Math.round(s.cols))} × ${Math.min(rows, Math.round(s.rows))} compartments`, safe: true, apply: (q) => ({ ...q, insert: { ...q.insert, cols: Math.min(cols, Math.round(q.insert.cols)), rows: Math.min(rows, Math.round(q.insert.rows)) } }) }],
    });
  }

  const lidArt = p.design !== "sign" && p.design !== "keys";
  if (lidArt && info.textWidth && info.textRoom && info.textWidth > info.textRoom + 0.5) {
    const k = info.textRoom / info.textWidth;
    const size = Math.max(4, Math.floor(p.engrave.size * k)), motifSize = Math.max(8, Math.floor(p.engrave.motifSize * k));
    issues.push({
      code: "LID_ART_WIDE", level: "warn",
      message: `The engraving is ${info.textWidth.toFixed(0)} mm wide and runs off the ${artFace(p)}.`,
      fixes: [{ id: "smaller", label: "Smaller engraving", safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, size: Math.min(q.engrave.size, size), motifSize: Math.min(q.engrave.motifSize, motifSize) } }) }],
    });
  } else if (lidArt && info.artHeight && info.artRoom && info.artHeight > info.artRoom + 0.5) {
    const k = info.artRoom / info.artHeight;
    const size = Math.max(4, Math.floor(p.engrave.size * k)), motifSize = Math.max(8, Math.floor(p.engrave.motifSize * k));
    issues.push({
      code: "LID_ART_TALL", level: "warn",
      message: `The engraving is ${info.artHeight.toFixed(0)} mm tall and does not fit the ${artFace(p)}.`,
      fixes: [{ id: "smaller", label: "Smaller engraving", safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, size: Math.min(q.engrave.size, size), motifSize: Math.min(q.engrave.motifSize, motifSize) } }) }],
    });
  }

  if (p.design === "drawer" && info.drawerH !== undefined && info.drawerH < MIN_DRAWER) {
    const Hi = (p.joint.outside ? p.drawer.height - 2 * T : p.drawer.height);
    const drawers = Math.max(1, Math.min(Math.round(p.drawer.drawers) - 1, Math.floor(Hi / (MIN_DRAWER + T + p.drawer.clearance + 0.5))));
    issues.push({
      code: "DRAWER_LOW", level: "warn",
      message: `Each drawer is only ${info.drawerH.toFixed(0)} mm deep inside.`,
      fixes: [{ id: "fewer", label: `${drawers} drawer${drawers > 1 ? "s" : ""}`, safe: true, apply: (q) => ({ ...q, drawer: { ...q.drawer, drawers } }) }],
    });
  }

  if (p.design === "money" && info.slotRoom !== undefined && p.money.slot > info.slotRoom) {
    const slot = Math.max(15, Math.floor(info.slotRoom));
    issues.push({ code: "COIN_SLOT", level: "warn", message: `A ${p.money.slot} mm coin slot does not fit the top.`, fixes: [{ id: "slot", label: `Slot ${slot} mm`, safe: true, apply: (q) => ({ ...q, money: { ...q.money, slot } }) }] });
  }
  if (p.design === "money" && info.plugRoom !== undefined && p.money.plug > info.plugRoom) {
    const plug = Math.max(20, Math.floor(info.plugRoom));
    issues.push({ code: "PLUG_BIG", level: "warn", message: `A ${p.money.plug} mm plug cuts into the joints of the bottom.`, fixes: [{ id: "plug", label: `Plug ${plug} mm`, safe: true, apply: (q) => ({ ...q, money: { ...q.money, plug } }) }] });
  }

  if (info.pinNeed !== undefined && info.pinRoom !== undefined && info.pinNeed > info.pinRoom) {
    const key = p.design === "tray" ? "tray" : "box";
    const depth = Math.ceil(p[key].depth + info.pinNeed - info.pinRoom);
    issues.push({ code: "PIN_DEPTH", level: "error", message: "The box is too shallow from front to back for a pin hinge.", fixes: [{ id: "deeper", label: `Depth ${depth} mm`, safe: true, apply: (q) => ({ ...q, [key]: { ...q[key], depth } }) }] });
  }

  if (p.design === "hex") {
    const a = (p.joint.outside ? p.hex.width - 2 * T : p.hex.width) / Math.sqrt(3);
    if (a < 25) {
      issues.push({ code: "HEX_SMALL", level: "warn", message: `The walls are only ${a.toFixed(0)} mm wide, too narrow for their tabs.`, fixes: [{ id: "wider", label: "Width 60 mm", safe: true, apply: (q) => ({ ...q, hex: { ...q.hex, width: Math.max(q.hex.width, 60) } }) }] });
    }
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
    const key = p.design === "keys" ? "keys" : p.design === "sign" ? "sign" : "engrave";
    issues.push({
      code: "MISSING_GLYPHS", level: "error",
      message: `The font has no ${out.missing.map((c) => `“${c}”`).join(" ")}.`,
      fixes: p[key].fontId === font ? [] : [{ id: "font", label: `Use ${persian ? "Vazirmatn" : "Fredoka"}`, safe: true, apply: (q) => ({ ...q, [key]: { ...q[key], fontId: font } }) }],
    });
  }
  issues.push(...patternIssues(p, out, "pierce"));
  return issues;
}
