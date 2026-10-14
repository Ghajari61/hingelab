/** Hinge Box checks: the model's own messages, with fixes where a setting change solves them. */
import { autoFit, barWidth, computeModel, cutWidth, r3, withFittedLattice, type Model, type Params } from "@/lib/hinge";
import { arrangeHinge } from "@/lib/fit/hinge";
import { cleanFit } from "@/lib/fit/fitToSheets";
import type { Fix, Issue } from "./index";

type HIssue = Issue<Params>;

const up = (v: number, step = 0.5) => Math.ceil(v / step - 1e-9) * step;

/** The hinge lattice from Auto-fit (spacing, bridge and, unless serpentine, slit length; honeycomb: spacing and cell). */
function fitted(p: Params, m: Model): Params {
  return withFittedLattice(p, autoFit(p, m.hBody, m.rN).q);
}

const fitsBed = (p: Params, a = arrangeHinge(p)) => {
  if ("error" in a.result) return false;
  if (a.fit) return a.fit.fits;
  return !!a.lay && a.lay.width <= p.bedW + 1e-6 && a.lay.height <= p.bedH + 1e-6;
};

const down = (v: number, step = 0.5) => Math.floor(v / step + 1e-9) * step;

const RADIUS_TOO_BIG = /^Corner radius is larger than half the width or depth/;
const SIZE_NAMES = { W: "width", D: "depth" } as const;

/** Outside sizes of a rounded box that are under twice its corner radius. */
function underTwiceRadius(p: Params): ("W" | "D")[] {
  if (p.shape !== "rect") return [];
  return (["W", "D"] as const).filter((k) => p[k] < 2 * p.R - 1e-9);
}

/** Largest corner radius the box's width and depth take, if the material allows it (else null). */
function radiusThatFits(p: Params): number | null {
  const r = down(Math.min(p.W, p.D) / 2);
  return r >= p.T + 1 ? r : null;
}

/**
 * The model's error in terms of what to change. "Corner radius is larger than half the width or
 * depth" names the size that is too small for the radius and the values that would work.
 */
export function explainHingeError(p: Params, error: string): string {
  const small = RADIUS_TOO_BIG.test(error) ? underTwiceRadius(p) : [];
  if (!small.length) return error;
  const what = small.map((k) => `${SIZE_NAMES[k]} (${r3(p[k])} mm)`).join(" and ");
  const r = radiusThatFits(p);
  const many = small.length > 1;
  return `The ${what} ${many ? "are" : "is"} less than twice the ${r3(p.R)} mm corner radius. `
    + `Make ${many ? "them" : "it"} at least ${r3(2 * p.R)} mm${r != null ? `, or lower the radius to ${r} mm or less` : ""}.`;
}

/** Model messages that a coded issue below already covers. */
const COVERED = [/^Corner radius is too small for a lid lip/, /^Torsion bars are under/, /^No flat side is long enough/, /^The hinge is far more flexible/];

