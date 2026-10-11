import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { TablenumOutput } from "./build";
import { MAX_TABLES, type TablenumParams } from "./params";

/** A stand taller than this many times its base depth tips over easily. */
export const MAX_TIP = 3.2;

export function checkTablenum(p: TablenumParams, out: TablenumOutput): Issue<TablenumParams>[] {
  const issues: Issue<TablenumParams>[] = [];
  issues.push(...missingGlyphs<TablenumParams>(out.missing, p.text.fontId, (q, f) => ({ ...q, text: { ...q.text, fontId: f, labelFont: f } })));
  const info = out.info;
  if (!info) return issues;

  if (info.asked > MAX_TABLES) {
    issues.push({
      code: "BATCH_CAPPED", level: "warn",
      message: `Only the first ${MAX_TABLES} of ${info.asked} tables are made; split the batch into two projects.`,
      fixes: p.batch.mode === "range" ? [{ id: "cap", label: `Tables ${p.batch.from} to ${p.batch.from + MAX_TABLES - 1}`, safe: true, apply: (q) => ({ ...q, batch: { ...q.batch, to: q.batch.from + MAX_TABLES - 1 } }) }] : [],
    });
  }
  if (p.batch.mode === "range" && info.names > 0 && info.names < info.tables) {
    issues.push({ code: "FEW_NAMES", level: "info", message: `${info.names} names for ${info.tables} tables; the rest have no second line.`, fixes: [] });
  }
  if (info.contentW > info.roomW + 0.5 || info.contentH > info.roomH + 0.5) {
    const k = Math.min(info.roomW / Math.max(1, info.contentW), info.roomH / Math.max(1, info.contentH));
    issues.push({
      code: "TEXT_WIDE", level: "warn",
      message: "The number and label run into the plate's edge.",
      fixes: [
        { id: "auto", label: "Size the plate to the text", safe: true, apply: (q) => ({ ...q, plate: { ...q.plate, auto: true } }) },
        { id: "smaller", label: `Number ${Math.max(8, Math.floor(p.text.size * k))} mm`, safe: true, apply: (q) => ({ ...q, text: { ...q.text, size: Math.max(8, Math.floor(q.text.size * k)), labelSize: Math.max(4, Math.floor(q.text.labelSize * k)) } }) },
      ],
    });
  }
  if (p.build.kind === "stand" && info.tip > MAX_TIP) {
    const depth = Math.ceil(info.H / MAX_TIP / 5) * 5;
    issues.push({
      code: "TIPPY", level: "warn",
      message: "The plate is tall for its base and may tip over when the table is bumped.",
      fixes: [{ id: "deeper", label: `Base ${depth} mm deep`, safe: true, apply: (q) => ({ ...q, base: { ...q.base, depth } }) }],
    });
  }
  if (p.build.kind === "tent" && p.material.startsWith("acr")) {
    issues.push({
      code: "TENT_ACRYLIC", level: "error",
      message: "Acrylic snaps instead of bending; tent cards need plywood, MDF or card.",
      fixes: [
        { id: "birch", label: "Birch plywood 3 mm", safe: false, apply: (q) => ({ ...q, material: "birch3", T: 3, K: 0.15 }) },
        { id: "stand", label: "Stand on a base", safe: false, apply: (q) => ({ ...q, build: { ...q.build, kind: "stand" } }) },
      ],
    });
  }
  if (p.build.kind === "tent" && !["rect", "rounded"].includes(p.plate.shape)) {
    issues.push({ code: "TENT_SHAPE", level: "info", message: "Tent cards fold along a straight edge, so they use a rounded rectangle.", fixes: [] });
  }
  if (p.build.kind === "tent" && p.hinge.band < 2.5 * p.T + 8) {
    const band = Math.ceil(2.5 * p.T + 10);
    issues.push({ code: "SHORT_HINGE", level: "warn", message: "The hinge band is short for this material and may crack when folded.", fixes: [{ id: "band", label: `Band ${band} mm`, safe: true, apply: (q) => ({ ...q, hinge: { ...q.hinge, band } }) }] });
  }
  if (p.build.kind === "stand" && p.base.layers > 1 && p.base.step * (p.base.layers - 1) * 2 > p.base.depth - (p.build.double ? 2 : 1) * p.T - 16) {
    issues.push({ code: "STEP_WIDE", level: "warn", message: "The base steps in so far that the top layer is too narrow for the slot.", fixes: [{ id: "step", label: "Step 3 mm", safe: true, apply: (q) => ({ ...q, base: { ...q.base, step: 3 } }) }] });
  }
  return issues;
}
