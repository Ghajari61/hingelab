import type { GenPreset } from "../types";
import type { PaperBoxParams } from "./params";

type More = Record<string, number | string | boolean>;
/** A preset: style, inside size (mm), board, and the style's own settings. */
const P = (id: string, name: string, note: string, style: string, L: number, W: number, H: number, paper = "350", more: More = {}): GenPreset<PaperBoxParams> => ({
  id, name, note,
  params: { name, style, paper, T: THICK[paper], styles: { [style]: { L, W, H, dims: "inner", ...more } } },
});
const THICK: Record<string, number> = { "250": 0.32, "300": 0.4, "350": 0.45, "400": 0.52, kraft300: 0.45, chip1: 1, eflute: 1.6 };

/** Presets whose flat net is larger than the default 600 × 400 mm sheet get a sheet that holds it. */
const SHEETS: Record<string, [number, number]> = {
  "small-mailer": [900, 600], "jewelry-mailer": [900, 600], "book-mailer": [900, 600], "tshirt-mailer": [900, 700], "cosmetics-mailer": [900, 700], "subscription-box": [1300, 900],
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
];

export const PAPERBOX_PRESETS: GenPreset<PaperBoxParams>[] = LIST.map((p) => (SHEETS[p.id] ? { ...p, params: { ...p.params, bedW: SHEETS[p.id][0], bedH: SHEETS[p.id][1] } } : p));
