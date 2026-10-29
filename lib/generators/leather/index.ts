import { genericPlan } from "../assemblyBook";
import { circle, rect } from "../geom";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildLeather, type LeatherOutput } from "./build";
import { checkLeather } from "./check";
import { LEATHERS, leatherOf } from "./materials";
import { DECOR_NAMES, LEATHER_DEFAULTS, LEATHER_VERSION, PRODUCTS, mergeLeather, type Family, type LeatherParams, type ProductKind } from "./params";
import { LEATHER_PRESETS, applyProduct } from "./presets";
import { CUT_MODES, STITCH_NAMES } from "./stitch";
import { roundRect } from "./path";

const fam = (p: LeatherParams): Family => PRODUCTS[p.product].family;
const isFam = (...f: Family[]) => (p: LeatherParams) => f.includes(fam(p));
const isKind = (...k: ProductKind[]) => (p: LeatherParams) => k.includes(p.product);
const or = (...fs: ((p: LeatherParams) => boolean)[]) => (p: LeatherParams) => fs.some((f) => f(p));
const opts = <K extends string>(names: Record<K, string>) => (Object.keys(names) as K[]).map((v) => ({ v, text: names[v] }));
const BUILT_IN = new Set<string>([LEATHER_DEFAULTS.name, ...Object.values(PRODUCTS).map((q) => q.name), ...LEATHER_PRESETS.map((q) => String(q.params.name ?? ""))]);

const FLAP_BAGS: ProductKind[] = ["briefcase", "satchel", "messenger", "laptop", "camera", "convertible", "crossbody", "phonebag", "clutch", "saddle"];
const HANDLE_BAGS: ProductKind[] = ["handbag", "tote", "briefcase", "satchel", "doctor", "hybrid"];
const hasFlap = or(isKind(...FLAP_BAGS, "sleeve"), (p) => p.product === "handbag" && !p.build.zipper);
const hasHandles = or(isKind(...HANDLE_BAGS), isFam("folded"), (p) => fam(p) === "wrap" && p.product !== "penroll");
const hasStrap = or(isKind("handbag", "tote", "messenger", "crossbody", "phonebag", "saddle", "waistbag", "laptop", "camera", "convertible", "briefcase", "satchel", "bucket"), isKind("duffel", "toiletry"));
const hasZip = or(isFam("wrap"), isKind("waistbag"), (p) => p.product === "handbag" && p.build.zipper);
const lined = or(isKind("handbag", "tote", "briefcase", "messenger", "satchel", "camera", "convertible", "crossbody", "phonebag", "clutch", "saddle", "doctor", "rolltop", "waistbag", "laptop", "bifold", "longwallet", "passport"));
const isBag = isFam("box", "wrap", "bucket", "folded");

