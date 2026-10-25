import { SHEET_DEFAULTS, type GenPreset } from "../types";
import type { PopupParams } from "./params";

/** Built-in designs: only what differs from the defaults. Every one stays fully editable. */
export const POPUP_PRESETS: GenPreset<PopupParams>[] = [
  // Kitchen and dining
  {
    id: "classic-bowl", name: "Classic pop-up bowl", note: "Nine round rings on four slotted arms",
    params: { name: "Pop-up bowl" },
  },
  {
    id: "spiral-trivet-bowl", name: "Spiral trivet bowl", note: "A trivet that lifts into a spiral fruit bowl", pro: true,
    params: { name: "Spiral trivet bowl", shape: { kind: "circle", size: 220 }, cut: { pattern: "spiral", rings: 8, centre: 60 }, form: { depth: 50, profile: "round" }, support: { arms: 4, turn: 45 } },
  },
  {
    id: "hexagon-fruit-basket", name: "Hexagon fruit basket", note: "Six-sided rings on six arms", pro: true,
    params: { name: "Hexagon fruit basket", shape: { kind: "polygon", size: 300, sides: 6, corner: 6 }, cut: { rings: 9, centre: 80 }, form: { depth: 80, profile: "soft" }, support: { arms: 6, turn: 0 } },
  },
  {
    id: "bread-basket", name: "Bread basket with handles", note: "An oval basket with a flat bottom and two handles", pro: true,
    params: {
      name: "Bread basket", shape: { kind: "ellipse", size: 320, height: 220 }, cut: { rings: 8, centre: 70 },
      form: { depth: 70, profile: "flat", flat: 40 }, support: { arms: 4, turn: 0, handles: true, handleH: 45 },
    },
  },
  {
    id: "nut-bowl", name: "Nut and snack bowl", note: "A small round bowl for the table",
    params: { name: "Snack bowl", shape: { kind: "circle", size: 180 }, cut: { rings: 7, centre: 50 }, form: { depth: 40, profile: "round" } },
  },
  {
    id: "two-tier-stand", name: "Two-tier fruit stand", note: "Two flat levels stepped up to the centre", pro: true,
    params: { name: "Two-tier fruit stand", mode: "tiered", shape: { kind: "circle", size: 320 }, cut: { rings: 10, centre: 90 }, form: { depth: 140, profile: "stepped", tiers: 2 }, support: { arms: 4 } },
  },
  {
    id: "cupcake-tower", name: "Cupcake tower", note: "Three tiers for cupcakes, all from one sheet", pro: true,
    params: { name: "Cupcake tower", mode: "tiered", shape: { kind: "circle", size: 360 }, cut: { rings: 12, centre: 90 }, form: { depth: 210, profile: "stepped", tiers: 3 }, support: { arms: 6 } },
  },
  // Seasonal
  {
    id: "spiral-tree", name: "Spiral Christmas tree", note: "A spiral that lifts into a tree, with a star on top", pro: true,
    params: {
      name: "Spiral Christmas tree", mode: "tower", shape: { kind: "circle", size: 260 }, cut: { pattern: "spiral", rings: 10, centre: 44 },
      form: { depth: 260, profile: "straight" }, support: { arms: 4, base: 6 }, extras: { finial: "star", finialSize: 56 },
    },
  },
  {
    id: "snowflake-tree", name: "Snowflake tree", note: "Snowflake-shaped rings stacked into a tree", pro: true,
    params: {
      name: "Snowflake tree", mode: "tower", shape: { kind: "snowflake", size: 280, depth: 18 }, cut: { rings: 9, centre: 50 },
      form: { depth: 240, profile: "straight" }, support: { arms: 6, turn: 0, base: 6 }, extras: { finial: "star", finialSize: 50 },
    },
  },
  {
    id: "spiral-ornament", name: "Spiral ornaments, set of six", note: "Little spirals that drop open when hung", pro: true,
    params: {
      name: "Spiral ornament", mode: "hanging", shape: { kind: "circle", size: 100 }, cut: { pattern: "spiral", rings: 6, centre: 22 },
      form: { depth: 70, profile: "bell" }, support: { kind: "cords", cords: 3, cordHole: 1.5, base: 0 }, extras: { loop: true }, sheet: { ...SHEET_DEFAULTS, copies: 6 },
    },
  },
  {
    id: "snowflake-bauble", name: "Snowflake bauble", note: "A snowflake that hangs open into a bell", pro: true,
    params: {
      name: "Snowflake bauble", mode: "hanging", shape: { kind: "snowflake", size: 120, depth: 14 }, cut: { rings: 6, centre: 26 },
      form: { depth: 60, profile: "bell" }, support: { kind: "cords", cords: 3, cordHole: 1.5, turn: 0, base: 0 }, extras: { loop: true },
    },
  },
  {
    id: "pumpkin-basket", name: "Pumpkin candy basket", note: "A lobed pumpkin bowl with two handles for treats", pro: true,
    params: {
      name: "Pumpkin candy basket", shape: { kind: "pumpkin", size: 250, petals: 7, depth: 16 }, cut: { rings: 8, centre: 70 },
      form: { depth: 70, profile: "soft" }, support: { arms: 4, turn: 0, handles: true, handleH: 40 },
    },
  },
  {
    id: "heart-basket", name: "Heart Valentine basket", note: "Heart-shaped rings with Love engraved in the centre", pro: true,
    params: {
      name: "Heart basket", shape: { kind: "heart", size: 240, height: 220 }, cut: { rings: 7, centre: 56 },
      form: { depth: 55, profile: "round" }, support: { arms: 4, turn: 0 }, engrave: { text: "Love", fontId: "pacifico", size: 11 },
    },
  },
  {
    id: "spring-tray", name: "Spring blossom tray", note: "A flower-shaped tray with a flat middle and a raised rim", pro: true,
    params: {
      name: "Spring blossom tray", shape: { kind: "flower", size: 320, petals: 8, depth: 14 }, cut: { rings: 7, centre: 120 },
      form: { depth: 35, profile: "flat", flat: 55 }, support: { arms: 8, turn: 0 }, engrave: { rim: "Happy Spring", rimSize: 8, fontId: "dancing-script", motif: "flower", motifSize: 40 },
    },
  },
  {
    id: "ramadan-dates", name: "Ramadan dates bowl", note: "An eight-sided bowl with a crescent and star", pro: true,
    params: {
      name: "Ramadan dates bowl", shape: { kind: "polygon", size: 260, sides: 8, corner: 4 }, cut: { rings: 8, centre: 90 },
      form: { depth: 50, profile: "round" }, support: { arms: 8, turn: 22.5 }, engrave: { motif: "moonstar", motifSize: 46, rim: "Ramadan Kareem", rimSize: 7, fontId: "cinzel" },
    },
  },
  {
    id: "eid-sweets", name: "Eid sweets bowl", note: "An eight-pointed star bowl with Eid Mubarak round the rim", pro: true,
    params: {
      name: "Eid sweets bowl", shape: { kind: "star", size: 290, points: 8, inner: 74, corner: 6 }, cut: { rings: 8, centre: 90 },
      form: { depth: 50, profile: "soft" }, support: { arms: 8, turn: 0 }, engrave: { rim: "Eid Mubarak", rimSize: 7, fontId: "cinzel", motif: "lantern", motifSize: 40 },
    },
  },
  // Lighting
  {
    id: "spiral-pendant", name: "Scandinavian spiral pendant", note: "A hanging spiral shade with an E27 lamp ring", pro: true,
    params: {
      name: "Spiral pendant", mode: "hanging", shape: { kind: "circle", size: 380 }, cut: { pattern: "spiral", rings: 12, centre: 80 },
      form: { depth: 260, profile: "bell" }, support: { kind: "cords", cords: 3, base: 0 }, extras: { lamp: "e27" },
    },
  },
  {
    id: "bell-pendant", name: "Bell pendant", note: "Round rings hanging into a bell shade", pro: true,
    params: {
      name: "Bell pendant", mode: "hanging", shape: { kind: "circle", size: 340 }, cut: { rings: 10, centre: 80 },
      form: { depth: 200, profile: "bell" }, support: { kind: "cords", cords: 4, base: 0 }, extras: { lamp: "e27" },
    },
  },
  {
    id: "table-shade", name: "Table lamp shade", note: "A soft dome shade for an E14 table lamp", pro: true,
    params: {
      name: "Table lamp shade", mode: "hanging", shape: { kind: "circle", size: 280 }, cut: { rings: 9, centre: 70 },
      form: { depth: 140, profile: "soft" }, support: { kind: "cords", cords: 3, base: 0 }, extras: { lamp: "e14" },
    },
  },
  {
    id: "tealight-holder", name: "Spiral tealight holder", note: "A small spiral dish round a tealight", pro: true,
    params: {
      name: "Tealight holder", shape: { kind: "circle", size: 170 }, cut: { pattern: "spiral", rings: 6, centre: 70 },
      form: { depth: 40, profile: "round" }, support: { arms: 4 }, extras: { tealight: true },
    },
  },
  // Home and plants
  {
    id: "plant-hanger", name: "Hanging plant holder", note: "A basket for a small pot, hung on three cords", pro: true,
    params: {
      name: "Hanging plant holder", mode: "hanging", shape: { kind: "circle", size: 260 }, cut: { rings: 7, centre: 110 },
      form: { depth: 110, profile: "round", invert: true }, support: { kind: "cords", cords: 3, base: 0 },
    },
  },
  {
    id: "vase-sleeve", name: "Vase sleeve", note: "Rings that rise round an 80 mm jar or vase",
    params: {
      name: "Vase sleeve", mode: "sleeve", shape: { kind: "circle", size: 210 }, cut: { rings: 6, style: "round" },
      form: { depth: 120, profile: "straight" }, support: { arms: 4 }, extras: { object: 80, clear: 3 },
    },
  },
  {
    id: "pagoda", name: "Pagoda tower", note: "Five square levels with a point on top", pro: true,
    params: {
      name: "Pagoda tower", mode: "tower", shape: { kind: "rounded", size: 260, height: 260, corner: 16 }, cut: { rings: 10, centre: 50 },
      form: { depth: 200, profile: "stepped", tiers: 5 }, support: { arms: 4, turn: 0, base: 6 }, extras: { finial: "point", finialSize: 50 },
    },
  },
  {
    id: "pyramid", name: "Pyramid", note: "Square rings stacked into a stepped pyramid", pro: true,
    params: {
      name: "Pyramid", mode: "tower", shape: { kind: "polygon", size: 270, sides: 4, corner: 2 }, cut: { rings: 10, centre: 44 },
      form: { depth: 150, profile: "straight" }, support: { arms: 4, turn: 45, base: 6 },
    },
  },
  // Gifts and office
  {
    id: "monogram-bowl", name: "Monogram key bowl", note: "A shallow catch-all with a big initial in the centre", pro: true,
    params: {
      name: "Monogram key bowl", shape: { kind: "rounded", size: 200, height: 200, corner: 36 }, cut: { rings: 6, centre: 80 },
      form: { depth: 35, profile: "round" }, support: { arms: 4, turn: 0 }, engrave: { text: "A", fontId: "cinzel", size: 34 },
    },
  },
  {
    id: "wedding-favour", name: "Wedding favour bowl", note: "Small bowls with the couple's names, one per guest list line", pro: true,
    params: {
      name: "Wedding favour bowl", shape: { kind: "circle", size: 150 }, cut: { rings: 6, centre: 70 },
      form: { depth: 32, profile: "round" }, support: { arms: 4 }, engrave: { text: "Emma & Liam", fontId: "great-vibes", size: 9 },
    },
  },
  {
    id: "mandala-catchall", name: "Mandala catch-all", note: "A twelve-petal dish with scalloped rings", pro: true,
    params: {
      name: "Mandala catch-all", shape: { kind: "flower", size: 230, petals: 12, depth: 12 }, cut: { rings: 7, centre: 60, edge: "scallop", amp: 1.6, waves: 24 },
      form: { depth: 40, profile: "round" }, support: { arms: 6, turn: 0 }, engrave: { motif: "sun", motifSize: 34 },
    },
  },
  {
    id: "nursery-mobile", name: "Kids nursery mobile", note: "A star that hangs open into a gentle spiral", pro: true,
    params: {
      name: "Nursery mobile", mode: "hanging", shape: { kind: "star", size: 300, points: 5, inner: 62, corner: 6 }, cut: { rings: 8, centre: 40 },
      form: { depth: 150, profile: "bell" }, support: { kind: "cords", cords: 5, turn: 0, base: 0 }, extras: { loop: true },
    },
  },
  {
    id: "saw-bowl", name: "Scroll-saw spiral bowl", note: "One angled spiral cut in a 19 mm board, no arms", pro: true,
    params: {
      name: "Scroll-saw bowl", material: "custom", T: 19, K: 0.5, shape: { kind: "circle", size: 250 }, cut: { pattern: "spiral", rings: 9, centre: 50 },
      form: { depth: 80, profile: "round" }, support: { kind: "saw", blade: 0.6, hold: false },
    },
  },
];
