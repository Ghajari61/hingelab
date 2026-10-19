/**
 * Board presets: weight (GSM) to caliper, as typical for folding boxboard. The thickness drives
 * fold compensation: scores sit on the board's mid-plane, so a panel between two folds measures
 * the inside size plus one thickness, and the outside of the box is the inside plus two.
 */
export interface Paper { id: string; name: string; gsm: number; thickness: number }

export const PAPERS: Paper[] = [
  { id: "200", name: "200 gsm card", gsm: 200, thickness: 0.25 },
  { id: "250", name: "250 gsm card", gsm: 250, thickness: 0.32 },
  { id: "300", name: "300 gsm card", gsm: 300, thickness: 0.4 },
  { id: "350", name: "350 gsm card", gsm: 350, thickness: 0.45 },
  { id: "400", name: "400 gsm card", gsm: 400, thickness: 0.52 },
  { id: "kraft300", name: "300 gsm kraft", gsm: 300, thickness: 0.45 },
  { id: "chip1", name: "1 mm chipboard", gsm: 650, thickness: 1 },
  { id: "eflute", name: "Corrugated E-flute", gsm: 450, thickness: 1.6 },
  { id: "bflute", name: "Corrugated B-flute", gsm: 600, thickness: 3 },
];

export const paperById = (id: string) => PAPERS.find((p) => p.id === id);

/**
 * Panel sizes between scores for a box whose inside (or outside) is L × W × H: the inside plus one
 * thickness. Returns the inside and outside sizes too.
 */
export function panelSizes(L: number, W: number, H: number, dims: "inner" | "outer", t: number) {
  const inner: [number, number, number] = dims === "inner" ? [L, W, H] : [L - 2 * t, W - 2 * t, H - 2 * t];
  const outer: [number, number, number] = [inner[0] + 2 * t, inner[1] + 2 * t, inner[2] + 2 * t];
  return { l: inner[0] + t, w: inner[1] + t, h: inner[2] + t, inner, outer };
}
