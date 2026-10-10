import type { GenPreset } from "../types";
import type { ClockParams } from "./params";

export const CLOCK_PRESETS: GenPreset<ClockParams>[] = [
  { id: "wall-roman", name: "Wall clock", note: "Roman numerals on a raised ring", params: { name: "Wall clock" } },
  {
    id: "desk-stand", name: "Desk clock with stand", note: "Slot-in stand, no glue needed",
    params: {
      name: "Desk clock",
      face: { size: 180, layers: "single" },
      markers: { style: "mixed", numerals: "arabic", size: 16, inset: 6, tickLength: 8, tickWidth: 2.5 },
      hands: { style: "baton", hour: 45, minute: 62, width: 6, tail: 12 },
      hanger: "none", stand: true,
    },
  },
  {
    id: "sunburst", name: "Sunburst", note: "Mid-century rays, dot markers",
    params: {
      name: "Sunburst clock",
      face: { shape: "sunburst", size: 380, rays: 24, depth: 50, corner: 2, layers: "single" },
      markers: { style: "dots", dot: 8, inset: 10, minutes: false },
      hands: { style: "leaf", hour: 70, minute: 100, width: 12, tail: 18 },
      hanger: "none",
    },
  },
  {
    id: "minimal", name: "Minimal", note: "Twelve bold ticks, slim hands",
    params: {
      name: "Minimal clock",
      face: { size: 260, layers: "single" },
      markers: { style: "ticks", minutes: false, tickLength: 14, tickWidth: 4, inset: 8 },
      hands: { style: "baton", hour: 70, minute: 100, width: 5, tail: 14 },
      hanger: "none",
    },
  },
  {
    id: "gear", name: "Gear clock", note: "Cut-through ticks show the back plate",
    params: {
      name: "Gear clock",
      face: { shape: "gear", size: 320, rays: 16, depth: 16, layers: "ring", ring: 36 },
      markers: { style: "ticks", minutes: true, cut: true, tickLength: 10, tickWidth: 3, inset: 8 },
      hands: { style: "arrow", hour: 65, minute: 95, width: 10, tail: 18 },
    },
  },
  {
    id: "persian", name: "Persian numerals", note: "۱۲ ۳ ۶ ۹ in Vazirmatn",
    params: {
      name: "Persian clock",
      face: { ring: 42 },
      markers: { style: "numerals", numerals: "persian", fontId: "vazirmatn", size: 24, inset: 8 },
      hands: { style: "leaf", hour: 70, minute: 100, width: 12, tail: 18 },
    },
  },
  {
    id: "square-layered", name: "Square, three layers", note: "Back, ring and centre disc",
    params: {
      name: "Square clock",
      face: { shape: "square", size: 280, corner: 24, layers: "stack", ring: 30, centre: 70 },
      markers: { style: "dots", dot: 10, inset: 12, minutes: false },
      hands: { style: "classic", hour: 70, minute: 100, width: 14, tail: 18 },
      movement: { id: "m8-8" },
    },
  },
  {
    id: "hexagon-kids", name: "Hexagon, kids", note: "Big rounded numbers",
    params: {
      name: "Kids clock",
      face: { shape: "polygon", sides: 6, size: 300, corner: 10, layers: "single" },
      markers: { style: "numerals", numerals: "arabic", fontId: "fredoka", size: 26, inset: 10, minutes: false },
      hands: { style: "arrow", hour: 65, minute: 95, width: 12, tail: 16 },
    },
  },
  {
    id: "station", name: "Station clock", note: "Numerals follow the dial, name along the top",
    params: {
      name: "Station clock",
      face: { size: 320, layers: "single" },
      markers: { style: "numerals", numerals: "roman", fontId: "archivo-black", size: 22, inset: 10, minutes: true, follow: true },
      inscription: { text: "GRAND CENTRAL", at: "top", fontId: "archivo-black", size: 9, gap: 8 },
      hands: { style: "spade", hour: 70, minute: 105, width: 10, tail: 20 },
    },
  },
];
