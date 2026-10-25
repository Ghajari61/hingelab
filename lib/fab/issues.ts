/** Geometry checks (validate.ts) as issues in each product's checks list. */
import type { GenBase } from "@/lib/generators/types";
import type { Issue, IssueLevel } from "@/lib/issues";
import { repairNote, repairTotal, type RepairCount } from "./repair";
import type { FabIssue, Severity } from "./validate";

const LEVEL: Record<Severity, IssueLevel> = { blocking: "error", warning: "warn", note: "info" };
/** What the clean-up removes (exact repeats only: partly overlapping lines stay reported). */
const TIDY = new Set(["SHORT_SEGMENTS", "ZERO_AREA", "DUPLICATE_CUT"]);

export function fabIssues<P>(list: FabIssue[]): Issue<P>[] {
  return list.map((f) => ({ code: `FAB_${f.code}`, level: LEVEL[f.severity], message: f.message, fixes: [], partIds: f.partIds, ...(f.at ? { at: f.at } : {}) }));
}

const withRepair = <P extends GenBase>(q: P, on: boolean): P => {
  const sheet = { ...(q.sheet ?? {}) } as NonNullable<GenBase["sheet"]>;
  if (on) sheet.repair = true; else delete sheet.repair;
  return { ...q, sheet };
};

/**
 * Generators also offer the clean-up as a fix (a setting, so it goes through undo), and say what it
 * removed while it is on, with a way to turn it off.
 */
export function genFabIssues<P extends GenBase>(list: FabIssue[], p: P, repaired?: RepairCount): Issue<P>[] {
  const on = p.sheet?.repair === true;
  const out = fabIssues<P>(list).map((i) => (!on && TIDY.has(i.code.slice(4))
    ? { ...i, fixes: [{ id: "repair", label: "Clean up the cut paths", safe: true, apply: (q: P) => withRepair(q, true) }] }
    : i));
  if (on && repaired && repairTotal(repaired)) {
    out.push({ code: "FAB_REPAIRED", level: "info", message: `${repairNote(repaired)} The design itself is unchanged.`, fixes: [{ id: "no-repair", label: "Keep the paths as built", safe: false, apply: (q: P) => withRepair(q, false) }] });
  }
  return out;
}
