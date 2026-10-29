/**
 * Leather Studio's templates. Each product kind has its own starting sizes (the editor applies them
 * when the product changes), and the templates are those starting points plus variations: different
 * constructions, sizes, stitches, hardware and HingeLab's own decorative patterns. None reproduces a
 * brand's design.
 *
 * The "studio-" templates are cut-ready on the default 915 × 458 mm bed.
 */
import type { DeepPartial, GenPreset } from "../types";
import { mergeLeather, type LeatherParams, type ProductKind, PRODUCTS } from "./params";

type Raw = DeepPartial<LeatherParams>;
const S = (width: number, height: number, depth: number, corner = 20, taper = 0.8) => ({ width, height, depth, corner, taper });
const NO_BAG = { lining: false, zipper: false, flap: 0, closure: "none", handles: 0, strap: false, feet: false, reinforce: false, pocket: false, dividers: 0 } as const;

/** Each product's starting point: sizes and construction a maker would begin from. */
export const PRODUCT_BASE: Record<ProductKind, Raw> = {
  handbag: { size: S(300, 220, 110, 30), build: { lining: true, zipper: true, zipLen: 240, handles: 2, handleLen: 320, feet: true, reinforce: true, pocket: true, flap: 0, strap: false, closure: "none" } },
  tote: { size: S(360, 300, 120, 30), build: { lining: false, zipper: false, handles: 2, handleLen: 560, handleW: 25, feet: true, reinforce: true, pocket: true, flap: 0, closure: "magnet", strap: false } },
  briefcase: { size: S(400, 290, 100, 20), build: { lining: true, zipper: false, flap: 90, flapShape: "straight", closure: "buckle", handles: 1, handleLen: 260, strap: true, strapLen: 1300, dividers: 1, feet: true, reinforce: true, pocket: true } },
  messenger: { size: S(340, 260, 90, 30), build: { lining: false, zipper: false, flap: 180, flapShape: "round", closure: "magnet", handles: 0, strap: true, strapLen: 1350, strapW: 38, dividers: 0, feet: false, reinforce: true, pocket: true } },
  satchel: { size: S(300, 230, 60, 30), build: { lining: false, zipper: false, flap: 120, flapShape: "round", closure: "buckle", handles: 1, handleLen: 220, strap: true, strapLen: 1250, compartments: 2, feet: false, reinforce: false, pocket: false } },
  camera: { size: S(260, 190, 140, 25), build: { lining: false, zipper: false, flap: 120, flapShape: "straight", closure: "buckle", handles: 0, strap: true, strapLen: 1300, strapW: 38, dividers: 2, feet: true, reinforce: true, pocket: false } },
  convertible: { size: S(260, 280, 100, 30), build: { lining: false, zipper: false, flap: 140, flapShape: "round", closure: "magnet", handles: 0, strap: true, strapLen: 1300, strapW: 25, feet: false, reinforce: true, pocket: true } },
  crossbody: { size: S(220, 160, 60, 25), build: { lining: false, zipper: false, flap: 110, flapShape: "round", closure: "snap", handles: 0, strap: true, strapLen: 1200, strapW: 20, feet: false, reinforce: false, pocket: false } },
  phonebag: { size: S(110, 180, 30, 14), build: { lining: false, zipper: false, flap: 60, flapShape: "round", closure: "snap", handles: 0, strap: true, strapLen: 1200, strapW: 14, feet: false, reinforce: false, pocket: false } },
  clutch: { size: S(260, 140, 30, 12), build: { lining: true, zipper: false, flap: 90, flapShape: "pointed", closure: "magnet", handles: 0, strap: false, feet: false, reinforce: false, pocket: true } },
  saddle: { size: S(220, 200, 70, 20), build: { lining: false, zipper: false, flap: 150, flapShape: "round", closure: "snap", handles: 0, strap: true, strapLen: 1200, strapW: 22, feet: false, reinforce: false, pocket: false } },
  doctor: { size: S(340, 230, 150, 20, 0.75), build: { lining: true, zipper: false, flap: 0, closure: "none", handles: 1, handleLen: 240, handleW: 24, strap: false, feet: true, reinforce: true, pocket: true } },
  hybrid: { size: S(300, 200, 140, 20), build: { lining: false, zipper: false, flap: 0, closure: "none", handles: 1, handleLen: 220, strap: false, feet: true, reinforce: true, pocket: false, woodT: 4 } },
  rolltop: { size: S(280, 380, 120, 30), build: { lining: false, zipper: false, flap: 0, closure: "none", handles: 0, rollExt: 140, strapLen: 1200, strapW: 38, feet: false, reinforce: true, pocket: true } },
  waistbag: { size: S(220, 130, 60, 30), build: { lining: false, zipper: true, zipLen: 170, flap: 0, closure: "none", handles: 0, strap: true, strapLen: 1100, strapW: 25, feet: false, reinforce: false, pocket: false } },
  laptop: { size: S(380, 280, 70, 25), build: { lining: false, zipper: false, flap: 200, flapShape: "straight", closure: "buckle", handles: 0, strap: true, strapLen: 1350, strapW: 38, dividers: 1, feet: true, reinforce: true, pocket: true } },
  duffel: { size: S(430, 230, 200, 50), build: { lining: false, zipper: true, zipLen: 400, handles: 2, handleLen: 420, handleW: 25, strap: true, strapLen: 1350, strapW: 38, feet: true, reinforce: true } },
  toiletry: { size: S(240, 130, 120, 35), build: { lining: false, zipper: true, zipLen: 200, handles: 0, strap: false, feet: false, reinforce: false } },
  penroll: { size: S(200, 60, 60, 30), build: { lining: false, zipper: true, zipLen: 170, zipGauge: 3, handles: 0, strap: false, feet: false, reinforce: false } },
  bucket: { size: S(220, 260, 160, 20), build: { lining: false, zipper: false, handles: 0, strap: true, strapLen: 1100, strapW: 20, reinforce: true } },
  sculpt: { size: S(240, 170, 80, 10), build: { lining: false, zipper: false, flap: 0, closure: "magnet", handles: 1, handleLen: 300, handleW: 22, strap: false, reinforce: false } },
  bifold: { size: S(220, 95, 10, 6), build: { ...NO_BAG, lining: true, liningT: 0.8 }, small: { cards: 3, pocketH: 62 } },
  cardholder: { size: S(102, 76, 5, 6), build: { ...NO_BAG }, small: { cards: 2, pocketH: 58 } },
  passport: { size: S(270, 140, 10, 6), build: { ...NO_BAG, lining: true, liningT: 0.8 }, small: { pocketH: 60 } },
  longwallet: { size: S(212, 190, 10, 8), build: { ...NO_BAG, lining: true, liningT: 0.8 }, small: { cards: 4, pocketH: 72 } },
  sleeve: { size: S(250, 330, 10, 14), build: { ...NO_BAG, flap: 80, flapShape: "round", closure: "snap" } },
  glasses: { size: S(75, 170, 0, 14), build: { ...NO_BAG } },
  notebook: { size: S(148, 210, 15, 6), build: { ...NO_BAG } },
  toolroll: { size: S(400, 260, 0, 10), build: { ...NO_BAG }, small: { cards: 8, pocketH: 130 } },
  coaster: { size: S(100, 100, 0, 50), build: { ...NO_BAG } },
  tray: { size: S(160, 120, 30, 6), build: { ...NO_BAG } },
  luggagetag: { size: S(70, 110, 0, 8), build: { ...NO_BAG } },
  coinpurse: { size: S(70, 70, 24, 14), build: { ...NO_BAG } },
  belt: { build: { ...NO_BAG }, small: { length: 700, width: 35, holes: 5, holePitch: 25 } },
  watchstrap: { T: 1.6, build: { ...NO_BAG }, stitch: { edge: 3, pitch: 3, hole: 1 }, small: { length: 180, width: 20, holes: 7, holePitch: 7, taper: 0.8 } },
  keyfob: { build: { ...NO_BAG }, small: { length: 130, width: 25 } },
  bracelet: { T: 1.6, build: { ...NO_BAG }, small: { length: 180, width: 20, holes: 2 } },
  collar: { build: { ...NO_BAG }, small: { length: 380, width: 25, holes: 5, holePitch: 20 } },
  leash: { build: { ...NO_BAG }, small: { length: 440, width: 20 } },
  shoulderstrap: { build: { ...NO_BAG }, small: { length: 700, width: 25 } },
  bagcharm: { size: S(70, 70, 0, 0), build: { ...NO_BAG }, decor: { style: "none" } },
};