const sections: SectionSpec<LeatherParams>[] = [
  {
    id: "product", title: "Product", open: true,
    help: "What to make: a bag, a small leather good or a strap, each with its own construction.",
    fields: [
      {
        kind: "choice", key: "product", label: "Product", rail: true,
        help: "Each product is built from real pattern pieces with matched seams; changing it loads that product's starting sizes and keeps the leather, stitch and hardware settings.",
        options: (Object.keys(PRODUCTS) as ProductKind[]).map((v) => ({ v, text: PRODUCTS[v].name, title: `${PRODUCTS[v].category} · ${PRODUCTS[v].complexity}. ${PRODUCTS[v].blurb}` })),
        apply: (p, v) => applyProduct(p, v as ProductKind, BUILT_IN.has(p.name)),
      },
    ],
  },
  {
    id: "size", title: "Size", open: true, show: or((p) => fam(p) !== "strap", isKind("bagcharm")),
    help: "The finished outside size, in millimetres.",
    fields: [
      { kind: "number", key: "size.width", label: "Width", unit: "mm", min: 30, max: 900, step: 1, help: "Across the front; for a wallet or cover, its width laid open; for a coaster or charm, its diameter." },
      { kind: "number", key: "size.height", label: "Height", unit: "mm", min: 30, max: 600, step: 1, show: (p) => p.product !== "bagcharm" && p.product !== "coaster", help: "From the base to the opening, or the length laid open for flat goods." },
      { kind: "number", key: "size.depth", label: "Depth", unit: "mm", min: 0, max: 400, step: 1, show: or(isBag, isKind("sleeve", "notebook", "tray", "coinpurse")), help: "Front to back (the gusset's width); for a sleeve the device's thickness, for a notebook its spine, for a tray its wall height." },
      { kind: "number", key: "size.corner", label: "Corner radius", unit: "mm", min: 0, max: 80, step: 1, show: (p) => p.product !== "bagcharm", help: "Radius of the rounded corners; on a coaster, half the width makes it round." },
      { kind: "number", key: "size.taper", label: "Top width", unit: "", min: 0.4, max: 1, step: 0.01, show: isKind("doctor"), help: "The end panels' top width as a fraction of their base (0.4 to 1), for the doctor bag's trapezoid ends." },
    ],
  },
  {
    id: "build", title: "Construction", open: true, show: or(isBag, isKind("bifold", "longwallet", "passport", "sleeve")),
    help: "Lining, closures, handles, straps and the other parts the bag is built with.",
    fields: [
      { kind: "toggle", key: "build.lining", label: "Lining", show: lined, help: "Cuts a lining for every panel from the second material, with the seam holes in it, glued in before stitching." },
      { kind: "number", key: "build.liningT", label: "Lining thickness", unit: "mm", min: 0.4, max: 2, step: 0.1, show: (p) => lined(p) && p.build.lining, help: "Thickness of the lining leather or fabric-backed lining." },
      { kind: "number", key: "build.liningClear", label: "Lining set-back", unit: "mm", min: 0, max: 4, step: 0.1, advanced: true, show: (p) => lined(p) && p.build.lining && fam(p) === "box", help: "How far the lining stops short of the opening edge, so it does not show." },
      { kind: "toggle", key: "build.zipper", label: "Zipped top", show: isKind("handbag"), help: "A top panel with a zip joining both faces and the gusset ends; off, the bag gets a flap instead." },
      { kind: "number", key: "build.zipGauge", label: "Zip gauge", unit: "", min: 3, max: 5, step: 2, int: true, show: hasZip, help: "The zip's tooth size class, #3 (light) or #5 (standard); it sets the slot's width." },
      { kind: "number", key: "build.zipLen", label: "Zip opening", unit: "mm", min: 60, max: 800, step: 1, show: hasZip, help: "Length of the zip's opening; buy a zip at least 20 mm longer." },
      { kind: "number", key: "build.flap", label: "Flap", unit: "mm", min: 0, max: 400, step: 1, show: hasFlap, help: "How far the flap comes down the front; the back panel reaches over the top and becomes the flap." },
      { kind: "choice", key: "build.flapShape", shuffle: true, label: "Flap shape", show: hasFlap, help: "Rounded, straight or pointed flap end.", options: [{ v: "round", text: "Rounded" }, { v: "straight", text: "Straight" }, { v: "pointed", text: "Pointed" }] },
      { kind: "choice", key: "build.closure", label: "Closure", show: or(isFam("box", "folded"), isKind("sleeve")), help: "A magnetic clasp or snap on the flap or the top, or buckle straps on a flap.", options: [{ v: "none", text: "None" }, { v: "magnet", text: "Magnetic clasp" }, { v: "snap", text: "Snap" }, { v: "buckle", text: "Buckle straps" }] },
      { kind: "number", key: "build.handles", label: "Handles", unit: "", min: 0, max: 2, step: 1, int: true, show: hasHandles, help: "How many handles: none, one, or one on each side." },
      { kind: "number", key: "build.handleLen", label: "Handle length", unit: "mm", min: 80, max: 800, step: 1, show: (p) => hasHandles(p) && p.build.handles > 0, help: "Length of each handle piece, end to end." },
      { kind: "number", key: "build.handleW", label: "Handle width", unit: "mm", min: 10, max: 50, step: 1, show: (p) => hasHandles(p) && p.build.handles > 0, help: "Width of the handles." },
      { kind: "choice", key: "build.attach", label: "Handle fixing", show: (p) => isKind(...HANDLE_BAGS)(p) && p.build.handles > 0, help: "Two rivets at each end with a backing patch, or a box stitch with a cross through the panel.", options: [{ v: "rivets", text: "Rivets" }, { v: "box", text: "Box stitch" }] },
      { kind: "toggle", key: "build.strap", label: "Shoulder strap", show: hasStrap, help: "A strap on D-ring tabs, with a slider to adjust it." },
      { kind: "number", key: "build.strapLen", label: "Strap length", unit: "mm", min: 300, max: 2000, step: 1, show: (p) => (hasStrap(p) && p.build.strap) || p.product === "rolltop" || p.product === "convertible", help: "Length of the strap piece; the backpack's shoulder straps are cut at 60 % of it." },
      { kind: "number", key: "build.strapW", label: "Strap width", unit: "mm", min: 10, max: 50, step: 1, show: (p) => (hasStrap(p) && p.build.strap) || p.product === "rolltop" || p.product === "convertible", help: "Width of the straps and of the D-rings they need." },
      { kind: "toggle", key: "build.feet", label: "Bag feet", show: isFam("box", "wrap"), help: "Four feet set through the base and the stiffener." },
      { kind: "toggle", key: "build.reinforce", label: "Stiffener and patches", show: isFam("box", "wrap", "bucket"), help: "A leatherboard base stiffener and backing patches behind riveted handles." },
      { kind: "toggle", key: "build.pocket", label: "Slip pocket", show: isFam("box"), help: "A pocket stitched inside the back panel." },
      { kind: "number", key: "build.dividers", label: "Dividers", unit: "", min: 0, max: 4, step: 1, int: true, show: isKind("briefcase", "messenger", "laptop", "camera"), help: "Divider walls stitched into the gusset; for the camera bag, removable dividers on slotted rails." },
      { kind: "number", key: "build.compartments", label: "Compartments", unit: "", min: 1, max: 3, step: 1, int: true, show: isKind("satchel"), help: "Compartments, each with its own gusset, separated by middle panels; the satchel has at least two." },
      { kind: "number", key: "build.rollExt", label: "Roll-top extension", unit: "mm", min: 60, max: 300, step: 1, show: isKind("rolltop"), help: "How much taller the panels are than the bag, to roll down." },
      { kind: "number", key: "build.woodT", label: "Plywood thickness", unit: "mm", min: 2, max: 12, step: 0.5, show: isKind("hybrid"), help: "Thickness of the plywood end panels, cut from the second material." },
    ],
  },
  {
    id: "small", title: "Pockets and straps", open: true, show: or(isFam("strap"), isKind("bifold", "longwallet", "cardholder", "passport", "toolroll")),
    help: "Card pockets for small goods; length, width and holes for straps.",
    fields: [
      { kind: "number", key: "small.cards", label: "Pockets", unit: "", min: 1, max: 16, step: 1, int: true, show: isKind("bifold", "longwallet", "toolroll"), help: "Card pockets on each side of a wallet, or slots in a tool roll." },
      { kind: "number", key: "small.pocketH", label: "Pocket height", unit: "mm", min: 22, max: 300, step: 1, show: isKind("bifold", "longwallet", "cardholder", "passport", "toolroll"), help: "Height of the tallest pocket; the others step down from it." },
      { kind: "number", key: "small.length", label: "Length", unit: "mm", min: 80, max: 2500, step: 1, show: isFam("strap"), help: "For a belt or collar the size from the buckle's prong to the middle hole; for a watch strap the wrist; otherwise the strap's length." },
      { kind: "number", key: "small.width", label: "Width", unit: "mm", min: 8, max: 60, step: 1, show: (p) => fam(p) === "strap" && p.product !== "bagcharm", help: "Strap width; for a watch strap, the lug width." },
      { kind: "number", key: "small.holes", label: "Holes", unit: "", min: 1, max: 9, step: 1, int: true, show: isKind("belt", "collar", "watchstrap", "bracelet"), help: "Size holes (for a bracelet, snap positions)." },
      { kind: "number", key: "small.holePitch", label: "Hole spacing", unit: "mm", min: 5, max: 40, step: 1, show: isKind("belt", "collar", "watchstrap"), help: "Distance between the size holes." },
      { kind: "number", key: "small.taper", label: "Taper", unit: "", min: 0.6, max: 1, step: 0.01, show: isKind("watchstrap"), help: "The width at the buckle and tip as a fraction of the lug width (0.6 to 1)." },
    ],
  },
  {
    id: "stitch", title: "Stitching", open: false,
    help: "The stitch, its holes and what the laser does with them.",
    fields: [
      { kind: "choice", key: "stitch.type", shuffle: true, label: "Stitch", help: "Saddle stitch is the strongest by hand; lacing cuts slots for lace; double row adds a second row inside the first.", options: opts(STITCH_NAMES) },
      { kind: "number", key: "stitch.pitch", label: "Pitch", unit: "mm", min: 2, max: 10, step: 0.1, help: "Distance between hole centres; match it to your pricking irons (3.38, 3.85 and 4 mm are common)." },
      { kind: "number", key: "stitch.hole", label: "Hole size", unit: "mm", min: 0.6, max: 4, step: 0.1, help: "Round hole diameter, or the slit's length for slanted holes." },
      { kind: "choice", key: "stitch.shape", label: "Hole shape", help: "Round holes, or slanted slits like a diamond pricking iron's.", options: [{ v: "round", text: "Round" }, { v: "slanted", text: "Slanted" }] },
      { kind: "number", key: "stitch.edge", label: "Edge distance", unit: "mm", min: 2, max: 10, step: 0.1, help: "From the edge to the hole centres." },
      { kind: "number", key: "stitch.rowGap", label: "Row gap", unit: "mm", min: 2, max: 10, step: 0.1, show: (p) => p.stitch.type === "double", help: "Gap between the two rows of the double-row stitch." },
      { kind: "choice", key: "stitch.mode", label: "Cut file", help: "Laser-cut holes, laser-marked hole positions to punch by hand, or a printable hand-cutting template (no laser).", options: opts(CUT_MODES) },
    ],
  },
  {
    id: "hw", title: "Hardware", open: false,
    help: "Measure your own hardware and set its sizes here; the holes are cut from them.",
    fields: [
      { kind: "number", key: "hw.rivetHole", label: "Rivet post hole", unit: "mm", min: 1, max: 8, step: 0.1, help: "Hole for a rivet's post." },
      { kind: "number", key: "hw.rivetCap", label: "Rivet cap", unit: "mm", min: 4, max: 15, step: 0.5, help: "Cap diameter, for the clearance checks." },
      { kind: "number", key: "hw.snapHole", label: "Snap post hole", unit: "mm", min: 1, max: 8, step: 0.1, help: "Hole for a snap's post." },
      { kind: "number", key: "hw.snapCap", label: "Snap cap", unit: "mm", min: 6, max: 20, step: 0.5, help: "Snap cap diameter, for the clearance checks." },
      { kind: "number", key: "hw.magnet", label: "Magnetic clasp", unit: "mm", min: 10, max: 30, step: 0.5, help: "The clasp's diameter; its prong slits are set from it." },
      { kind: "number", key: "hw.grommetHole", label: "Grommet hole", unit: "mm", min: 3, max: 20, step: 0.5, help: "Hole for grommets and eyelets." },
      { kind: "number", key: "hw.screwHole", label: "Chicago screw hole", unit: "mm", min: 2, max: 8, step: 0.1, help: "Hole for a Chicago screw's barrel." },
      { kind: "number", key: "hw.footHole", label: "Bag foot hole", unit: "mm", min: 2, max: 8, step: 0.1, help: "Hole for a bag foot's prongs or post." },
    ],
  },
  {
    id: "decor", title: "Decoration", open: false,
    help: "HingeLab's own procedural patterns in the spirit of each tradition, kept clear of stitching and fittings.",
    fields: [
      { kind: "choice", key: "decor.style", shuffle: true, label: "Pattern", help: "The decorative pattern; each is an original procedural design, not a copy of any maker's.", options: opts(DECOR_NAMES) },
      { kind: "choice", key: "decor.mode", label: "Apply as", show: (p) => p.decor.style !== "none", help: "Cut through (perforate), engrave the surface, or score it.", options: [{ v: "perforate", text: "Perforate" }, { v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }] },
      { kind: "number", key: "decor.scale", label: "Pattern size", unit: "mm", min: 6, max: 60, step: 1, show: (p) => p.decor.style !== "none", help: "Size of one repeat of the pattern." },
      { kind: "number", key: "decor.bar", label: "Bar width", unit: "mm", min: 0.8, max: 5, step: 0.1, show: (p) => p.decor.style !== "none", help: "Leather left between perforations." },
      { kind: "number", key: "decor.margin", label: "Clearance", unit: "mm", min: 1, max: 20, step: 0.5, show: (p) => p.decor.style !== "none", help: "Space kept clear round stitch holes, fittings and edges." },
    ],
  },
  {
    id: "leather", title: "Material and safety", open: true,
    help: "The leather, and the confirmation a laser file needs.",
    fields: [
      {
        kind: "choice", key: "leather", label: "Leather",
        help: "PVC and unknown leatherette are never laser cut; every other leather needs its composition and the maker's laser guidance confirmed first.",
        options: LEATHERS.map((l) => ({ v: l.id, text: l.name, title: l.notes })),
        apply: (p, v) => ({ ...p, leather: v, verified: false, T: leatherOf(v).T, ...(p.product === "watchstrap" || p.product === "bracelet" ? { T: Math.min(leatherOf(v).T, 1.6) } : {}) }),
      },
      { kind: "toggle", key: "verified", label: "Laser use confirmed", show: (p) => leatherOf(p.leather).laser !== "blocked", help: "Turn on only when you have this leather's composition and its maker's guidance for laser processing, and a laser with extraction, filtration and fire watch." },
    ],
  },
];

