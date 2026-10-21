import type { GenPreset } from "../types";
import type { PaperBoxParams } from "./params";

type More = Record<string, number | string | boolean>;
/** A preset: style, inside size (mm), board, the style's own settings, and any window or pattern. */
const P = (id: string, name: string, note: string, style: string, L: number, W: number, H: number, paper = "350", more: More = {}, look: Partial<Pick<PaperBoxParams, "window" | "pattern">> = {}): GenPreset<PaperBoxParams> => ({
  id, name, note,
  params: { name, style, paper, T: THICK[paper], styles: { [style]: { L, W, H, dims: "inner", ...more } }, ...look } as Partial<PaperBoxParams>,
});
const THICK: Record<string, number> = { "200": 0.25, "250": 0.32, "300": 0.4, "350": 0.45, "400": 0.52, kraft300: 0.45, chip1: 1, eflute: 1.6, bflute: 3 };
const win = (on: string, shape: string, size: number) => ({ window: { on, shape, size, corner: 6 } }) as Partial<PaperBoxParams>;
const pat = (on: string, pattern: string, cell: number, bar: number, more: Record<string, unknown> = {}) => ({ pattern: { pattern, on, cell, bar, shape: "full", size: 70, mark: "cut", motif: "heart", ...more } }) as unknown as Partial<PaperBoxParams>;

/** Presets whose flat net is larger than the default 600 × 400 mm sheet get a sheet that holds it. */
const SHEETS: Record<string, [number, number]> = {
  "small-mailer": [900, 600], "jewelry-mailer": [900, 600], "book-mailer": [900, 600], "tshirt-mailer": [900, 700], "cosmetics-mailer": [900, 700], "subscription-box": [1300, 900],
  "pizza-box": [1000, 900], "cereal-box": [900, 700], "tissue-box": [900, 500], "rsc-small": [900, 450], "fol-carton": [1000, 650], "open-crate": [1150, 450],
  "counter-display": [600, 520], "chocolate-drawer": [700, 450], "hamper-tray": [600, 450], "cake-gable": [600, 450],
};

