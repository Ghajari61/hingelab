import type { GenPreset } from "../types";
import type { TablenumParams } from "./params";

export const TABLENUM_PRESETS: GenPreset<TablenumParams>[] = [
  {"id": "studio-cafe-numbers", "name": "Cafe counter numbers", "note": "Six bold counter numbers in single-layer slotted bases.", "params": {"name": "Cafe counter numbers", "plate": {"shape": "rounded", "pad": 12, "corner": 6}, "text": {"label": "", "fontId": "bebas-neue", "size": 64}, "border": {"kind": "none"}, "base": {"layers": 1, "depth": 50}, "batch": {"from": 1, "to": 6}}},
  {"id": "studio-exhibition-labels", "name": "Exhibition table labels", "note": "Eight hexagonal EXHIBIT labels with 55 mm bases.", "params": {"name": "Exhibition table labels", "plate": {"shape": "hexagon", "pad": 10}, "text": {"label": "EXHIBIT", "labelFont": "bebas-neue", "labelSize": 12, "fontId": "archivo-black", "size": 52}, "border": {"kind": "score", "inset": 4}, "base": {"layers": 1, "depth": 55}, "batch": {"from": 1, "to": 8}}},
  {"id": "studio-banquet-arches", "name": "Banquet arches", "note": "Ten arch-shaped banquet numbers with deeper 60 mm bases.", "params": {"name": "Banquet arches", "text": {"fontId": "pacifico", "size": 62}, "batch": {"from": 1, "to": 10}, "base": {"depth": 60}}},
  {
    id: "wedding-arch", name: "Wedding arch", note: "Script Table and numbers on arches in stepped bases",
    params: { name: "Wedding table numbers", text: { fontId: "pacifico", size: 56 } },
  },
  {
    id: "number-stand", name: "Number stand", note: "Big condensed numbers on simple stands",
    params: {
      name: "Restaurant table numbers", plate: { shape: "rounded", pad: 12, corner: 6 }, text: { label: "", fontId: "bebas-neue", size: 80 },
      border: { kind: "none" }, base: { layers: 1, depth: 45 },
    },
  },
  {
    id: "round-acrylic", name: "Round acrylic", note: "Gold mirror numbers on clear acrylic discs", pro: true,
    params: {
      name: "Acrylic table numbers", material: "acr3", T: 3, K: 0.1, batch: { from: 1, to: 4 },
      plate: { shape: "circle", pad: 10 }, text: { label: "Table", labelFont: "pacifico", fontId: "archivo-black", size: 52, mark: "raised" },
      border: { kind: "none" }, base: { layers: 2, step: 0, depth: 50 }, mat: { mat2: "acrylic-gold", T2: 3 },
    },
  },
  {
    id: "tent-card", name: "Tent card", note: "Folds on a living hinge and reads from both sides",
    params: {
      name: "Tent table numbers", batch: { from: 1, to: 4 }, build: { kind: "tent" }, plate: { shape: "rounded", pad: 12, corner: 6 },
      text: { label: "Table", labelFont: "pacifico", fontId: "archivo-black", size: 44 }, border: { kind: "score", inset: 4 },
    },
  },
  {
    id: "hexagon-modern", name: "Modern hexagon", note: "Hexagon plates with a capital label",
    params: {
      name: "Hexagon table numbers", plate: { shape: "hexagon", pad: 10 }, text: { label: "TABLE", labelFont: "bebas-neue", labelSize: 16, fontId: "archivo-black", size: 48 },
      border: { kind: "score", inset: 4 }, base: { layers: 1, depth: 50 },
    },
  },
  {
    id: "restaurant-plaque", name: "Restaurant plaques", note: "Small plaques with a hole, numbered 01 to 08",
    params: {
      name: "Restaurant plaques", batch: { from: 1, to: 8, pad: 2 }, build: { kind: "plaque" }, plate: { shape: "rounded", pad: 8, corner: 4 },
      text: { label: "", fontId: "bebas-neue", size: 40 }, border: { kind: "none" }, plaque: { holes: "top" },
    },
  },
  {
    id: "named-tables", name: "Named tables", note: "Flower names instead of numbers",
    params: {
      name: "Named tables", batch: { mode: "list", list: "Rose\nLily\nTulip\nDaisy" }, plate: { shape: "rounded", pad: 12, corner: 8 },
      text: { label: "", fontId: "pacifico", size: 30 }, motif: { kind: "flower", place: "above", size: 26, gap: 4 }, base: { layers: 1, depth: 45 },
    },
  },
  {
    id: "family-names", name: "Family tables", note: "A number and the family seated there",
    params: {
      name: "Family table numbers", batch: { from: 1, to: 4, names: "Smith family\nJones family\nGarcia family\nChen family" },
      plate: { shape: "rounded", pad: 12, corner: 6 }, text: { label: "", fontId: "archivo-black", size: 52, labelFont: "pacifico", nameSize: 11 },
      border: { kind: "score", inset: 4 },
    },
  },
  {
    id: "double-sided", name: "Double-sided", note: "Two plates back to back in one slot", pro: true,
    params: {
      name: "Double-sided table numbers", batch: { from: 1, to: 4 }, build: { double: true }, plate: { shape: "rect", pad: 12, corner: 3 },
      text: { label: "Table", labelFont: "bebas-neue", labelSize: 16, fontId: "bebas-neue", size: 70 }, base: { layers: 2, step: 3 },
    },
  },
  {
    id: "heart-love", name: "Hearts", note: "Heart plates with little hearts beside the number",
    params: {
      name: "Heart table numbers", batch: { from: 1, to: 4 }, plate: { shape: "heart", pad: 6 },
      text: { label: "", fontId: "pacifico", size: 44 }, motif: { kind: "heart", place: "both", size: 14, gap: 3 }, border: { kind: "none" }, base: { layers: 1, depth: 50 },
    },
  },
  {
    id: "kids-party", name: "Kids party", note: "Clouds with balloons and a rounded font",
    params: {
      name: "Kids party tables", batch: { from: 1, to: 4 }, plate: { shape: "cloud", pad: 16 },
      text: { label: "Table", labelFont: "fredoka", labelSize: 16, fontId: "fredoka", size: 48 }, motif: { kind: "balloons", place: "above", size: 28, gap: 3 },
      border: { kind: "none" }, base: { layers: 1, depth: 50 },
    },
  },
  {
    id: "vintage-scallop", name: "Vintage scallop", note: "Scalloped plates with an engraved border",
    params: {
      name: "Vintage table numbers", batch: { from: 1, to: 4 }, plate: { shape: "scalloped", pad: 12 },
      text: { label: "No.", labelFont: "pacifico", labelSize: 16, labelBelow: false, fontId: "baloo2", size: 48 }, border: { kind: "engrave", inset: 6 },
    },
  },
  {
    id: "christmas-tree", name: "Christmas dinner", note: "A tree over each number",
    params: {
      name: "Christmas table numbers", batch: { from: 1, to: 4 }, plate: { shape: "arch", pad: 12 },
      text: { label: "", fontId: "pacifico", size: 48 }, motif: { kind: "tree", place: "above", size: 34, gap: 4 }, border: { kind: "score", inset: 4 },
    },
  },
  {
    id: "banquet-arch", name: "Banquet arch", note: "Arched wedding numbers from 1 to 12, scored border",
    params: {
      name: "Banquet table numbers", batch: { from: 1, to: 12 }, plate: { shape: "arch", pad: 14, corner: 8 },
      text: { label: "Table", labelFont: "cinzel", fontId: "cinzel", size: 44 }, border: { kind: "score", inset: 5 },
    },
  },
  {
    id: "bistro-circle", name: "Bistro circle", note: "Bold round cafe numbers from 1 to 12",
    params: {
      name: "Bistro table numbers", batch: { from: 1, to: 12 }, plate: { shape: "circle", pad: 12, corner: 0 },
      text: { label: "No.", labelFont: "bebas-neue", fontId: "bebas-neue", size: 52 }, border: { kind: "engrave", inset: 6 },
    },
  },
  {
    id: "persian-miz", name: "Persian table cards", note: "Scalloped plates labelled میز, numbers 1 to 12",
    params: {
      name: "Persian table numbers", batch: { from: 1, to: 12 }, plate: { shape: "scalloped", pad: 14, corner: 8 },
      text: { label: "میز", labelFont: "vazirmatn", fontId: "vazirmatn", size: 40 }, border: { kind: "score", inset: 6 },
    },
  },
  {
    id: "garden-hexagon", name: "Garden hexagon", note: "Hexagon plates for an outdoor reception, 1 to 10",
    params: {
      name: "Garden table numbers", batch: { from: 1, to: 10 }, plate: { shape: "hexagon", pad: 14, corner: 4 },
      text: { label: "Table", labelFont: "montserrat", fontId: "montserrat", size: 38 }, border: { kind: "none" },
    },
  },
  {
    id: "olive-grove", name: "Olive grove", note: "Serif numbers with an olive branch, 1 to 12",
    params: {
      name: "Olive table numbers", batch: { from: 1, to: 12 }, plate: { shape: "arch", pad: 14, corner: 6 },
      text: { label: "Table", labelFont: "playfair-display", fontId: "playfair-display", size: 40 }, motif: { kind: "olive", place: "above", size: 24, gap: 4 }, border: { kind: "score", inset: 5 },
    },
  },
  {
    id: "compass-voyage", name: "Voyage", note: "Compass rose numbers for a travel-themed wedding, 1 to 10",
    params: {
      name: "Voyage table numbers", batch: { from: 1, to: 10 }, plate: { shape: "circle", pad: 14, corner: 6 },
      text: { label: "Table", labelFont: "cinzel", fontId: "cinzel", size: 36 }, motif: { kind: "compass", place: "above", size: 26, gap: 4 }, border: { kind: "score", inset: 5 },
    },
  },
  {
    id: "qr-menu-tables", name: "Table numbers with menu QR", note: "Each table's own QR code (its number is in the link) under the number, in a slotted base",
    params: {
      name: "Menu QR table numbers",
      plate: { shape: "rounded", pad: 12, corner: 8 },
      text: { label: "Table", labelFont: "fredoka", labelSize: 12, fontId: "archivo-black", size: 44 },
      border: { kind: "none" },
      base: { layers: 2, depth: 70 },
      batch: { from: 1, to: 12 },
      qr: { on: true, url: "example.com/menu?table={n}", size: 36, style: "rounded" },
    },
  },
];