/** Rail pictures: simple silhouettes of each product. */
function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key !== "product") return [];
  const solid = (cs: Contour[]) => [{ d: fitArt(cs, 38).join(" "), fill: true }];
  const band = (cx: number, cy: number, r: number, w: number, a0 = Math.PI, a1 = 2 * Math.PI): Contour => {
    const o: Contour = [];
    for (let i = 0; i <= 16; i++) { const a = a0 + ((a1 - a0) * i) / 16; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    for (let i = 16; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / 16; o.push([cx + (r - w) * Math.cos(a), cy + (r - w) * Math.sin(a)]); }
    return o;
  };
  const bag = (w: number, h: number, extra: Contour[] = []) => solid([roundRect(0, 44 - h, w, h, [2, 2, 6, 6]), ...extra]);
  const strap = (len: number, w: number, extra: Contour[] = []) => solid([roundRect(0, 20, len, w, [2, w / 2, w / 2, 2]), ...extra]);
  switch (v as ProductKind) {
    case "handbag": return solid([[[4, 18], [44, 18], [48, 44], [0, 44]], band(24, 18, 12, 3)]);
    case "tote": return solid([[[2, 14], [46, 14], [44, 44], [4, 44]], band(15, 14, 7, 2.5), band(33, 14, 7, 2.5)]);
    case "briefcase": return bag(48, 30, [band(24, 14, 7, 3), rect(20, 18, 8, 6)]);
    case "messenger": return bag(48, 34, [[[0, 10], [48, 10], [48, 30], [24, 34], [0, 30]], rect(0, 0, 3, 10), rect(45, 0, 3, 10)]);
    case "satchel": return bag(46, 30, [[[0, 14], [46, 14], [46, 30], [0, 30]], band(23, 14, 6, 2.5), rect(10, 26, 5, 10), rect(31, 26, 5, 10)]);
    case "camera": return bag(48, 32, [rect(0, 12, 48, 12), rect(14, 30, 2, 12), rect(32, 30, 2, 12)]);
    case "convertible": return bag(34, 40, [rect(36, 8, 3, 36), rect(42, 8, 3, 36), [[0, 4], [34, 4], [34, 22], [17, 26], [0, 22]]]);
    case "crossbody": return bag(34, 24, [[[0, 20], [34, 20], [34, 32], [17, 36], [0, 32]], [[2, 20], [17, 0], [32, 20], [30, 20], [17, 3], [4, 20]]]);
    case "phonebag": return bag(20, 34, [[[0, 10], [20, 10], [20, 22], [10, 26], [0, 22]], [[1, 10], [10, 0], [19, 10], [17, 10], [10, 3], [3, 10]]]);
    case "clutch": return solid([rect(0, 16, 48, 24), [[0, 16], [48, 16], [24, 32]]]);
    case "saddle": return solid([[[4, 6], [40, 6], [40, 26], ...Array.from({ length: 13 }, (_, i) => { const a = (Math.PI * i) / 12; return [22 + 18 * Math.cos(a), 26 + 18 * Math.sin(a)] as [number, number]; }), [4, 26]]]);
    case "doctor": return solid([[[8, 14], [40, 14], [48, 44], [0, 44]], band(24, 14, 9, 3), rect(6, 12, 36, 4)]);
    case "hybrid": return solid([rect(0, 14, 10, 30), rect(38, 14, 10, 30), rect(10, 18, 28, 26), band(24, 16, 9, 3)]);
    case "rolltop": return bag(32, 44, [rect(0, 6, 32, 6), rect(8, 0, 4, 22), rect(20, 0, 4, 22)]);
    case "waistbag": return solid([roundRect(8, 14, 32, 22, [10, 10, 10, 10]), rect(0, 22, 48, 5)]);
    case "laptop": return bag(48, 30, [rect(0, 14, 48, 14), rect(22, 26, 4, 8)]);
    case "duffel": return solid([roundRect(0, 18, 48, 26, [12, 12, 4, 4]), band(24, 18, 8, 3)]);
    case "toiletry": return solid([roundRect(4, 16, 40, 26, [10, 10, 4, 4]), rect(8, 18, 32, 2)]);
    case "penroll": return solid([roundRect(0, 18, 48, 14, [7, 7, 7, 7]), rect(4, 18, 40, 2)]);
    case "bucket": return solid([[[6, 10], [42, 10], [40, 44], [8, 44]], circle(14, 14, 2), circle(24, 14, 2), circle(34, 14, 2), band(24, 10, 16, 2)]);
    case "sculpt": return solid([[[0, 16], [48, 16], [40, 44], [8, 44]], [[0, 16], [12, 28], [8, 44]], [[48, 16], [36, 28], [40, 44]], band(24, 16, 10, 3)]);
    case "bifold": return solid([rect(0, 10, 48, 26), rect(23.5, 10, 1, 26).reverse() as Contour, rect(4, 24, 18, 2), rect(26, 24, 18, 2)]);
    case "cardholder": return solid([roundRect(6, 4, 36, 40, [3, 3, 3, 3]), rect(6, 22, 36, 2)]);
    case "passport": return solid([roundRect(2, 4, 44, 36, [3, 3, 3, 3])]);
    case "longwallet": return solid([roundRect(0, 8, 48, 30, [3, 3, 3, 3]), rect(4, 18, 40, 2), rect(4, 26, 40, 2)]);
    case "sleeve": return solid([roundRect(6, 0, 36, 44, [10, 10, 3, 3])]);
    case "glasses": return solid([roundRect(4, 14, 40, 20, [10, 10, 10, 10])]);
    case "notebook": return solid([roundRect(8, 0, 32, 44, [2, 2, 2, 2]), rect(36, 18, 4, 8)]);
    case "toolroll": return solid([roundRect(0, 6, 48, 34, [3, 3, 3, 3]), rect(46, 20, 8, 3)]);
    case "coaster": return solid([circle(24, 22, 20)]);
    case "tray": return solid([[[6, 12], [42, 12], [48, 40], [0, 40]]]);
    case "luggagetag": return solid([roundRect(10, 6, 28, 38, [4, 4, 4, 4]), rect(20, 0, 8, 8)]);
    case "coinpurse": return solid([roundRect(8, 12, 32, 26, [8, 8, 8, 8])]);
    case "belt": return strap(48, 8, [rect(0, 16, 10, 16)]);
    case "watchstrap": return solid([rect(18, 0, 12, 44), roundRect(14, 16, 20, 12, [3, 3, 3, 3])]);
    case "keyfob": return solid([roundRect(16, 12, 16, 32, [8, 8, 8, 8]), circle(24, 8, 7)]);
    case "bracelet": return solid([band(24, 24, 18, 5, 0, 2 * Math.PI)]);
    case "collar": return strap(44, 8, [rect(0, 16, 8, 16), band(40, 32, 6, 2, 0, Math.PI)]);
    case "leash": return solid([band(10, 12, 10, 3, 0, 2 * Math.PI), rect(18, 10, 26, 4), rect(44, 8, 4, 8)]);
    case "shoulderstrap": return strap(48, 6, [rect(0, 14, 4, 18), rect(44, 14, 4, 18)]);
    case "bagcharm": return solid([circle(24, 28, 14), rect(22, 0, 4, 16)]);
  }
  return [];
}

