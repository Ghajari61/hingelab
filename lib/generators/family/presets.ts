import type { GenPreset } from "../types";
import type { FamilyParams } from "./params";

const FAMILY = "Olivia\nNoah\nAva\nLiam\nMum\nDad";
const BIG = "Grandma\nGrandpa\nSophie\nOliver\nEmily\nJack\nLily\nMax\nRuby\nLeo";

export const FAMILY_PRESETS: GenPreset<FamilyParams>[] = [
  // ---- crosswords
  {
    id: "family-crossword", name: "Family crossword ornament", note: "Everyone's names crossing on engraved tiles, with an outline backing",
    params: { name: "Family crossword", layout: { kind: "crossword" }, names: { list: FAMILY, fontId: "archivo-black" }, crossword: { tile: 13, back: "outline", pad: 3, grid: true }, hang: { kind: "loop", hole: 4, wall: 3 } },
  },
  {
    id: "crossword-sign", name: "Family crossword sign", note: "A big wall sign: tiles scored on a rounded plate",
    params: { name: "Crossword sign", layout: { kind: "crossword" }, material: "birch6", T: 6, K: 0.2, names: { list: BIG, fontId: "archivo-black" }, mark: { kind: "engrave" }, crossword: { tile: 30, letter: 60, back: "plate", pad: 12, grid: true }, hang: { kind: "hole", hole: 5, wall: 4 } },
  },
  {
    id: "two-tone-crossword", name: "Two-tone crossword", note: "White acrylic tiles on a walnut backing",
    params: { name: "Two-tone crossword", layout: { kind: "crossword" }, material: "walnut3", T: 3, K: 0.16, names: { list: FAMILY, fontId: "archivo-black" }, mark: { kind: "layered" }, crossword: { tile: 14, back: "outline", pad: 3, grid: false }, mat: { mat2: "acrylic-white", T2: 3 }, hang: { kind: "loop", hole: 4, wall: 3 } },
    pro: true,
  },
  {
    id: "cut-crossword", name: "Cut-through crossword", note: "Letters cut through the tiles so light shows through",
    params: { name: "Cut crossword", layout: { kind: "crossword" }, names: { list: "Anna\nNoah\nHannah\nEva", fontId: "archivo-black" }, mark: { kind: "cutout" }, crossword: { tile: 16, letter: 66, back: "outline", pad: 3, grid: true }, hang: { kind: "loop", hole: 4, wall: 3 } },
  },
  // ---- trees
  {
    id: "name-tree", name: "Family name tree", note: "Names stacked into a Christmas tree, star on top, year on the trunk",
    params: { name: "Name tree", layout: { kind: "tree" }, names: { list: "Ava\nAiden\nMason\nAllison\nIsabella\nMadison\nBenjamin", fontId: "archivo-black", caps: true }, tree: { width: 95, maxLine: 14, weld: 0.7, star: "star", trunk: true, year: "2026" }, hang: { kind: "loop", hole: 4, wall: 2.5 } },
  },
  {
    id: "name-tree-backer", name: "Name tree on a backer", note: "Gold names on a green-painted silhouette backer",
    params: { name: "Tree with backer", layout: { kind: "tree" }, names: { list: "Ava\nAiden\nMason\nAllison\nIsabella\nMadison\nBenjamin", fontId: "archivo-black", caps: true }, tree: { width: 95, maxLine: 14, weld: 0.7, star: "star", trunk: true, year: "2026" }, backer: { on: true, offset: 3 }, mat: { mat2: "acrylic-gold", T2: 3 }, hang: { kind: "loop", hole: 4, wall: 2.5 } },
    pro: true,
  },
  {
    id: "script-tree", name: "Script name tree", note: "Flowing script names welded into a tree",
    params: { name: "Script tree", layout: { kind: "tree" }, names: { list: "Mia\nLeo\nGrace\nOscar\nSophie\nWilliam", fontId: "pacifico", caps: false }, tree: { width: 100, maxLine: 18, weld: 0.9, star: "star", trunk: true, year: "2026" }, hang: { kind: "loop", hole: 4, wall: 2.5 } },
  },
  // ---- snowflakes
  {
    id: "name-snowflake", name: "Family name snowflake", note: "A name on every arm round the year",
    params: { name: "Name snowflake", layout: { kind: "snowflake" }, names: { list: "David\nSarah\nBryan\nOlivia\nEmma\nDaniel", fontId: "archivo-black", caps: true }, snowflake: { diameter: 110, centre: "2026", weld: 1.2 }, hang: { kind: "loop", hole: 4, wall: 2.5 } },
  },
  {
    id: "big-snowflake", name: "Big family snowflake", note: "Ten names, a silver mirror layer on a wooden backer",
    params: { name: "Big snowflake", layout: { kind: "snowflake" }, names: { list: BIG, fontId: "archivo-black", caps: true }, snowflake: { diameter: 150, centre: "2026", weld: 1.2 }, backer: { on: true, offset: 3 }, mat: { mat2: "acrylic-silver", T2: 3 }, hang: { kind: "loop", hole: 4, wall: 3 } },
    pro: true,
  },
  // ---- rings
  {
    id: "mom-ring", name: "Mum ring ornament", note: "Mum in script, the children's names round the ring",
    params: { name: "Mum ring", layout: { kind: "ring" }, names: { list: "Olivia\nLiam\nAmelia\nNoah\nCharlotte\nJames", fontId: "archivo-black", caps: true }, ring: { diameter: 95, centre: "Mum", centreFont: "pacifico", nameSize: 7, separator: "•", frame: true }, mark: { kind: "engrave" } },
  },
  {
    id: "initial-ring", name: "Initial ring", note: "A big initial with the family round it, cut through",
    params: { name: "Initial ring", layout: { kind: "ring" }, names: { list: "The Martins\nEst. 2019", fontId: "archivo-black", caps: true }, ring: { diameter: 90, centre: "M", centreFont: "playfair-display", nameSize: 8, separator: "•", frame: false }, mark: { kind: "cutout" } },
  },
  {
    id: "heart-ring", name: "Heart ring", note: "Couple's names round a heart",
    params: { name: "Heart ring", layout: { kind: "ring" }, names: { list: "Sam\nAlex\n14.02.2026", fontId: "archivo-black", caps: true }, ring: { diameter: 80, centre: "", motif: "heart", nameSize: 7, separator: "•", frame: true }, mark: { kind: "engrave" } },
  },
  {
    id: "gold-ring", name: "Gold names ring", note: "Mirror-gold names glued on a wooden ring",
    params: { name: "Gold ring", layout: { kind: "ring" }, names: { list: "Ella\nJack\nMia\nLeo\nZoe", fontId: "archivo-black", caps: true }, ring: { diameter: 100, centre: "Noel", centreFont: "pacifico", nameSize: 8, separator: "•", frame: true }, mark: { kind: "layered" }, mat: { mat2: "acrylic-gold", T2: 3 } },
    pro: true,
  },
  // ---- monograms
  {
    id: "split-monogram", name: "Split monogram", note: "The initial split by a band with the name",
    params: { name: "Split monogram", layout: { kind: "monogram" }, names: { list: "Noah", fontId: "archivo-black", caps: true }, monogram: { size: 90, letter: "", letterFont: "playfair-display", band: 26 }, mark: { kind: "engrave" } },
  },
  {
    id: "monogram-backer", name: "Two-layer monogram", note: "A split initial on a silhouette backer",
    params: { name: "Monogram backer", layout: { kind: "monogram" }, names: { list: "Emma", fontId: "archivo-black", caps: true }, monogram: { size: 90, letter: "", letterFont: "playfair-display", band: 26 }, mark: { kind: "cutout" }, backer: { on: true, offset: 3 }, mat: { mat2: "acrylic-rose", T2: 3 } },
    pro: true,
  },
  {
    id: "door-monogram", name: "Front door monogram", note: "A big family initial for the door, family name across it",
    params: { name: "Door monogram", layout: { kind: "monogram" }, material: "birch6", T: 6, K: 0.2, names: { list: "Johnson", fontId: "archivo-black", caps: true }, monogram: { size: 300, letter: "J", letterFont: "playfair-display", band: 22 }, mark: { kind: "engrave" }, hang: { kind: "loop", hole: 6, wall: 5 } },
  },
  // ---- bunting
  {
    id: "birthday-bunting", name: "Happy birthday bunting", note: "Pennant flags, one letter each, cord holes",
    params: { name: "Birthday bunting", layout: { kind: "bunting" }, names: { list: "Happy\nBirthday", fontId: "archivo-black", caps: true }, bunting: { shape: "pennant", width: 70, height: 90, hole: 4, letter: 58, spacer: true }, mark: { kind: "engrave" } },
  },
  {
    id: "name-bunting", name: "Nursery name bunting", note: "Scalloped flags spelling the baby's name",
    params: { name: "Name bunting", layout: { kind: "bunting" }, names: { list: "Amelia", fontId: "fredoka", caps: true }, bunting: { shape: "scalloped", width: 75, height: 85, hole: 4, letter: 62, spacer: false }, mark: { kind: "cutout" } },
  },
  {
    id: "merry-bunting", name: "Merry Christmas bunting", note: "Swallowtail flags with mirror-red letters",
    params: { name: "Christmas bunting", layout: { kind: "bunting" }, names: { list: "Merry\nChristmas", fontId: "archivo-black", caps: true }, bunting: { shape: "swallowtail", width: 60, height: 85, hole: 4, letter: 62, spacer: true }, mark: { kind: "layered" }, mat: { mat2: "acrylic-red", T2: 3 } },
    pro: true,
  },
  {
    id: "eid-bunting", name: "Eid Mubarak bunting", note: "Square flags for the Eid table",
    params: { name: "Eid bunting", layout: { kind: "bunting" }, names: { list: "Eid\nMubarak", fontId: "archivo-black", caps: true }, bunting: { shape: "square", width: 60, height: 70, hole: 4, letter: 60, spacer: true }, mark: { kind: "engrave" } },
  },
];
