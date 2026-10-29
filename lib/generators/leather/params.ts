import { DEFAULTS as HINGE, clone } from "@/lib/hinge/defaults";
import { FIT_OFF } from "@/lib/fit/fitToSheets";
import { JOB_EXTRAS, SHEET_DEFAULTS, type GenBase } from "../types";
import { mergeInto } from "../util";
import type { HwSizes } from "./hardware";
import { LEATHER_BY_ID } from "./materials";
import { CUT_MODES, STITCH_NAMES, type CutMode, type HoleShape, type StitchType } from "./stitch";

/** How a product is built: the construction family its builder belongs to. */
export type Family = "box" | "wrap" | "bucket" | "folded" | "flat" | "strap";
export type Complexity = "Intermediate" | "Advanced" | "Expert" | "Master";

export type ProductKind =
  // bags built from faces and a gusset
  | "handbag" | "tote" | "briefcase" | "messenger" | "satchel" | "camera" | "convertible" | "crossbody" | "phonebag" | "clutch" | "saddle" | "doctor" | "hybrid" | "rolltop" | "waistbag" | "laptop"
  // end panels and a wrap all round
  | "duffel" | "toiletry" | "penroll"
  // other constructions
  | "bucket" | "sculpt"
  // flat goods, stacked and folded
  | "bifold" | "cardholder" | "passport" | "longwallet" | "sleeve" | "glasses" | "notebook" | "toolroll" | "coaster" | "tray" | "luggagetag" | "coinpurse"
  // straps
  | "belt" | "watchstrap" | "keyfob" | "bracelet" | "collar" | "leash" | "shoulderstrap" | "bagcharm";

export interface ProductInfo { name: string; category: string; family: Family; complexity: Complexity; blurb: string }

