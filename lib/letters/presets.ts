import type { Preset } from "@/lib/presets";
import type { LetterParams } from "./types";

export const LETTER_PRESETS: Preset<LetterParams>[] = [
  { id: "name-box", name: "Name box", note: "Rounded letters, hinge walls", params: { name: "Name box", text: "Sam", mode: "box" } },
  { id: "love-box", name: "LOVE box", note: "Tall condensed capitals", params: { name: "LOVE box", text: "LOVE", fontId: "anton", mode: "box", size: 120 } },
  { id: "home-faceted", name: "HOME, flat panels", note: "Straight wall panels, no hinge", params: { name: "HOME", text: "HOME", fontId: "archivo-black", mode: "box", wallStyle: "faceted", size: 110 } },
  { id: "initial-box", name: "Single initial", note: "One big letter box", params: { name: "Initial box", text: "A", fontId: "fredoka", mode: "box", size: 200 } },
  { id: "mom-box", name: "MOM box", note: "Open top, for flowers", params: { name: "MOM box", text: "MOM", mode: "box", lid: "open", size: 130 } },
  { id: "persian-box", name: "Persian word box", note: "عشق in Vazirmatn", params: { name: "Persian box", text: "عشق", fontId: "vazirmatn", mode: "box", size: 150 } },
  { id: "script-sign", name: "Script name sign", note: "Solid welded script", params: { name: "Script sign", text: "Mia", fontId: "pacifico", mode: "solid", size: 120 } },
  { id: "year-sign", name: "Year sign", note: "Solid numbers for a shelf", params: { name: "Year sign", text: "2026", fontId: "archivo-black", mode: "solid", size: 100 } },
  { id: "hello-sign", name: "Hello sign", note: "Script, dots welded on", params: { name: "Hello sign", text: "hello", fontId: "pacifico", mode: "solid", size: 110, weldDots: true } },
  { id: "salam-sign", name: "Persian sign", note: "سلام in Lalezar", params: { name: "Persian sign", text: "سلام", fontId: "lalezar", mode: "solid", size: 120 } },
  { id: "open-stencil", name: "OPEN stencil", note: "Bridged centres for spray paint", params: { name: "OPEN stencil", text: "OPEN", fontId: "bebas-neue", mode: "stencil", size: 120 } },
  { id: "bar-stencil", name: "BAR stencil", note: "Heavy letters, two bridges", params: { name: "BAR stencil", text: "BAR", fontId: "archivo-black", mode: "stencil", size: 120, bridgesPerIsland: 2 } },
];
