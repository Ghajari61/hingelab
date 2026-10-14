import type { GeneratorDef, GenMeasured, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildTestcard, comb, gauge, thicknessCard } from "./build";
import { checkTestcard } from "./check";
import { MAX_TEETH, TESTCARD_DEFAULTS, kerfValues, mergeTestcard, slotWidths, type TestcardParams } from "./params";
import { TESTCARD_PRESETS } from "./presets";

const kerfCard = (p: TestcardParams) => p.card.kind === "kerf";

const sections: SectionSpec<TestcardParams>[] = [
  {
    id: "card", title: "Test card", open: true,
    help: "A kerf comb that finds the kerf for snug joints, or a card of slots that measures the sheet's real thickness.",
    fields: [
      {
        kind: "choice", key: "card.kind", label: "Card", rail: true,
        options: [{ v: "kerf", text: "Kerf comb", title: "Teeth and slots cut with different kerf values" }, { v: "thickness", text: "Thickness", title: "Slots of different widths" }],
        help: "Kerf comb finds the kerf that makes a snug fit; Thickness measures the sheet.",
      },
      {
        kind: "choice", key: "card.axis", label: "Measure", show: kerfCard,
        options: [{ v: "x", text: "X" }, { v: "y", text: "Y" }, { v: "both", text: "X and Y" }],
        help: "X tests cuts that run up and down the bed, Y those that run across; X and Y cuts both, for machines that cut wider one way.",
      },
      { kind: "number", key: "card.count", label: "Teeth", unit: "", min: 3, max: MAX_TEETH, step: 1, int: true, show: kerfCard, help: "How many tooth and slot pairs, each with its own kerf." },
      { kind: "number", key: "card.from", label: "First kerf", unit: "mm", min: 0, max: 1, step: 0.01, show: kerfCard, help: "The kerf of pair 1." },
      { kind: "number", key: "card.step", label: "Kerf step", unit: "mm", min: 0.01, max: 0.25, step: 0.01, show: kerfCard, help: "How much more kerf each next pair has." },
      { kind: "number", key: "card.tooth", label: "Tooth width", unit: "mm", min: 5, max: 30, step: 0.5, show: kerfCard, help: "The width of each tooth before kerf; about the size of the tabs you cut." },
      { kind: "number", key: "card.slots", label: "Slots", unit: "", min: 3, max: MAX_TEETH, step: 1, int: true, show: (p) => !kerfCard(p), help: "How many slots, centred on the material thickness." },
      { kind: "number", key: "card.tStep", label: "Slot step", unit: "mm", min: 0.02, max: 0.5, step: 0.01, show: (p) => !kerfCard(p), help: "How much wider each next slot is." },
    ],
  },
  {
    id: "pick", title: "Your result", open: true,
    help: "After cutting the card, enter the number of the best pair or slot, then keep it with Save to my material.",
    fields: [
      { kind: "number", key: "pick.x", label: "Best pair X", unit: "", min: 0, max: MAX_TEETH, step: 1, int: true, show: (p) => kerfCard(p) && p.card.axis !== "y", help: "The X pair that pushes together by hand and holds; 0 until you have tried the card." },
      { kind: "number", key: "pick.y", label: "Best pair Y", unit: "", min: 0, max: MAX_TEETH, step: 1, int: true, show: (p) => kerfCard(p) && p.card.axis !== "x", help: "The Y pair that pushes together by hand and holds; 0 until you have tried the card." },
      { kind: "number", key: "pick.t", label: "Best slot", unit: "", min: 0, max: MAX_TEETH, step: 1, int: true, show: (p) => !kerfCard(p), help: "The narrowest slot an offcut of the sheet slides into; 0 until you have tried the card." },
    ],
  },
];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key !== "card.kind") return [];
  const p = mergeTestcard({ card: { count: 5, tooth: 8, slots: 7, tStep: 0.4 } });
  if (v === "thickness") return fitArt([thicknessCard(p).outer], 50).map((d) => ({ d, fill: true }));
  const c = comb(p, "X"), g = gauge(p, "X");
  const gy = c.h + 6;
  return fitArt([c.outer, g.outer.map(([x, y]) => [x, y + gy] as [number, number])], 40).map((d) => ({ d, fill: true }));
}

/** What the picked pair or slot measured. */
export function testcardMeasured(p: TestcardParams): GenMeasured | null {
  if (p.card.kind === "thickness") {
    const T = slotWidths(p)[p.pick.t - 1];
    return T != null && T > 0 ? { T, note: `Slot ${p.pick.t}: the sheet is ${T} mm thick.` } : null;
  }
  const ks = kerfValues(p), out: GenMeasured = { note: "" }, said: string[] = [];
  const kx = p.card.axis !== "y" ? ks[p.pick.x - 1] : undefined;
  const ky = p.card.axis !== "x" ? ks[p.pick.y - 1] : undefined;
  if (kx != null) { out.kx = kx; said.push(`kerf X ${kx} mm (pair ${p.pick.x})`); }
  if (ky != null) { out.ky = ky; said.push(`kerf Y ${ky} mm (pair ${p.pick.y})`); }
  if (!said.length) return null;
  out.note = `Best fit: ${said.join(", ")}.`;
  return out;
}

export const TESTCARD: GeneratorDef<TestcardParams> = {
  id: "testcard",
  name: "Test Cards",
  version: 1,
  defaults: () => mergeTestcard({}),
  merge: mergeTestcard,
  sections,
  presets: TESTCARD_PRESETS,
  build: buildTestcard,
  check: (p) => checkTestcard(p),
  art,
  measured: testcardMeasured,
  fileName: (p) => namedFile("test-card", p.name, p.card.kind === "kerf" ? `kerf-${p.card.axis}` : `${String(p.T).replace(".", "-")}mm`),
  summary: (p) => p.card.kind === "kerf"
    ? `Kerf comb ${p.card.axis === "both" ? "X and Y" : p.card.axis.toUpperCase()} · ${p.card.count} pairs · ${kerfValues(p)[0]} to ${kerfValues(p)[p.card.count - 1]} mm`
    : `Thickness card · ${p.card.slots} slots · ${slotWidths(p)[0]} to ${slotWidths(p)[p.card.slots - 1]} mm`,
  help: {
    intro: [
      "Test Cards measure your material and machine so joints fit first time. The kerf comb pairs teeth and slots cut with different kerf values, each engraved on its tooth; the pair that pushes together snugly is the kerf to use. Combs can test X, Y or both, for machines that cut wider in one direction.",
      "The thickness card has open slots from thinner to thicker than the sheet's nominal thickness; the narrowest slot an offcut slides into is its real thickness. Enter the best pair or slot under Your result and save it to your own material, so every design uses it.",
    ],
    tips: [
      "Cut the card from the same sheet, with the same settings, as the project: kerf changes with power, speed, focus and material.",
      "Leave the parts where they were laid out: X and Y are what they measure, so they are never turned on the sheet.",
      "If the best pair is the first or last, cut another card centred on it.",
      "Measure thickness in several places on a big sheet; plywood varies.",
    ],
    keywords: ["kerf test", "kerf comb", "fit test", "press fit", "thickness gauge", "calibration", "material test", "slot test"],
  },
};

export { TESTCARD_DEFAULTS };