export const PRODUCTS: Record<ProductKind, ProductInfo> = {
  handbag: { name: "Structured handbag", category: "Luxury Handbags", family: "box", complexity: "Master", blurb: "Lined handbag with a zipped top panel, two riveted handles, base stiffener and feet." },
  tote: { name: "Open tote", category: "Luxury Handbags", family: "box", complexity: "Advanced", blurb: "Open-top tote with a continuous gusset, long handles and an inside slip pocket." },
  briefcase: { name: "Executive briefcase", category: "Business and Professional Bags", family: "box", complexity: "Master", blurb: "Briefcase with divider walls stitched into the gusset, a flap with buckle straps, top handle, shoulder strap and feet." },
  messenger: { name: "Messenger bag", category: "Business and Professional Bags", family: "box", complexity: "Advanced", blurb: "Flap messenger with a long adjustable strap on D-ring tabs and a magnetic clasp." },
  satchel: { name: "Multi-gusset satchel", category: "Luxury Handbags", family: "box", complexity: "Master", blurb: "Two compartments with their own gussets around a shared middle panel, a flap with buckles and a handle." },
  camera: { name: "Camera bag", category: "Business and Professional Bags", family: "box", complexity: "Master", blurb: "Camera bag with slotted rails and removable dividers, a flap and a shoulder strap." },
  convertible: { name: "Convertible crossbody backpack", category: "Backpacks and Travel", family: "box", complexity: "Expert", blurb: "Flap bag with D-rings for both a crossbody strap and backpack straps." },
  crossbody: { name: "Crossbody bag", category: "Crossbody and Small Bags", family: "box", complexity: "Advanced", blurb: "Small flap bag with a snap and a crossbody strap." },
  phonebag: { name: "Phone bag", category: "Crossbody and Small Bags", family: "box", complexity: "Intermediate", blurb: "Narrow phone bag with a flap and a thin strap." },
  clutch: { name: "Clutch", category: "Luxury Handbags", family: "box", complexity: "Advanced", blurb: "Slim envelope clutch with a magnetic flap and an inside pocket." },
  saddle: { name: "Saddle bag", category: "Crossbody and Small Bags", family: "box", complexity: "Expert", blurb: "Round-bottomed saddle bag with a shaped flap and strap." },
  doctor: { name: "Doctor bag", category: "Luxury Handbags", family: "box", complexity: "Master", blurb: "Trapezoid end panels with the body wrapped round them, frame channels at the opening, top handle and feet." },
  hybrid: { name: "Wood and leather handbag", category: "Hybrid Products", family: "box", complexity: "Expert", blurb: "Laser-cut plywood end panels laced or stitched to a leather body." },
  rolltop: { name: "Roll-top backpack", category: "Backpacks and Travel", family: "box", complexity: "Master", blurb: "Tall backpack with a roll-top extension, buckle closure and adjustable shoulder straps." },
  waistbag: { name: "Waist bag", category: "Crossbody and Small Bags", family: "box", complexity: "Advanced", blurb: "Small bag with a zipped top panel and a belt strap." },
  laptop: { name: "Laptop messenger", category: "Business and Professional Bags", family: "box", complexity: "Expert", blurb: "Messenger sized for a laptop, with a padded divider wall and strap." },
  duffel: { name: "Weekender duffel", category: "Backpacks and Travel", family: "wrap", complexity: "Master", blurb: "End panels with the body wrapped all round, a zipped top, handles, shoulder strap and a base stiffener." },
  toiletry: { name: "Toiletry bag", category: "Backpacks and Travel", family: "wrap", complexity: "Advanced", blurb: "Small zipped bag with rounded end panels." },
  penroll: { name: "Round pencil case", category: "Cases and Organizers", family: "wrap", complexity: "Advanced", blurb: "Round end discs with a zipped tube body." },
  bucket: { name: "Bucket bag", category: "Luxury Handbags", family: "bucket", complexity: "Expert", blurb: "Round base and a wrapped body with a side seam, grommets for a drawstring and a strap." },
  sculpt: { name: "Sculptural folded bag", category: "Luxury Handbags", family: "folded", complexity: "Master", blurb: "One piece: front, base and back with side wings that fold in and stitch to each other." },
  bifold: { name: "Bifold wallet", category: "Wallets and Documents", family: "flat", complexity: "Intermediate", blurb: "Folded wallet with card pockets stitched through all layers." },
  cardholder: { name: "Card holder", category: "Wallets and Documents", family: "flat", complexity: "Intermediate", blurb: "Three-layer card holder with two pockets." },
  passport: { name: "Passport holder", category: "Wallets and Documents", family: "flat", complexity: "Intermediate", blurb: "Folded passport cover with sleeves and a card pocket." },
  longwallet: { name: "Long wallet", category: "Wallets and Documents", family: "flat", complexity: "Advanced", blurb: "Long folded wallet with staggered card pockets." },
  sleeve: { name: "Tablet sleeve", category: "Business and Professional Bags", family: "flat", complexity: "Intermediate", blurb: "Two layers stitched round three sides with a snap flap." },
  glasses: { name: "Glasses case", category: "Cases and Organizers", family: "flat", complexity: "Intermediate", blurb: "One piece folded and stitched along its side and end." },
  notebook: { name: "Notebook cover", category: "Stationery", family: "flat", complexity: "Intermediate", blurb: "Cover with folded-in flaps stitched at the top and bottom, and a pen loop." },
  toolroll: { name: "Tool roll", category: "Business and Professional Bags", family: "flat", complexity: "Advanced", blurb: "Base with a stitched pocket strip divided into slots and a tie strap." },
  coaster: { name: "Coaster", category: "Home and Decor", family: "flat", complexity: "Intermediate", blurb: "Two layers stitched round the edge, with a decorative face." },
  tray: { name: "Valet tray", category: "Home and Decor", family: "flat", complexity: "Intermediate", blurb: "One piece with folded walls held by a snap at each corner." },
  luggagetag: { name: "Luggage tag", category: "Accessories", family: "flat", complexity: "Intermediate", blurb: "Two layers with a window, stitched round, and a strap slot." },
  coinpurse: { name: "Coin purse", category: "Wallets and Documents", family: "flat", complexity: "Intermediate", blurb: "A square folded into a tray and closed with a snap; no stitching." },
  belt: { name: "Belt", category: "Accessories", family: "strap", complexity: "Intermediate", blurb: "Belt with a folded buckle end, a keeper, adjustment holes and edge stitching." },
  watchstrap: { name: "Watch strap", category: "Accessories", family: "strap", complexity: "Advanced", blurb: "Tapered two-piece strap with folded spring-bar ends, a keeper and holes." },
  keyfob: { name: "Key holder", category: "Accessories", family: "strap", complexity: "Intermediate", blurb: "Folded loop fob riveted round a ring." },
  bracelet: { name: "Bracelet", category: "Accessories", family: "strap", complexity: "Intermediate", blurb: "Strip with snaps and edge stitching." },
  collar: { name: "Pet collar", category: "Pet Accessories", family: "strap", complexity: "Intermediate", blurb: "Collar with a buckle, a D-ring for the lead and adjustment holes." },
  leash: { name: "Pet lead", category: "Pet Accessories", family: "strap", complexity: "Intermediate", blurb: "Lead with a folded handle loop and a folded clip end." },
  shoulderstrap: { name: "Adjustable strap", category: "Accessories", family: "strap", complexity: "Intermediate", blurb: "Bag strap with folded ends for clips and a slider." },
  bagcharm: { name: "Bag charm", category: "Accessories", family: "strap", complexity: "Intermediate", blurb: "Layered charm with a riveted loop." },
};

export type DecorStyle =
  | "none" | "persian-geometric" | "persian-floral" | "iranian-boteh" | "moroccan" | "islamic-star" | "japanese-kikko" | "japanese-minimal"
  | "art-deco" | "art-nouveau" | "western" | "scandinavian" | "european" | "celtic" | "botanical" | "modern" | "luxury" | "parametric";
