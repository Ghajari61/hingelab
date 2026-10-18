/**
 * Standard box sizes: what goes inside (a tissue pack, a deck of cards, a ring), as inside sizes in
 * millimetres. Picking one sets the outside size for the user's material thickness and lid, so the
 * contents fit whatever sheet they cut; material, hinge pattern and sheet stay as they are.
 */
import type { Params } from "./types";

export type StandardGroup = "Tissue boxes" | "Playing cards" | "Jewellery & gold" | "Gifts & home" | "Office & desk" | "Kitchen & tea";

export interface StandardSize {
  id: string;
  group: StandardGroup;
  name: string;
  shape: Params["shape"];
  /** Inside width, depth and height, mm; for a cylinder `w` is the inside diameter. */
  w: number;
  d: number;
  h: number;
  lid: Params["lid"];
  lidHole?: Params["lidHole"];
  /** Outside corner radius (rounded rectangles and polygons); missing: sized to the box. */
  R?: number;
  sides?: number;
  divX?: number;
  divY?: number;
}

const S = (group: StandardGroup, id: string, name: string, w: number, d: number, h: number, more: Partial<StandardSize> = {}): StandardSize =>
  ({ id, group, name, shape: "rect", w, d, h, lid: "removable", ...more });

export const STANDARD_SIZES: StandardSize[] = [
  S("Tissue boxes", "tissue-regular", "Regular tissue box", 230, 115, 70, { lidHole: "tissue" }),
  S("Tissue boxes", "tissue-family", "Family tissue box", 255, 125, 95, { lidHole: "tissue" }),
  S("Tissue boxes", "tissue-cube", "Cube tissue box", 112, 112, 125, { lidHole: "tissue" }),
  S("Tissue boxes", "tissue-slim", "Slim or car tissue box", 200, 80, 50, { lidHole: "tissue" }),
  S("Tissue boxes", "tissue-pocket", "Pocket tissue holder", 110, 60, 32, { lidHole: "tissue" }),
  S("Tissue boxes", "napkin-box", "Napkin box", 170, 170, 60, { lidHole: "finger" }),

  S("Playing cards", "cards-poker-1", "Poker deck", 92, 67, 20, { lidHole: "finger" }),
  S("Playing cards", "cards-poker-2", "Two poker decks", 92, 67, 38, { lidHole: "finger" }),
  S("Playing cards", "cards-poker-2s", "Two poker decks side by side", 140, 92, 20, { lidHole: "finger", divX: 1 }),
  S("Playing cards", "cards-bridge-1", "Bridge deck", 92, 61, 20, { lidHole: "finger" }),
  S("Playing cards", "cards-bridge-2", "Two bridge decks", 92, 61, 38, { lidHole: "finger" }),
  S("Playing cards", "cards-tarot", "Tarot deck", 124, 74, 30, { lidHole: "finger" }),
  S("Playing cards", "cards-sleeved", "Sleeved 100-card deck", 96, 71, 68, { lidHole: "finger" }),
  S("Playing cards", "cards-uno", "UNO deck (112 cards)", 90, 60, 36, { lidHole: "finger" }),
  S("Playing cards", "cards-mini", "Mini cards (44 × 67 mm)", 70, 48, 20, { lidHole: "finger" }),
  S("Playing cards", "chips-poker", "Poker chips (4 rows)", 180, 175, 42, { divX: 3 }),

  S("Jewellery & gold", "ring-single", "Ring box", 55, 55, 35, { shape: "cyl" }),
  S("Jewellery & gold", "ring-pair", "Wedding rings box", 80, 50, 35, { lidHole: "knob" }),
  S("Jewellery & gold", "earrings", "Earring box", 60, 60, 28, { lidHole: "knob" }),
  S("Jewellery & gold", "pendant", "Pendant box", 85, 85, 30, { lidHole: "knob" }),
  S("Jewellery & gold", "necklace", "Necklace box", 170, 120, 30, { lidHole: "knob" }),
  S("Jewellery & gold", "bangle", "Bangle box", 90, 90, 45, { shape: "cyl" }),
  S("Jewellery & gold", "watch-1", "Watch box", 110, 70, 60, { shape: "pill" }),
  S("Jewellery & gold", "watch-3", "Watch box for three", 240, 110, 80, { divX: 2 }),
  S("Jewellery & gold", "jewel-12", "Jewellery organiser (12)", 190, 120, 45, { lidHole: "knob", divX: 3, divY: 2 }),
  S("Jewellery & gold", "jewel-hex", "Hexagon jewellery box", 110, 110, 50, { shape: "poly", sides: 6, R: 12, lidHole: "knob" }),
  S("Jewellery & gold", "gold-coin", "Gold coin box", 50, 50, 18, { R: 10 }),
  S("Jewellery & gold", "gold-bar", "Gold bar box (1 oz)", 60, 40, 18, { R: 8 }),
  S("Jewellery & gold", "gold-set", "Gold set box", 200, 150, 40, { lidHole: "knob", divX: 1 }),

  S("Gifts & home", "gift-s", "Small gift box", 100, 100, 60),
  S("Gifts & home", "gift-m", "Medium gift box", 150, 150, 80),
  S("Gifts & home", "gift-l", "Large gift box", 200, 150, 100),
  S("Gifts & home", "wine", "Wine bottle box", 85, 85, 330, { shape: "cyl" }),
  S("Gifts & home", "candle", "Candle jar box", 90, 90, 100, { shape: "cyl" }),
  S("Gifts & home", "cupcake", "Cupcake box", 100, 100, 90),
  S("Gifts & home", "money", "Money box", 100, 100, 110, { shape: "cyl", lid: "fixed", lidHole: "coin" }),
  S("Gifts & home", "keepsake", "Baby keepsake box", 200, 150, 80, { divX: 1 }),

  S("Office & desk", "business-cards", "Business card box", 92, 58, 45, { lidHole: "finger" }),
  S("Office & desk", "pencils", "Pencil box", 200, 60, 30, { lidHole: "finger" }),
  S("Office & desk", "pen-cup", "Pen cup", 80, 80, 100, { shape: "cyl", lid: "open" }),
  S("Office & desk", "desk-organiser", "Desk organiser", 220, 110, 60, { lid: "open", divX: 2 }),
  S("Office & desk", "remote", "Remote control holder", 140, 70, 100, { lid: "open", divX: 1 }),

  S("Kitchen & tea", "tea-4", "Tea bag box (4)", 155, 150, 80, { lidHole: "finger", divX: 1, divY: 1 }),
  S("Kitchen & tea", "tea-6", "Tea chest (6)", 220, 150, 80, { lidHole: "finger", divX: 2, divY: 1 }),
  S("Kitchen & tea", "spice-9", "Spice box (9)", 210, 210, 60, { divX: 2, divY: 2 }),
  S("Kitchen & tea", "coffee-pods", "Coffee capsule box (15)", 200, 120, 40, { divX: 4, divY: 2 }),
  S("Kitchen & tea", "sugar", "Sugar cube box", 110, 80, 50, { lidHole: "knob" }),
  S("Kitchen & tea", "cutlery", "Cutlery tray", 300, 110, 60, { lid: "open", divX: 2 }),
];

