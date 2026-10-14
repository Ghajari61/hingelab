import type { Issue } from "@/lib/issues";
import { kerfValues, slotWidths, type TestcardParams } from "./params";

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The comb's first kerf for a range centred on `k`. */
const centredFrom = (p: TestcardParams, k: number) => r3(Math.max(0, k - (p.card.step * (p.card.count - 1)) / 2));

export function checkTestcard(p: TestcardParams): Issue<TestcardParams>[] {
  const issues: Issue<TestcardParams>[] = [];
  if (p.card.kind === "kerf") {
    const ks = kerfValues(p);
    const kerfs = p.card.axis === "y" ? [p.sheet?.kerfXY ? p.sheet.kerfY ?? p.K : p.K] : [p.K];
    if (kerfs.some((k) => k < ks[0] || k > ks[ks.length - 1])) {
      const from = centredFrom(p, kerfs[0]);
      issues.push({
        code: "RANGE_OFF", level: "info",
        message: `The material's kerf (${r3(kerfs[0])} mm) is outside the comb's range, ${ks[0]} to ${ks[ks.length - 1]} mm.`,
        fixes: [{ id: "centre", label: `Start at ${from} mm`, safe: true, apply: (q) => ({ ...q, card: { ...q.card, from } }) }],
      });
    }
    for (const [axis, pick] of [["X", p.pick.x], ["Y", p.pick.y]] as const) {
      if ((axis === "X" && p.card.axis === "y") || (axis === "Y" && p.card.axis === "x")) continue;
      if (pick > ks.length) {
        issues.push({ code: "PICK_RANGE", level: "warn", message: `There is no pair ${pick} on the ${axis} comb.`, fixes: [] });
      } else if (pick === 1 || (pick === ks.length && pick > 0)) {
        const from = centredFrom(p, ks[pick - 1]);
        issues.push({
          code: "PICK_EDGE", level: "info",
          message: `Pair ${pick} is at the end of the ${axis} comb, so the best kerf may lie beyond it. Cut another card around ${ks[pick - 1]} mm to be sure.`,
          fixes: [{ id: "recentre", label: `Range around ${ks[pick - 1]} mm`, safe: false, apply: (q) => ({ ...q, card: { ...q.card, from }, pick: { ...q.pick, x: 0, y: 0 } }) }],
        });
      }
    }
  } else {
    const ws = slotWidths(p);
    if (p.pick.t > ws.length) issues.push({ code: "PICK_RANGE", level: "warn", message: `There is no slot ${p.pick.t} on the card.`, fixes: [] });
    else if (p.pick.t === 1 || (p.pick.t === ws.length && p.pick.t > 0)) {
      issues.push({
        code: "PICK_EDGE", level: "info",
        message: `Slot ${p.pick.t} is at the end of the card, so the sheet may be ${p.pick.t === 1 ? "thinner" : "thicker"} still. Cut another card around ${ws[p.pick.t - 1]} mm to be sure.`,
        fixes: [{ id: "recentre", label: `Card around ${ws[p.pick.t - 1]} mm`, safe: false, apply: (q) => ({ ...q, T: ws[q.pick.t - 1] ?? q.T, material: "custom", pick: { ...q.pick, t: 0 } }) }],
      });
    }
  }
  return issues;
}