/** The product's starting point over the current settings (material, stitch and hardware are kept). */
export function applyProduct(p: LeatherParams, k: ProductKind, rename: boolean): LeatherParams {
  const base = PRODUCT_BASE[k];
  const merged = mergeLeather({ ...p, product: k, size: { ...p.size, ...base.size }, build: { ...p.build, ...base.build }, small: { ...p.small, ...base.small }, stitch: { ...p.stitch, ...base.stitch }, ...(base.T ? { T: base.T } : {}), ...(base.decor ? { decor: { ...p.decor, ...base.decor } } : {}) });
  return { ...merged, name: rename ? PRODUCTS[k].name : p.name };
}

const pre = (id: string, name: string, note: string, k: ProductKind, extra: Raw = {}): GenPreset<LeatherParams> => {
  const b = PRODUCT_BASE[k];
  return { id, name, note, params: { name, product: k, ...b, ...extra, size: { ...b.size, ...extra.size }, build: { ...b.build, ...extra.build }, small: { ...b.small, ...extra.small }, stitch: { ...b.stitch, ...extra.stitch }, decor: { ...b.decor, ...extra.decor } } as Raw };
};

export const LEATHER_PRESETS: GenPreset<LeatherParams>[] = [
  // ---- cut-ready studio templates (fit the 915 × 458 mm bed)
  pre("studio-card-holder", "Card holder", "Three layers, two pockets and a thumb notch", "cardholder"),
  pre("studio-bifold-wallet", "Bifold wallet", "Lined, three staggered card pockets a side", "bifold"),
  pre("studio-crossbody", "Crossbody bag", "Round flap with a snap and a crossbody strap", "crossbody"),
  // ---- the complex products first
  pre("structured-handbag", "Structured handbag", "Lined, zipped top panel, riveted handles, stiffener and feet", "handbag"),
  pre("executive-briefcase", "Executive briefcase", "Divider wall, buckled flap, top handle, shoulder strap and feet", "briefcase"),
  pre("rolltop-backpack", "Roll-top backpack", "Roll closure with buckles and adjustable shoulder straps", "rolltop"),
  pre("weekender-duffel", "Weekender duffel", "End panels, wrapped body, zip, handles and shoulder strap", "duffel"),
  pre("camera-bag", "Camera bag", "Slotted rails with removable dividers and a buckled flap", "camera"),
  pre("convertible-backpack", "Convertible crossbody backpack", "D-rings for a crossbody strap or backpack straps", "convertible"),
  pre("doctor-bag", "Doctor bag", "Trapezoid ends, frame channels, top handle and feet", "doctor"),
  pre("multi-gusset-satchel", "Multi-gusset satchel", "Two compartments round a shared middle panel", "satchel"),
  pre("wood-leather-bag", "Wood and leather handbag", "Plywood end panels laced to a leather body", "hybrid", { stitch: { type: "lacing", pitch: 6, hole: 1.5 } }),
  pre("sculptural-bag", "Sculptural folded bag", "One piece with folding wings and a magnetic top", "sculpt"),
  // ---- more bags
  pre("open-tote", "Open tote", "Long handles, inside slip pocket and a magnet", "tote"),
  pre("messenger-bag", "Messenger bag", "Deep round flap and a long strap on D-rings", "messenger", { decor: { style: "persian-geometric", mode: "engrave", scale: 22 } }),
  pre("laptop-messenger", "Laptop messenger", "Divider wall for a laptop and a buckled flap", "laptop"),
  pre("phone-bag", "Phone bag", "Narrow flap bag with a thin strap", "phonebag"),
  pre("envelope-clutch", "Envelope clutch", "Pointed flap, magnet and lining", "clutch", { decor: { style: "art-deco", mode: "engrave", scale: 18 } }),
  pre("saddle-bag", "Saddle bag", "Round bottom and a shaped flap", "saddle", { decor: { style: "western", mode: "engrave", scale: 20 } }),
  pre("waist-bag", "Waist bag", "Zipped top panel and a belt strap", "waistbag"),
  pre("bucket-bag", "Bucket bag", "Oval base, grommets for a drawstring and a strap", "bucket"),
  pre("toiletry-bag", "Toiletry bag", "Rounded end panels and a zip", "toiletry"),
  pre("pencil-case", "Round pencil case", "Disc ends and a zipped tube", "penroll"),
  // ---- small goods
  pre("long-wallet", "Long wallet", "Four card pockets a side, lined", "longwallet"),
  pre("passport-holder", "Passport holder", "Sleeves and a card pocket", "passport", { decor: { style: "japanese-kikko", mode: "engrave", scale: 12 } }),
  pre("tablet-sleeve", "Tablet sleeve", "Two layers with a snap flap", "sleeve"),
  pre("glasses-case", "Glasses case", "One piece folded and stitched", "glasses"),
  pre("notebook-cover", "A5 notebook cover", "Stitched flaps and a pen loop", "notebook", { decor: { style: "persian-floral", mode: "engrave", scale: 20 } }),
  pre("tool-roll", "Tool roll", "Eight slots and a tie strap", "toolroll"),
  pre("perforated-coaster", "Perforated coaster", "Two layers with a perforated boteh face", "coaster", { decor: { style: "iranian-boteh", mode: "perforate", scale: 14 } }),
  pre("moroccan-coaster", "Moroccan coaster", "Square coaster with an engraved quatrefoil face", "coaster", { size: { corner: 8 }, decor: { style: "moroccan", mode: "engrave", scale: 12 } }),
  pre("valet-tray", "Valet tray", "Folded walls snapped at the corners", "tray"),
  pre("luggage-tag", "Luggage tag", "Window, card slot and strap", "luggagetag"),
  pre("coin-purse", "Coin purse", "A square folded into a tray with snaps", "coinpurse"),
  // ---- straps and accessories
  pre("dress-belt", "Belt", "35 mm, 700 mm to the middle hole, folded buckle end, keeper and five holes", "belt"),
  pre("watch-strap", "Watch strap", "20 mm lugs tapering to 16 mm", "watchstrap"),
  pre("key-fob", "Key fob", "Folded loop riveted round a ring", "keyfob"),
  pre("snap-bracelet", "Bracelet", "Two sizes of snap and edge stitching", "bracelet"),
  pre("pet-collar", "Pet collar", "Buckle, D-ring and adjustment holes", "collar"),
  pre("pet-lead", "Short pet lead", "Traffic lead with a handle loop and a clip", "leash"),
  pre("bag-strap", "Handbag strap", "Folded clip ends and a slider", "shoulderstrap"),
  pre("bag-charm", "Bag charm", "Three layers of a flower motif", "bagcharm"),
];