export const STANDARD_GROUPS: StandardGroup[] = ["Tissue boxes", "Playing cards", "Jewellery & gold", "Gifts & home", "Office & desk", "Kitchen & tea"];

/** "230 × 115 × 70 mm inside" (or "Ø 55 × 35 mm inside"). */
export const insideText = (s: StandardSize) => `${s.shape === "cyl" ? `Ø ${s.w}` : `${s.w} × ${s.d}`} × ${s.h} mm inside`;

/** `p` with the standard size's outside dimensions for its material and lid; everything else stays. */
export function applyStandardSize(p: Params, s: StandardSize): Params {
  const t = p.T;
  const lipped = s.lid === "removable" && p.lidLip !== false;
  const q: Params = { ...p, name: s.name, shape: s.shape, lid: s.lid, H: s.h + t + (s.lid === "open" ? 0 : t) + (lipped ? t : 0) };
  delete q.lidHoleD; delete q.lidHoleW;
  if (s.lidHole && s.lid !== "open") q.lidHole = s.lidHole; else delete q.lidHole;
  if (s.divX) q.divX = s.divX; else delete q.divX;
  if (s.divY) q.divY = s.divY; else delete q.divY;
  delete q.divH;
  if (s.shape === "cyl") { q.dia = s.w + 2 * t; return q; }
  q.W = s.w + 2 * t;
  q.D = s.shape === "poly" ? q.W : s.d + 2 * t;
  if (s.shape === "poly") q.sides = s.sides ?? 6;
  if (s.shape !== "pill") {
    const short = Math.min(q.W, q.D);
    q.R = s.R ?? Math.round(Math.min(short / 2 - 1, Math.max(t + 4, short * 0.16)));
  }
  return q;
}

/** The standard size the box is at now, or "" when it is a size of its own. */
export function standardSizeOf(p: Params): string {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.05;
  for (const s of STANDARD_SIZES) {
    if (s.shape !== p.shape || s.lid !== p.lid) continue;
    const q = applyStandardSize(p, s);
    if (!near(q.H, p.H)) continue;
    if (s.shape === "cyl" ? near(q.dia, p.dia) : near(q.W, p.W) && near(q.D, p.D)) return s.id;
  }
  return "";
}