const LIST: GenPreset<PaperBoxParams>[] = [
  // Two-piece gift boxes
  P("jewelry-6x6x3", "Jewelry gift box 6×6×3", "Two-piece box, 60 × 60 × 30 mm inside", "two-piece", 60, 60, 30, "chip1", { clearance: 0.5 }),
  P("ring-box", "Ring box", "Small two-piece box, 50 × 50 × 40 mm", "two-piece", 50, 50, 40, "chip1"),
  P("watch-box", "Watch box", "Two-piece box for a watch, 110 × 80 × 70 mm", "two-piece", 110, 80, 70, "chip1"),
  P("cupcake-box", "Cupcake box", "One cupcake, lift-off lid, 100 × 100 × 90 mm", "two-piece", 100, 100, 90, "400", { lidH: 30 }),
  P("cookie-box", "Cookie box", "Flat two-piece box, 150 × 150 × 50 mm", "two-piece", 150, 150, 50, "400"),
  P("chocolate-box", "Chocolate box", "Shallow box for a chocolate tray, 180 × 120 × 30 mm", "two-piece", 180, 120, 30, "400", { lidH: 30 }),
  P("nowruz-gift", "Nowruz gift box", "Square two-piece gift box, 120 × 120 × 60 mm", "two-piece", 120, 120, 60, "chip1", { lidH: 25 }),
  P("shirt-box", "Shirt box", "Large flat lid-and-base box in E-flute, 300 × 220 × 50 mm", "two-piece", 300, 220, 50, "eflute", { clearance: 1 }),
  P("phone-box", "Phone box", "Two-piece box for a phone, 160 × 80 × 25 mm", "two-piece", 160, 80, 25, "chip1", { lidH: 25 }),
  P("gift-card-box", "Gift card box", "Slim two-piece box for a gift card, 110 × 80 × 20 mm", "two-piece", 110, 80, 20, "400", { lidH: 20 }),
  // Tuck-end cartons
  P("soap-box", "Soap box", "Reverse tuck carton for a bar of soap, 90 × 60 × 30 mm", "reverse-tuck", 90, 30, 60),
  P("tea-box", "Tea box", "Tall reverse tuck carton for tea bags, 70 × 70 × 120 mm", "reverse-tuck", 70, 70, 120),
  P("candle-box", "Candle box", "Square carton for a jar candle, 85 × 85 × 100 mm", "reverse-tuck", 85, 85, 100, "400"),
  P("perfume-box", "Perfume box", "Straight tuck carton, clean front, 55 × 55 × 130 mm", "straight-tuck", 55, 55, 130),
  P("cream-jar-box", "Cream jar box", "Cube carton for a cosmetic jar, 60 × 60 × 60 mm", "reverse-tuck", 60, 60, 60),
  P("lipstick-box", "Lipstick box", "Slim straight tuck carton, 25 × 25 × 85 mm", "straight-tuck", 25, 25, 85, "300", { glueW: 10, tuckR: 3 }),
  P("business-card-box", "Business card box", "Holds about 100 cards, 92 × 25 × 57 mm", "reverse-tuck", 92, 25, 57, "350", { glueW: 12 }),
  P("playing-card-box", "Playing card box", "Fits a poker deck, 66 × 22 × 92 mm", "reverse-tuck", 66, 22, 92, "300", { glueW: 12, tuckR: 4 }),
  P("pharmacy-box", "Pharmacy box", "Straight tuck carton for blister packs, 80 × 30 × 100 mm", "straight-tuck", 80, 30, 100, "300"),
  P("toothpaste-box", "Toothpaste box", "Long carton, 40 × 35 × 180 mm", "reverse-tuck", 40, 35, 180, "300"),
  P("bulb-box", "Light bulb box", "Square carton, 65 × 65 × 110 mm", "reverse-tuck", 65, 65, 110),
  // Mailers
  P("small-mailer", "Small mailer", "Shipping box, 150 × 100 × 50 mm in E-flute", "mailer", 150, 100, 50, "eflute"),
  P("book-mailer", "Book mailer", "Flat mailer for a book, 240 × 170 × 40 mm", "mailer", 240, 170, 40, "eflute"),
  P("subscription-box", "Subscription box", "Gift or subscription mailer, 250 × 200 × 80 mm", "mailer", 250, 200, 80, "eflute"),
  P("tshirt-mailer", "T-shirt mailer", "Shallow mailer for a folded T-shirt, 280 × 220 × 40 mm", "mailer", 280, 220, 40, "eflute"),
  P("jewelry-mailer", "Jewelry mailer", "Small card mailer, 120 × 120 × 40 mm", "mailer", 120, 120, 40, "400", { slitLock: true }),
  P("cosmetics-mailer", "Cosmetics mailer", "Kraft mailer for a skincare set, 200 × 150 × 70 mm", "mailer", 200, 150, 70, "kraft300"),
  P("pizza-box", "Pizza box", "Corrugated mailer for a 30 cm pizza, 300 × 300 × 40 mm", "mailer", 300, 300, 40, "eflute"),
  // Lock bottoms and seal ends
  P("mug-box", "Mug box", "Snap-lock bottom for a mug, 100 × 100 × 110 mm", "snap-lock", 100, 100, 110, "400"),
  P("jar-box", "Jar box", "Snap-lock bottom for a jar of honey, 75 × 75 × 100 mm", "snap-lock", 75, 75, 100, "400"),
  P("bottle-box", "Bottle box", "Auto bottom for a bottle, 70 × 70 × 180 mm", "auto-bottom", 70, 70, 180, "400"),
  P("candle-auto-box", "Candle box (auto bottom)", "Pops square when opened, 85 × 85 × 100 mm", "auto-bottom", 85, 85, 100, "400"),
  P("cereal-box", "Cereal box", "Glued seal ends, 190 × 60 × 270 mm", "seal-end", 190, 60, 270, "300"),
  P("tissue-box", "Tissue box", "Seal-end carton with an oval opening on top, 230 × 120 × 60 mm", "seal-end", 230, 120, 60, "350", {}, win("top", "oval", 55)),
  P("window-cookie-box", "Window cookie box", "Reverse tuck with a window in the front, 120 × 60 × 160 mm", "reverse-tuck", 120, 60, 160, "400", {}, win("front", "rounded", 62)),
  // Hanging boxes
  P("earbuds-box", "Earbuds box", "Hanging box with a euro slot, 70 × 30 × 100 mm", "hanging", 70, 30, 100, "350"),
  P("toy-box-window", "Toy box with window", "Hanging box with a front window, 90 × 40 × 140 mm", "hanging", 90, 40, 140, "400", { hangH: 40 }, win("front", "rounded", 70)),
  // Hexagon and pillow
  P("hex-candle-box", "Hexagon candle box", "Six-sided box, 45 mm sides × 110 mm", "hexagon", 45, 45, 110, "350"),
  P("hex-favour-box", "Hexagon favour box", "Little hexagon with stars on the sides, 30 mm sides × 60 mm", "hexagon", 30, 30, 60, "300", {}, pat("sides", "stars", 9, 1.5)),
  P("gift-card-pillow", "Gift card pillow box", "Pillow box for a gift card, 110 × 80 × 20 mm", "pillow", 110, 80, 20, "300"),
  P("favour-pillow", "Favour pillow box", "Pillow box for sweets and favours, 140 × 90 × 30 mm", "pillow", 140, 90, 30, "300"),
  // Shipping cartons
  P("rsc-small", "Small shipping carton", "Regular slotted carton, 200 × 150 × 100 mm", "shipping", 200, 150, 100, "eflute"),
  P("fol-carton", "Full overlap carton", "Strong carton with full-width flaps, 250 × 180 × 150 mm", "shipping", 250, 180, 150, "eflute", { flaps: "fol" }),
  P("open-crate", "Open-top crate", "Half-slotted carton, open on top, 300 × 200 × 120 mm", "shipping", 300, 200, 120, "eflute", { flaps: "hsc" }),
  // Drawers, sleeves and trays
  P("matchbox", "Matchbox", "Drawer box, 55 × 35 × 15 mm", "drawer", 55, 35, 15, "350", { clearance: 0.4, notch: 6 }),
  P("jewelry-drawer", "Jewelry drawer box", "Sliding drawer for jewellery, 100 × 70 × 30 mm", "drawer", 100, 70, 30, "chip1"),
  P("chocolate-drawer", "Chocolate drawer box", "Drawer box with a window on top, 160 × 110 × 30 mm", "drawer", 160, 110, 30, "chip1", {}, win("top", "rounded", 60)),
  P("soap-sleeve", "Soap sleeve", "Printed band round a bar of soap, 90 × 60 × 30 mm", "sleeve", 90, 60, 30, "300"),
  P("cookie-sleeve", "Cookie box sleeve", "Sleeve for a two-piece box, 160 × 120 × 40 mm", "sleeve", 160, 120, 40, "350"),
  P("hamper-tray", "Hamper tray", "Open tray for a gift hamper, 250 × 180 × 60 mm", "tray", 250, 180, 60, "chip1"),
  P("sorting-tray", "Sorting tray", "Shallow desk tray, 150 × 100 × 30 mm", "tray", 150, 100, 30, "chip1"),
  // Gable and display
  P("cake-gable", "Cake slice gable box", "Carry box with a handle, 120 × 90 × 100 mm", "gable", 120, 90, 100, "400"),
  P("party-gable", "Party favour gable box", "Little carry box, 70 × 50 × 70 mm", "gable", 70, 50, 70, "350", { handleH: 28 }),
  P("counter-display", "Counter display", "Shop counter tray with a header, 220 × 160 × 90 mm", "display", 220, 160, 90, "eflute"),
  P("candy-display", "Candy display", "Small counter display, 180 × 120 × 70 mm", "display", 180, 120, 70, "400", { front: 30, header: 70 }),
];

export const PAPERBOX_PRESETS: GenPreset<PaperBoxParams>[] = LIST.map((p) => (SHEETS[p.id] ? { ...p, params: { ...p.params, bedW: SHEETS[p.id][0], bedH: SHEETS[p.id][1] } } : p));