export function hingeIssues(p: Params): HIssue[] {
  const out: HIssue[] = [];
  // With Fit on, the box that gets cut is the scaled one, so that is the one to check.
  const arranged = arrangeHinge(p);
  const res = arranged.result;
  if ("error" in res) {
    const fixes: Fix<Params>[] = [];
    if (/Slit spacing is too tight/.test(res.error)) fixes.push({ id: "pitch", label: `Spacing ${r3(up(cutWidth(p) + 1, 0.05))} mm`, safe: true, apply: (q) => ({ ...q, pitch: r3(up(cutWidth(q) + 1, 0.05)) }) });
    if (/Honeycomb walls are too thin/.test(res.error)) fixes.push({ id: "cell", label: `Cell width ${r3(Math.max(p.K + 0.6, 2 * p.pitch - 1))} mm`, safe: true, apply: (q) => ({ ...q, slotW: r3(Math.max(q.K + 0.6, 2 * q.pitch - 1)) }) });
    if (/Corner radius must be at least/.test(res.error)) fixes.push({ id: "radius", label: `Radius ${up(p.T + 1)} mm`, safe: true, apply: (q) => ({ ...q, R: up(q.T + 1) }) });
    const small = RADIUS_TOO_BIG.test(res.error) ? underTwiceRadius(p) : [];
    if (small.length) {
      const r = radiusThatFits(p);
      if (r != null) fixes.push({ id: "radius-fit", label: `Set radius to ${r} mm`, safe: false, apply: (q) => ({ ...q, R: radiusThatFits(q) ?? q.R }) });
      fixes.push({
        id: "size-fit", label: `Set ${small.map((k) => SIZE_NAMES[k]).join(" and ")} to ${r3(2 * p.R)} mm`, safe: false,
        apply: (q) => ({ ...q, ...Object.fromEntries(small.map((k) => [k, Math.max(q[k], 2 * q.R)])) }),
      });
    }
    out.push({ code: "BUILD", level: "error", message: explainHingeError(arranged.params, res.error), fixes });
    return out;
  }
  const m = res;
  const a = m.analysis;

  if (a.verdict !== "ok") {
    const auto = autoFit(p, m.hBody, m.rN);
    const fixes: Fix<Params>[] = [];
    if (auto.ok) fixes.push({ id: "autofit", label: "Auto-fit the hinge", safe: true, apply: (q) => fitted(q, m) });
    const serp: Params = { ...p, pattern: "serpentine" };
    const sm = p.pattern !== "serpentine" ? computeModel(serp) : null;
    if (sm && !("error" in sm) && sm.analysis.verdict === "ok") fixes.push({ id: "serpentine", label: "Use Serpentine", safe: false, apply: (q) => ({ ...q, pattern: "serpentine" }) });
    if (!auto.ok && (p.shape === "rect" || p.shape === "poly")) {
      // A rounder corner needs less bend: the radius the hinge reaches with the usual 30% margin.
      const R = up(a.rMin * 1.3 + p.T / 2);
      const rm = computeModel({ ...p, R });
      if (!("error" in rm) && rm.analysis.verdict === "ok") fixes.push({ id: "radius-bend", label: `Radius ${R} mm`, safe: false, apply: (q) => ({ ...q, R }) });
    }
    out.push({
      code: "BEND",
      level: a.verdict === "err" ? "error" : "warn",
      message: a.verdict === "err"
        ? `Likely to crack: the corners need R ${r3(m.rN)} mm but this hinge reaches about R ${r3(a.rMin)} mm.`
        : `Tight bend: the corners need R ${r3(m.rN)} mm, close to the hinge limit of about R ${r3(a.rMin)} mm.`,
      fixes,
    });
  }

  if (a.ratio > 3) {
    out.push({
      code: "FLEXIBLE", level: "info",
      message: "The hinge is far more flexible than these corners need, so the wall is weaker than it could be.",
      fixes: [{ id: "autofit", label: "Make it stiffer (Auto-fit)", safe: false, apply: (q) => fitted(q, m) }],
    });
  }

  if (barWidth(p) < 0.9) {
    out.push({
      code: "WEAK_BARS", level: "warn",
      message: "Torsion bars are under 0.9 mm wide and may char or snap.",
      fixes: [{ id: "autofit", label: "Auto-fit the hinge", safe: true, apply: (q) => fitted(q, m) }],
    });
  }

  if (p.lid === "removable" && (p.shape === "rect" || p.shape === "poly") && !m.parts.some((pt) => pt.kind === "plate" && pt.name === "LID LIP")) {
    const R = up(p.T + p.lidGap + 1);
    out.push({
      code: "NO_LIP", level: "warn",
      message: "The corner radius is too small for a lid lip, so the lip was left out.",
      fixes: [{ id: "radius", label: `Radius ${R} mm`, safe: true, apply: (q) => ({ ...q, R: Math.max(q.R, R) }) }],
    });
  }

  if (m.core.edges.every((e) => e.tabs.length === 0)) {
    const tab = [0.7, 0.5, 0.35].map((f) => Math.max(4, r3(p.tabW * f))).find((w) => {
      const r = computeModel({ ...p, tabW: w });
      return !("error" in r) && r.core.edges.some((e) => e.tabs.length > 0);
    });
    out.push({
      code: "NO_TABS", level: "warn",
      message: "No flat side is long enough for a tab, so the wall must be glued in place.",
      fixes: tab ? [{ id: "tabs", label: `Tabs ${tab} mm wide`, safe: true, apply: (q) => ({ ...q, tabW: tab }) }] : [],
    });
  }

  if (!fitsBed(p, arranged)) {
    const fit = cleanFit(p.fit);
    const auto = { mode: "auto" as const, sheets: fit.sheets };
    const sheets = (n: number) => ({ mode: "sheets" as const, sheets: n });
    const candidates: Fix<Params>[] = [
      { id: "turn", label: "Turn the sheet", safe: true, apply: (q: Params) => ({ ...q, bedW: q.bedH, bedH: q.bedW }) },
      { id: "split", label: "Wall in two halves", safe: true, apply: (q: Params) => ({ ...q, split: 2 }) },
      { id: "auto", label: "Use as many sheets as needed", safe: true, apply: (q: Params) => ({ ...q, fit: auto }) },
      { id: "split-auto", label: "Two halves on as many sheets as needed", safe: true, apply: (q: Params) => ({ ...q, split: 2, fit: auto }) },
      ...[1, 2, 3, 4].flatMap((n): Fix<Params>[] => [
        { id: `fit${n}`, label: `Fit to ${n} sheet${n > 1 ? "s" : ""}`, safe: true, apply: (q) => ({ ...q, fit: sheets(n) }) },
        { id: `split-fit${n}`, label: `Two halves, fitted to ${n} sheet${n > 1 ? "s" : ""}`, safe: true, apply: (q) => ({ ...q, split: 2, fit: sheets(n) }) },
      ]),
    ].filter((f) => !(f.id === "turn" && p.bedW === p.bedH) && !(f.id.startsWith("split") && p.split !== 1)
      && !(f.id === `fit${fit.sheets}` && fit.mode === "sheets") && !(f.id === "auto" && fit.mode === "auto"));
    // Tried in order (least change first); each try is a full fit, so stop after two that work.
    const fixes: Fix<Params>[] = [];
    for (const f of candidates) {
      if (fixes.length >= 2) break;
      if (fitsBed(f.apply(p))) fixes.push(f);
    }
    out.push({ code: "TOO_BIG", level: "warn", message: `The parts do not fit the ${fit.mode === "off" ? "bed" : "sheets"} (${p.bedW} × ${p.bedH} mm).`, fixes });
  } else {
    const fit = cleanFit(p.fit);
    const a2 = fit.mode === "auto" ? arranged.fit : null;
    if (a2 && a2.sheets > 1) {
      out.push({
        code: "TOO_MANY_SHEETS", level: "info",
        message: `At full size the parts need ${a2.sheets} sheets.`,
        fixes: [{ id: "fit1", label: "Shrink to fit 1 sheet", safe: false, apply: (q) => ({ ...q, fit: { mode: "sheets", sheets: 1 } }) }],
      });
    }
  }

  for (const i of m.issues) {
    if (COVERED.some((re) => re.test(i.msg))) continue;
    out.push({ code: "NOTE", level: i.lvl, message: i.msg, fixes: [] });
  }
  return out;
}