const fileTail = (p: LeatherParams) => (fam(p) === "strap" ? `${Math.round(p.small.length)}mm` : `${Math.round(p.size.width)}x${Math.round(p.size.height)}`);

export const LEATHER: GeneratorDef<LeatherParams> = {
  id: "leather",
  name: "Leather Studio",
  version: LEATHER_VERSION,
  defaults: () => mergeLeather({}),
  merge: mergeLeather,
  sections,
  presets: LEATHER_PRESETS,
  build: buildLeather,
  check: (p, out) => checkLeather(p, out as LeatherOutput),
  art,
  assemblyPlan: (_p, out) => genericPlan(out),
  fileName: (p) => namedFile("leather-" + p.product, p.name, fileTail(p)),
  summary: (p) => `${PRODUCTS[p.product].name}, ${fam(p) === "strap" ? `${Math.round(p.small.length)} mm` : `${Math.round(p.size.width)} × ${Math.round(p.size.height)} mm`}, ${leatherOf(p.leather).name}`,
  help: {
    intro: [
      "Leather Studio makes parametric leather patterns: bags, small leather goods and straps built from real pattern pieces. Every seam's two sides get the same number of stitch holes, placed by arc length along each side's stitch line, so a curved face and the straight gusset it joins line up hole for hole.",
      `It has ${Object.keys(PRODUCTS).length} products, from a structured handbag with a zipped top, an executive briefcase, a roll-top backpack, a weekender duffel, a camera bag with removable dividers, a convertible crossbody backpack, a doctor bag with frame channels, a multi-gusset satchel, a wood-and-leather bag and a sculptural folded bag, to wallets, card holders, covers, cases, trays, belts, watch straps and pet goods.`,
      "Each pattern lists its seams with hole counts, a thread estimate, the leather area and the hardware (rivets, snaps, magnetic clasps, buckles, D-rings, zips, Chicago screws, feet), and the assembly steps. Hardware holes are cut from the sizes you measure and enter.",
      "Laser safety: no leather is assumed safe for the laser. PVC, vinyl and unknown leatherette are never laser cut. Every other material needs its composition and the maker's laser guidance confirmed first, and the laser needs extraction, filtration and someone watching it; until then only the hand-cutting template can be exported. No laser settings are given: find them by testing on an offcut.",
      "The 3D view is a simplified preview of the panels folded into place: leather drape, stretch and stitching are not simulated, and flat goods and straps are shown laid out flat. Make a test piece before cutting good leather; nothing here has been checked on a real build.",
      "The decorative patterns (Persian geometric and floral, boteh, Moroccan, Islamic star, Japanese, Art Deco, Art Nouveau, Western, Scandinavian, European, Celtic, botanical, modern, contemporary and a parametric perforation) are HingeLab's own procedural designs in the spirit of each tradition; none copies a maker's design.",
    ],
    tips: [
      "Measure the leather with calipers and set its thickness: the folds, keepers and loops are sized from it.",
      "Set the pitch to your pricking irons, so laser holes and hand-punched ones match.",
      "Cut a test strip of stitch holes first and check them against your needle and thread.",
      "Use Laser-marked stitch guide when you would rather punch the holes yourself.",
      "Long straps are usually longer than the bed: cut them with a strap cutter and print the hand-cutting template for the ends.",
    ],
    keywords: ["leather", "leathercraft", "bag", "handbag", "tote", "briefcase", "backpack", "duffel", "satchel", "wallet", "card holder", "passport", "belt", "watch strap", "stitching", "saddle stitch", "pattern", "gusset", "rivet", "snap", "buckle", "zip", "pet collar", "lead", "leash", "coaster", "tray", "lacing"],
  },
};

export { LEATHER_DEFAULTS };
