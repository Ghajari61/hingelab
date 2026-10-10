import type { GenPreset } from "../types";
import type { PuzzleParams } from "./params";

export const PUZZLE_PRESETS: GenPreset<PuzzleParams>[] = [
  {
    id: "kids-12", name: "Kids 12", note: "12 chunky pieces in a tray, 200 × 150 mm",
    params: {
      name: "Kids puzzle", shape: { kind: "rect", width: 200, height: 150, corner: 10 },
      pieces: { auto: true, count: 12 }, tabs: { style: "kids", size: 24 }, frame: { kind: "tray", border: 15, corner: 14 },
    },
  },
  {
    id: "photo-100", name: "Photo 100", note: "100 pieces, 300 × 200 mm, with your picture engraved", pro: true,
    params: {
      name: "Photo puzzle", shape: { kind: "rect", width: 300, height: 200 },
      pieces: { auto: true, count: 100 }, tabs: { style: "classic", size: 20, jitter: 5 }, engrave: { kind: "image" },
    },
  },
  {
    id: "heart-24", name: "Heart 24", note: "24 pieces in a 240 mm heart",
    params: {
      name: "Heart puzzle", shape: { kind: "heart", width: 240, height: 216 },
      pieces: { auto: true, count: 24 }, tabs: { style: "classic", size: 22, seed: 3 },
    },
  },
  {
    id: "round-36", name: "Round 36", note: "36 pieces in a 280 mm circle",
    params: {
      name: "Round puzzle", shape: { kind: "circle", width: 280, height: 280 },
      pieces: { auto: true, count: 36 }, tabs: { style: "classic", size: 20, seed: 7 },
    },
  },
  {
    id: "name-puzzle", name: "Name puzzle", note: "A child's name engraved across 8 large pieces",
    params: {
      name: "Name puzzle", shape: { kind: "rect", width: 260, height: 120, corner: 12 },
      pieces: { auto: true, count: 8 }, tabs: { style: "kids", size: 24 },
      engrave: { kind: "text", text: "MIA", fontId: "fredoka", size: 60 },
    },
  },
  {
    id: "first-4", name: "First puzzle", note: "4 straight-cut pieces in a frame for toddlers",
    params: {
      name: "First puzzle", shape: { kind: "rect", width: 150, height: 150, corner: 12 },
      pieces: { auto: false, cols: 2, rows: 2 }, tabs: { style: "straight", jitter: 0 }, frame: { kind: "tray", border: 15, corner: 18 },
    },
  },
  {
    id: "numbered-48", name: "Numbered 48", note: "48 pieces with small engraved numbers to sort them",
    params: {
      name: "Numbered puzzle", shape: { kind: "rect", width: 300, height: 200 },
      pieces: { auto: true, count: 48 }, tabs: { style: "classic", jitter: 6, seed: 11 }, engrave: { kind: "numbers", fontId: "archivo-black", numberSize: 5 },
    },
  },
  {
    id: "wavy-coaster", name: "Wavy coaster", note: "A 100 mm round coaster in 6 wavy pieces",
    params: {
      name: "Wavy coaster", shape: { kind: "circle", width: 100, height: 100 },
      pieces: { auto: true, count: 6 }, tabs: { style: "wavy", size: 24, seed: 2 },
    },
  },
];
