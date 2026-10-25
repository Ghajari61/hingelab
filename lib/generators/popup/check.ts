import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { PopupOutput } from "./build";
import type { PopupParams } from "./params";

/** Rings narrower than this many thicknesses are fragile and their tabs crowd. */
export const MIN_RING_T = 1.5;
/** A scroll-saw ring wedges on the next only while it drops less than this share of the thickness. */
export const MAX_SAW_DROP = 0.6;

const r1 = (v: number) => Math.round(v * 10) / 10;

export function checkPopup(p: PopupParams, out: PopupOutput): Issue<PopupParams>[] {
  const issues: Issue<PopupParams>[] = [];
  issues.push(...missingGlyphs<PopupParams>(out.missing, p.engrave.fontId, (q, f) => ({ ...q, engrave: { ...q.engrave, fontId: f } })));
  const info = out.info;
  if (!info) return issues;
  const T = p.T;

  // Rings too narrow for the material.
  // A scroll-saw board is thick and its rings wedge edge to edge; laser-cut rings carry tabs.
  const want = p.support.kind === "saw" ? Math.max(6, 0.5 * T) : Math.max(4, MIN_RING_T * T);
  if (info.minBand < want) {
    const fewer = Math.max(2, Math.floor(p.cut.rings * (info.minBand / want)));
    const fixes: Issue<PopupParams>["fixes"] = [];
    if (fewer < p.cut.rings) fixes.push({ id: "fewer", label: `${fewer} rings`, safe: true, apply: (q) => ({ ...q, cut: { ...q.cut, rings: fewer } }) });
    if (p.cut.edge !== "plain") fixes.push({ id: "plain", label: "Plain edges", safe: false, apply: (q) => ({ ...q, cut: { ...q.cut, edge: "plain" } }) });
    if (p.cut.even) fixes.push({ id: "even", label: "Even ring widths", safe: true, apply: (q) => ({ ...q, cut: { ...q.cut, even: false } }) });
    issues.push({
      code: "RINGS_NARROW", level: info.minBand < T ? "error" : "warn",
      message: `The narrowest ring is ${r1(info.minBand)} mm; rings under ${r1(want)} mm in ${T} mm material break easily and leave no room for the arms' tabs.`,
      fixes,
    });
  }

  // Bridges.
  if (p.support.kind !== "saw" && p.support.hold) {
    if (p.support.holdW < 0.3) issues.push({ code: "BRIDGE_THIN", level: "warn", message: "Bridges under 0.3 mm often burn through, and the rings fall out of the sheet while cutting.", fixes: [{ id: "w", label: "Bridges 0.5 mm", safe: true, apply: (q) => ({ ...q, support: { ...q.support, holdW: 0.5 } }) }] });
    else if (p.support.holdW > 1.5) issues.push({ code: "BRIDGE_THICK", level: "info", message: `${r1(p.support.holdW)} mm bridges are hard to snap cleanly; 0.4 to 1 mm is usual.`, fixes: [{ id: "w", label: "Bridges 0.6 mm", safe: true, apply: (q) => ({ ...q, support: { ...q.support, holdW: 0.6 } }) }] });
  }

  // Scroll saw: the drop per ring must stay well inside the board's thickness.
  if (p.support.kind === "saw") {
    if (info.meanDrop > MAX_SAW_DROP * T) {
      const depth = Math.max(5, Math.floor(MAX_SAW_DROP * T * p.cut.rings * 0.9));
      issues.push({
        code: "SAW_DROP", level: "error",
        message: `Each ring drops ${r1(info.meanDrop)} mm, more than ${Math.round(MAX_SAW_DROP * 100)}% of the ${T} mm board: the rings will slip through instead of wedging. Use a thicker board, more rings or less depth.`,
        fixes: [
          { id: "depth", label: `Depth ${depth} mm`, safe: false, apply: (q) => ({ ...q, form: { ...q.form, depth } }) },
          { id: "thick", label: "19 mm board", safe: false, apply: (q) => ({ ...q, T: 19 }) },
        ],
      });
    }
    if (info.tilt > 15) issues.push({ code: "SAW_STEEP", level: "warn", message: `A ${r1(info.tilt)}° saw tilt is steep for a scroll saw; deepen the form or use a thinner blade.`, fixes: [{ id: "deeper", label: `Depth ${Math.round(p.form.depth * 1.5)} mm`, safe: false, apply: (q) => ({ ...q, form: { ...q.form, depth: Math.round(q.form.depth * 1.5) } }) }] });
    if (p.T < 9) issues.push({ code: "SAW_THIN", level: "info", message: "The angled-cut method suits boards 12 mm and thicker; laser-cut sheets are held better by slotted arms.", fixes: [{ id: "ribs", label: "Slotted arms", safe: false, apply: (q) => ({ ...q, support: { ...q.support, kind: "ribs" } }) }] });
  }

  // Cords: rings hang flat only when held in at least three places.
  if (p.support.kind === "cords" && p.mode !== "hanging") {
    issues.push({ code: "CORDS_STAND", level: "info", message: "Cords hold a form that hangs; a bowl or tower on the table needs slotted arms.", fixes: [{ id: "ribs", label: "Slotted arms", safe: false, apply: (q) => ({ ...q, support: { ...q.support, kind: "ribs" } }) }] });
  }
  if (p.cut.petals && p.support.kind !== "ribs") {
    issues.push({ code: "PETALS_LOOSE", level: "warn", message: "Petals are held only by the arms' tabs; without arms they fall apart.", fixes: [{ id: "ribs", label: "Slotted arms", safe: false, apply: (q) => ({ ...q, support: { ...q.support, kind: "ribs" } }) }, { id: "whole", label: "Whole rings", safe: true, apply: (q) => ({ ...q, cut: { ...q.cut, petals: false } }) }] });
  }
  if (p.support.kind === "ribs" && info.noTab > 0) {
    issues.push({ code: "NO_TABS", level: "info", message: `${info.noTab} of the arms' steps are too short for a tab; those rings just rest on their step.`, fixes: info.minBand < 8 ? [{ id: "fewer", label: `${Math.max(2, p.cut.rings - 2)} rings`, safe: true, apply: (q) => ({ ...q, cut: { ...q.cut, rings: Math.max(2, q.cut.rings - 2) } }) }] : [] });
  }
  if (p.support.handles && (p.mode === "tower" || p.mode === "hanging" || p.mode === "tiered" || p.form.invert)) {
    issues.push({ code: "HANDLES_UP", level: "info", message: "Handles stand above the rim of a bowl; this form's rim is at the bottom, so they are left off.", fixes: [{ id: "off", label: "No handles", safe: true, apply: (q) => ({ ...q, support: { ...q.support, handles: false } }) }] });
  }

  // Holes that do not fit.
  const bad = [...new Set(info.bad)];
  if (bad.length) {
    const need = p.extras.lamp !== "none" ? (p.extras.lamp === "custom" ? p.extras.lampD : p.extras.lamp === "e14" ? 29 : 41) : p.extras.tealight ? 40 : 0;
    const centre = Math.ceil(Math.max(p.cut.centre, need + 14));
    issues.push({
      code: "HOLE_ROOM", level: "error",
      message: `${bad.join(", ")} ${bad.length > 1 ? "do" : "does"} not fit where ${bad.length > 1 ? "they go" : "it goes"}.`,
      fixes: [
        ...(need && centre > p.cut.centre ? [{ id: "centre", label: `Centre ${centre} mm`, safe: false, apply: (q: PopupParams) => ({ ...q, cut: { ...q.cut, centre } }) }] : []),
        ...(bad.includes("Finial slot") ? [{ id: "nofin", label: "No finial", safe: true, apply: (q: PopupParams) => ({ ...q, extras: { ...q.extras, finial: "none" as const } }) }] : []),
        ...(bad.includes("Cord hole") ? [{ id: "cord", label: "2 mm cord holes", safe: true, apply: (q: PopupParams) => ({ ...q, support: { ...q.support, cordHole: 2 } }) }] : []),
      ],
    });
  }

  if (p.extras.lamp !== "none") {
    issues.push({ code: "LED_ONLY", level: "warn", message: "Use an LED bulb of 7 W or less in a wooden shade, and keep the bulb clear of the rings.", fixes: [] });
  }

  if (p.mode === "sleeve" && p.extras.object + p.extras.clear > Math.min(p.shape.size, p.shape.kind === "ellipse" || p.shape.kind === "rounded" ? p.shape.height : p.shape.size) * 0.7) {
    const size = Math.ceil((p.extras.object + p.extras.clear) / 0.55);
    issues.push({ code: "SLEEVE_ROOM", level: "error", message: "The object's hole leaves too little room for rings.", fixes: [{ id: "bigger", label: `Sheet ${size} mm`, safe: false, apply: (q) => ({ ...q, shape: { ...q.shape, size, height: Math.max(q.shape.height, size) } }) }] });
  }

  if (info.folded) {
    issues.push({ code: "OUTLINE_FOLDED", level: "warn", message: "Some of the outline cannot be seen from its centre, so the rings follow a simplified outline there. Choose round rings or a simpler outline.", fixes: [{ id: "round", label: "Round rings", safe: false, apply: (q) => ({ ...q, cut: { ...q.cut, style: "round" } }) }] });
  }

  // Engraving.
  if (info.textW > 0 && info.textW > info.textRoom) {
    const k = info.textRoom > 0 ? info.textRoom / info.textW : 0;
    issues.push({
      code: "TEXT_ROOM", level: "warn",
      message: info.textRoom > 0 ? "The centre's text and motif are larger than the centre and run onto the rings." : "A sleeve has no centre to engrave; use the rim text instead.",
      fixes: info.textRoom > 0 ? [
        { id: "smaller", label: "Fit the centre", safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, size: Math.max(4, Math.floor(q.engrave.size * k)), motifSize: Math.max(8, Math.floor(q.engrave.motifSize * k)) } }) },
        { id: "centre", label: `Centre ${Math.ceil(info.textW + 12)} mm`, safe: false, apply: (q) => ({ ...q, cut: { ...q.cut, centre: Math.ceil(info.textW + 12) } }) },
      ] : [{ id: "clear", label: "No centre text", safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, text: "", motif: "none" } }) }],
    });
  }
  if (info.rimSpan > 2.6) {
    const size = Math.max(3, Math.floor(p.engrave.rimSize * (2.4 / info.rimSpan) * 10) / 10);
    issues.push({ code: "RIM_LONG", level: "warn", message: "The rim text runs more than halfway round the rim.", fixes: [{ id: "smaller", label: `Rim text ${size} mm`, safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, rimSize: size } }) }] });
  }
  if ((p.engrave.text.trim() && p.engrave.size < 4) || (p.engrave.rim.trim() && p.engrave.rimSize < 3)) {
    issues.push({ code: "TEXT_SMALL", level: "info", message: "Engraved letters under 4 mm tall lose their detail in wood.", fixes: [{ id: "bigger", label: "Larger letters", safe: true, apply: (q) => ({ ...q, engrave: { ...q.engrave, size: Math.max(4, q.engrave.size), rimSize: Math.max(4, q.engrave.rimSize) } }) }] });
  }
  return issues;
}
