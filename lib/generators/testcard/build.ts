/**
 * Test cards. The kerf comb's teeth and the gauge's slots are each compensated with their own kerf
 * (engraved on the tooth), so pair n fits as a joint would with that kerf: the snug pair is the
 * kerf to use. The thickness card's slots step through widths around the nominal thickness, cut
 * with the material's own kerf, so the narrowest slot a scrap of the sheet slides into is its real
 * thickness. Parts keep their orientation (X and Y are what they measure).
 */
import { strokeText } from "@/lib/parametric/label";
import type { Contour, GenOutput, GenPart, Pt } from "../types";
import { kerfValues, slotWidths, type TestcardParams } from "./params";

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const fmt = (v: number) => String(r3(v));

/** Turns a part a quarter turn (counter-clockwise on screen) so its X widths run along Y. */
function quarter(c: Contour, w: number): Contour {
  return c.map(([x, y]) => [y, w - x] as Pt);
}

interface Drawn { outer: Contour; score: Contour[]; w: number; h: number }

/** Comb along X: teeth `tooth` wide plus their kerf, numbered on the back, kerf written along each tooth. */
export function comb(p: TestcardParams, axis: "X" | "Y"): Drawn {
  const ks = kerfValues(p), W = p.card.tooth, G = Math.max(4, r3(W * 0.6)), M = 9;
  const Hb = 10, Lt = Math.max(16, r3(W * 1.6)), n = ks.length;
  const w = M + n * W + (n + 1) * G;
  const pts: Pt[] = [[0, 0], [w, 0], [w, Hb]];
  for (let i = n - 1; i >= 0; i--) {
    const x0 = M + G + i * (W + G), e = ks[i] / 2;
    pts.push([x0 + W + e, Hb], [x0 + W + e, Hb + Lt], [x0 - e, Hb + Lt], [x0 - e, Hb]);
  }
  pts.push([0, Hb]);
  const score: Contour[] = [...strokeText(axis, 5, M / 2 + 0.5, Hb / 2)];
  const th = Math.min(2.5, W * 0.35);
  ks.forEach((k, i) => {
    const cx = M + G + i * (W + G) + W / 2;
    score.push(...strokeText(String(i + 1), 3.5, cx, Hb / 2), ...strokeText(fmt(k), th, cx, Hb + Lt / 2 + 1, 90));
  });
  return { outer: pts, score, w, h: Hb + Lt };
}

/** Gauge along X: open slots matching the comb's teeth, each narrowed by its own kerf. */
export function gauge(p: TestcardParams, axis: "X" | "Y"): Drawn {
  const ks = kerfValues(p), W = p.card.tooth, G = Math.max(4, r3(W * 0.6)), M = 9;
  const Lt = Math.max(16, r3(W * 1.6)), D = Lt - 4, H = D + 11, n = ks.length;
  const w = M + n * W + (n + 1) * G;
  const pts: Pt[] = [[0, 0]];
  ks.forEach((k, i) => {
    const x0 = M + G + i * (W + G), e = k / 2;
    pts.push([x0 + e, 0], [x0 + e, D], [x0 + W - e, D], [x0 + W - e, 0]);
  });
  pts.push([w, 0], [w, H], [0, H]);
  const score: Contour[] = [...strokeText(axis, 5, M / 2 + 0.5, D / 2)];
  ks.forEach((k, i) => {
    const cx = M + G + i * (W + G) + W / 2;
    score.push(...strokeText(String(i + 1), 3, cx, D + 3.5), ...strokeText(fmt(k), 1.8, cx, D + 7.8));
  });
  return { outer: pts, score, w, h: H };
}