export const DECOR_NAMES: Record<DecorStyle, string> = {
  none: "None", "persian-geometric": "Persian geometric (girih stars)", "persian-floral": "Persian floral rosettes", "iranian-boteh": "Iranian boteh (paisley)",
  moroccan: "Moroccan quatrefoil", "islamic-star": "Islamic star pattern", "japanese-kikko": "Japanese tortoiseshell (hexagons)", "japanese-minimal": "Japanese minimal circles",
  "art-deco": "Art Deco sunbursts", "art-nouveau": "Art Nouveau leaves", western: "Western floral tooling", scandinavian: "Scandinavian diamonds", european: "European fleur-de-lis",
  celtic: "Celtic knots", botanical: "Botanical leaves", modern: "Modern lattice", luxury: "Contemporary gems", parametric: "Parametric radial perforation",
};
export type DecorMode = "perforate" | "engrave" | "score";

export interface LeatherParams extends GenBase {
  product: ProductKind;
  /** Leather id (materials.ts) and whether its laser safety is confirmed. */
  leather: string;
  verified: boolean;
  size: { width: number; height: number; depth: number; corner: number; taper: number };
  build: {
    lining: boolean; liningT: number; liningClear: number; reinforce: boolean; pocket: boolean;
    zipper: boolean; zipGauge: 3 | 5; zipLen: number;
    flap: number; flapShape: "round" | "straight" | "pointed";
    closure: "none" | "magnet" | "snap" | "buckle";
    handles: number; handleLen: number; handleW: number; attach: "rivets" | "box";
    strap: boolean; strapLen: number; strapW: number;
    feet: boolean; dividers: number; compartments: number; rollExt: number; woodT: number;
  };
  stitch: { type: StitchType; pitch: number; hole: number; shape: HoleShape; edge: number; rowGap: number; mode: CutMode };
  hw: HwSizes;
  decor: { style: DecorStyle; mode: DecorMode; scale: number; margin: number; bar: number };
  /** Small goods: card pockets, and strap goods' length, width, holes and taper. */
  small: { cards: number; pocketH: number; length: number; width: number; holes: number; holePitch: number; taper: number };
}

export const LEATHER_DEFAULTS: LeatherParams = {
  name: "Structured handbag",
  material: "leather2",
  leather: "vegtan",
  T: 2,
  K: 0.2,
  bedW: 915,
  bedH: 458,
  gap: 4,
  fit: { ...FIT_OFF },
  sheet: { ...SHEET_DEFAULTS },
  job: { ...JOB_EXTRAS },
  layers: clone(HINGE.layers),
  product: "handbag",
  verified: false,
  size: { width: 300, height: 220, depth: 110, corner: 30, taper: 0.8 },
  build: {
    lining: true, liningT: 0.8, liningClear: 1.5, reinforce: true, pocket: true,
    zipper: true, zipGauge: 5, zipLen: 240,
    flap: 0, flapShape: "round", closure: "none",
    handles: 2, handleLen: 320, handleW: 22, attach: "rivets",
    strap: false, strapLen: 1200, strapW: 25,
    feet: true, dividers: 0, compartments: 1, rollExt: 120, woodT: 4,
  },
  stitch: { type: "saddle", pitch: 4, hole: 1.2, shape: "round", edge: 4, rowGap: 4, mode: "laser" },
  hw: { rivetCap: 8, rivetHole: 3, snapCap: 12.5, snapHole: 3.5, magnet: 18, grommetHole: 6, screwHole: 5, footHole: 4 },
  decor: { style: "none", mode: "perforate", scale: 14, margin: 5, bar: 1.6 },
  small: { cards: 3, pocketH: 50, length: 1000, width: 35, holes: 5, holePitch: 25, taper: 0.8 },
};

export function mergeLeather(raw: unknown): LeatherParams {
  const p = mergeInto(clone(LEATHER_DEFAULTS), raw);
  if (!(p.product in PRODUCTS)) p.product = "handbag";
  if (!(p.leather in LEATHER_BY_ID)) p.leather = "vegtan";
  if (!(p.stitch.type in STITCH_NAMES)) p.stitch.type = "saddle";
  if (p.stitch.shape !== "slanted") p.stitch.shape = "round";
  if (!(p.stitch.mode in CUT_MODES)) p.stitch.mode = "laser";
  if (!(p.decor.style in DECOR_NAMES)) p.decor.style = "none";
  if (!["perforate", "engrave", "score"].includes(p.decor.mode)) p.decor.mode = "perforate";
  const b = p.build;
  if (b.zipGauge !== 3) b.zipGauge = 5;
  if (!["round", "straight", "pointed"].includes(b.flapShape)) b.flapShape = "round";
  if (!["none", "magnet", "snap", "buckle"].includes(b.closure)) b.closure = "none";
  if (b.attach !== "box") b.attach = "rivets";
  return p;
}

export const LEATHER_VERSION = 1;
