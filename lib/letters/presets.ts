import type { Preset } from "@/lib/presets";
import type { LetterParams } from "./types";

export const LETTER_PRESETS: Preset<LetterParams>[] = [
  {"id": "studio-maker-word", "name": "Maker script sign", "note": "95 mm welded maker script for a workshop sign.", "params": {"name": "Maker script sign", "text": "maker", "fontId": "pacifico", "mode": "solid", "size": 95, "weldDots": true}},
  {"id": "studio-label-stencil", "name": "Studio label stencil", "note": "75 mm STUDIO stencil with two bridges per enclosed counter.", "params": {"name": "Studio label stencil", "text": "STUDIO", "fontId": "bebas-neue", "mode": "stencil", "size": 75, "bridgesPerIsland": 2}},
  {"id": "studio-monogram-box", "name": "Monogram gift box", "note": "150 mm M monogram box with 45 mm walls.", "params": {"name": "Monogram gift box", "text": "M", "fontId": "fredoka", "mode": "box", "size": 150, "fit": {"mode": "auto", "sheets": 1}, "depth": 45}},
  { id: "name-box", name: "Name box", note: "Letters with their corners kept, hinge walls", params: { name: "Name box", text: "Sam", mode: "box", fit: { mode: "auto", sheets: 1 } } },
  { id: "love-box", name: "LOVE box", note: "Tall condensed capitals", params: { name: "LOVE box", text: "LOVE", fontId: "anton", mode: "box", size: 120, fit: { mode: "auto", sheets: 1 } } },
  { id: "home-faceted", name: "HOME, flat panels", note: "Straight wall panels, no hinge", params: { name: "HOME", text: "HOME", fontId: "archivo-black", mode: "box", wallStyle: "faceted", size: 110, fit: { mode: "auto", sheets: 1 } } },
  { id: "initial-box", name: "Single initial", note: "One big letter box", params: { name: "Initial box", text: "A", fontId: "fredoka", mode: "box", size: 200, fit: { mode: "auto", sheets: 1 } } },
  { id: "mom-box", name: "MOM box", note: "Open top, for flowers", params: { name: "MOM box", text: "MOM", mode: "box", lid: "open", size: 130, fit: { mode: "auto", sheets: 1 } } },
  { id: "script-sign", name: "Script name sign", note: "Solid welded script", params: { name: "Script sign", text: "Mia", fontId: "pacifico", mode: "solid", size: 120 } },
  { id: "joy-box", name: "JOY box", note: "Playful rounded capitals", params: { name: "JOY box", text: "JOY", fontId: "lilita-one", mode: "box", size: 140, fit: { mode: "auto", sheets: 1 } } },
  { id: "love-sign", name: "Love sign", note: "Solid bold script", params: { name: "Love sign", text: "love", fontId: "lobster", mode: "solid", size: 120 } },
  { id: "year-sign", name: "Year sign", note: "Solid numbers for a shelf", params: { name: "Year sign", text: "2026", fontId: "archivo-black", mode: "solid", size: 100 } },
  { id: "hello-sign", name: "Hello sign", note: "Script, dots welded on", params: { name: "Hello sign", text: "hello", fontId: "pacifico", mode: "solid", size: 110, weldDots: true } },
  { id: "open-stencil", name: "OPEN stencil", note: "Bridged centres for spray paint", params: { name: "OPEN stencil", text: "OPEN", fontId: "bebas-neue", mode: "stencil", size: 120 } },
  { id: "bar-stencil", name: "BAR stencil", note: "Heavy letters, two bridges", params: { name: "BAR stencil", text: "BAR", fontId: "archivo-black", mode: "stencil", size: 120, bridgesPerIsland: 2 } },
];