/** Thickness card: open slots from thinner to thicker than the sheet, cut with the material's kerf. */
export function thicknessCard(p: TestcardParams): Drawn {
  const ws = slotWidths(p), G = 5, M = 3, D = 12, H = D + 11;
  const pitch = Math.max(...ws) + G;
  const w = 2 * M + ws.length * pitch + G - pitch + Math.max(...ws);
  const pts: Pt[] = [[0, 0]];
  const cx = (i: number) => M + G / 2 + i * pitch + Math.max(...ws) / 2;
  ws.forEach((sw, i) => {
    const half = (sw - p.K) / 2;
    pts.push([cx(i) - half, 0], [cx(i) - half, D], [cx(i) + half, D], [cx(i) + half, 0]);
  });
  pts.push([w, 0], [w, H], [0, H]);
  const score: Contour[] = [];
  ws.forEach((sw, i) => score.push(...strokeText(String(i + 1), 3, cx(i), D + 3.5), ...strokeText(fmt(sw), 1.8, cx(i), D + 7.8)));
  return { outer: pts, score, w, h: H };
}

/** A part lying flat at (x, y) in the assembled view. */
function part(id: string, name: string, d: Drawn, turn: boolean, x = 0, y = 0): GenPart {
  const outer = turn ? quarter(d.outer, d.w) : d.outer;
  const score = turn ? d.score.map((c) => quarter(c, d.w)) : d.score;
  return { id, name, outer, holes: [], score, ownKerf: true, upright: true, place: { x, y, z: 0 } };
}

export function buildTestcard(p: TestcardParams): GenOutput {
  if (p.card.kind === "thickness") {
    const ws = slotWidths(p);
    if (ws[0] - p.K < 0.2) return { parts: [], stats: [], error: "The narrowest slot is too narrow to cut. Use a smaller step or fewer slots." };
    return {
      parts: [part("thickness", "THICKNESS", thicknessCard(p), false)],
      stats: [{ label: "Slots", value: `${fmt(ws[0])} to ${fmt(ws[ws.length - 1])} mm` }, { label: "Kerf used", value: `${fmt(p.K)} mm` }],
      assembly: [
        "Cut the card from the sheet you want to measure.",
        "Slide a straight offcut of the same sheet edge-on into each slot.",
        "The narrowest slot it goes into without forcing is the sheet's real thickness: enter its number under Your result.",
      ],
    };
  }
  const ks = kerfValues(p);
  if (p.card.tooth - ks[ks.length - 1] < 1) return { parts: [], stats: [], error: "The largest kerf leaves the gauge's slots too narrow. Use wider teeth or smaller kerf values." };
  const axes: ("X" | "Y")[] = p.card.axis === "both" ? ["X", "Y"] : [p.card.axis === "y" ? "Y" : "X"];
  const parts: GenPart[] = [];
  let x = 0;
  for (const a of axes) {
    const turn = a === "Y", c = comb(p, a), g = gauge(p, a);
    if (turn) parts.push(part(`comb-${a.toLowerCase()}`, `COMB ${a}`, c, true, x), part(`gauge-${a.toLowerCase()}`, `GAUGE ${a}`, g, true, x + c.h + 6));
    else parts.push(part(`comb-${a.toLowerCase()}`, `COMB ${a}`, c, false, 0), part(`gauge-${a.toLowerCase()}`, `GAUGE ${a}`, g, false, 0, c.h + 6));
    x = Math.max(c.w, g.w) + 8;
  }
  return {
    parts,
    stats: [{ label: "Kerf values", value: `${fmt(ks[0])} to ${fmt(ks[ks.length - 1])} mm` }, { label: "Tooth width", value: `${fmt(p.card.tooth)} mm` }],
    assembly: [
      `Cut the comb and the gauge${axes.length > 1 ? "s" : ""} without moving the sheet between them, and leave the parts as laid out (X and Y are what they measure).`,
      "Push each tooth into the gauge slot with the same number, by hand.",
      "Loose pairs had too little kerf, pairs that will not go in had too much. The pair that goes in snugly and holds is your kerf: enter its number under Your result.",
    ],
  };
}
