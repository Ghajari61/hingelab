/**
 * Family Names: a list of names made into one piece: a name crossword, a tree of names, a name
 * snowflake, a ring of names round a word, a split monogram, or letter bunting.
 */
import { circle, rect, roundedRect } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { motifArtFields } from "../motifArt";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildFamily, type FamilyOutput } from "./build";
import { checkFamily, growFamily } from "./check";
import { FAMILY_DEFAULTS, familyNames, mergeFamily, type FamilyLayout, type FamilyParams } from "./params";
import { FAMILY_PRESETS } from "./presets";

export const LAYOUT_NAMES: Record<FamilyLayout, string> = {
  crossword: "Crossword", tree: "Name tree", snowflake: "Snowflake", ring: "Ring", monogram: "Split monogram", bunting: "Bunting",
};
const is = (...k: FamilyLayout[]) => (p: FamilyParams) => k.includes(p.layout.kind);
const marked = is("crossword", "ring", "monogram", "bunting");

const sections: SectionSpec<FamilyParams>[] = [
  {
    id: "layout", title: "Layout", open: true,
    help: "How the names are arranged into one piece.",
    fields: [
      {
        kind: "choice", key: "layout.kind", label: "Layout", rail: true,
        help: "A crossword of interlocking names, a Christmas tree of names, a snowflake with a name on each arm, a ring round a word, a split monogram, or bunting with a letter on each flag.",
        options: (Object.keys(LAYOUT_NAMES) as FamilyLayout[]).map((v) => ({ v, text: LAYOUT_NAMES[v] })),
      },
    ],
  },
  {
    id: "names", title: "Names", open: true,
    help: "One name per line; the layout arranges them for you.",
    fields: [
      { kind: "text", key: "names.list", label: "Names", multiline: true, maxLength: 2000, placeholder: "One name per line", help: "One name per line; for bunting, the words to spell, one flag per letter." },
      { kind: "font", key: "names.fontId", shuffle: true, label: "Font", sample: (p) => familyNames(p)[0] || "Aa", help: "The typeface of the names; bold fonts weld and cut best." },
      { kind: "toggle", key: "names.caps", label: "Capitals", show: is("tree", "snowflake", "ring", "monogram", "bunting"), help: "Sets the names in capital letters (crossword tiles always are)." },
    ],
  },
  {
    id: "mark", title: "Letters", open: true, show: marked,
    help: "How the letters show on the tiles, ring, band or flags.",
    fields: [
      {
        kind: "choice", key: "mark.kind", shuffle: true, label: "Letters", rail: true,
        help: "Engrave fills the letters, Score traces them, Cut-out cuts them through, Layered glues them on in a second material.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }, { v: "cutout", text: "Cut-out" }, { v: "layered", text: "Layered", title: "Two materials" }],
      },
    ],
  },
  {
    id: "crossword", title: "Crossword", open: true, show: is("crossword"),
    help: "Letter tiles where the names cross on shared letters.",
    fields: [
      { kind: "number", key: "crossword.tile", label: "Tile", unit: "mm", min: 6, max: 60, step: 0.5, help: "Size of each square tile." },
      { kind: "number", key: "crossword.letter", label: "Letter size", unit: "%", min: 30, max: 90, step: 1, help: "Letter height as a share of the tile." },
      { kind: "number", key: "crossword.round", label: "Round corners", unit: "mm", min: 0, max: 20, step: 0.5, help: "Rounds the outside corners of the tiles." },
      { kind: "choice", key: "crossword.back", label: "Backing", help: "No backing, an outline round the tiles, or a rounded plate.", options: [{ v: "none", text: "None" }, { v: "outline", text: "Outline" }, { v: "plate", text: "Plate" }] },
      { kind: "number", key: "crossword.pad", label: "Border", unit: "mm", min: 1, max: 30, step: 0.5, show: (p) => p.crossword.back !== "none" || p.mark.kind === "layered", help: "Width of the backing round the tiles." },
      { kind: "toggle", key: "crossword.grid", shuffle: true, label: "Score the grid", help: "Scores the lines between neighbouring tiles so every square reads." },
    ],
  },
  {
    id: "tree", title: "Tree", open: true, show: is("tree"),
    help: "Names stacked shortest to longest into a Christmas tree.",
    fields: [
      { kind: "number", key: "tree.width", label: "Width", unit: "mm", min: 40, max: 400, step: 1, help: "Width of the widest line at the bottom." },
      { kind: "number", key: "tree.maxLine", label: "Tallest line", unit: "mm", min: 5, max: 80, step: 0.5, help: "Height of the tallest line; short names never grow past it." },
      { kind: "toggle", key: "tree.noWeld", label: "No Weld", help: "Keep the original glyphs, dots and counters separate. Remembers the Weld value when switched off." },
      { kind: "choice", key: "tree.operation", label: "Letters", options: [{ v: "cut", text: "Cut" }, { v: "score", text: "Score" }], help: "Cut makes letter pieces. Score traces the original letters on a backing without cutting them out; a backing is added where needed." },
      { kind: "number", key: "tree.weld", label: "Weld", unit: "mm", min: 0.2, max: 4, step: 0.1, show: (p) => !p.tree.noWeld && p.tree.operation !== "score", help: "How much the letters grow so the lines fuse into one piece." },
      { kind: "choice", key: "tree.star", shuffle: true, label: "Topper", rail: true, options: MOTIF_OPTIONS.filter((o) => !o.input), help: "The motif on top of the tree: a star, a snowflake, an angel's crown or none." },
      { kind: "toggle", key: "tree.lines", label: "Lines between names", help: "A bar between each line of names, as wide as the shorter line, so the rows sit on shelves instead of touching." },
      { kind: "number", key: "tree.lineW", label: "Line thickness", unit: "mm", min: 0.6, max: 8, step: 0.1, show: (p) => p.tree.lines, help: "Thickness of each bar between the lines; 1.5 mm or more holds in 3 mm wood." },
      { kind: "toggle", key: "tree.trunk", label: "Trunk", help: "A trunk under the tree." },
      { kind: "text", key: "tree.year", label: "Trunk words", maxLength: 12, show: (p) => p.tree.trunk, placeholder: "A year", help: "Words cut through the trunk, such as the year." },
    ],
  },
  {
    id: "snowflake", title: "Snowflake", open: true, show: is("snowflake"),
    help: "A name along every arm, round a disc in the middle.",
    fields: [
      { kind: "number", key: "snowflake.diameter", label: "Diameter", unit: "mm", min: 50, max: 400, step: 1, help: "Size of the snowflake across." },
      { kind: "text", key: "snowflake.centre", label: "Centre words", maxLength: 8, placeholder: "A year", help: "Words cut through the middle disc, such as the year." },
      { kind: "toggle", key: "snowflake.noWeld", label: "No Weld", help: "Keep the original glyphs, dots and counters separate. Remembers the Weld value when switched off." },
      { kind: "choice", key: "snowflake.operation", label: "Letters", options: [{ v: "cut", text: "Cut" }, { v: "score", text: "Score" }], help: "Cut makes letter pieces. Score traces the original letters on a backing without cutting them out; a backing is added where needed." },
      { kind: "number", key: "snowflake.weld", label: "Weld", unit: "mm", min: 0.2, max: 4, step: 0.1, show: (p) => !p.snowflake.noWeld && p.snowflake.operation !== "score", help: "How much the letters grow so the arms fuse into one piece." },
    ],
  },
  {
    id: "ring", title: "Ring", open: true, show: is("ring"),
    help: "A round plate with the names round the edge and a word or motif in the middle.",
    fields: [
      { kind: "number", key: "ring.diameter", label: "Diameter", unit: "mm", min: 40, max: 400, step: 1, help: "Size of the ring across." },
      { kind: "number", key: "ring.nameSize", label: "Name height", unit: "mm", min: 3, max: 40, step: 0.5, help: "Height of the names round the ring; they shrink to fit all the way round." },
      { kind: "text", key: "ring.separator", label: "Between names", maxLength: 3, help: "The mark between the names, such as a dot." },
      { kind: "text", key: "ring.centre", label: "Centre", maxLength: 6, placeholder: "A short word", help: "A short word or an initial in the middle; empty shows the motif instead." },
      { kind: "font", key: "ring.centreFont", label: "Centre font", sample: (p) => p.ring.centre || "Aa", show: (p) => !!p.ring.centre.trim(), help: "The typeface of the middle word; script looks lovely." },
      { kind: "choice", key: "ring.motif", label: "Centre motif", rail: true, options: MOTIF_OPTIONS, show: (p) => !p.ring.centre.trim(), help: "The motif in the middle when there is no word." },
      ...motifArtFields<FamilyParams>("ring.motif", "ring.art", (p) => p.layout.kind === "ring" && !p.ring.centre.trim()),
      { kind: "toggle", key: "ring.frame", shuffle: true, label: "Scored rings", help: "Scores a ring inside the edge and one round the middle." },
    ],
  },
  {
    id: "monogram", title: "Monogram", open: true, show: is("monogram"),
    help: "A big initial split by a band that carries the name (the first name on the list).",
    fields: [
      { kind: "number", key: "monogram.size", label: "Letter height", unit: "mm", min: 30, max: 400, step: 1, help: "Height of the big initial." },
      { kind: "text", key: "monogram.letter", label: "Initial", maxLength: 1, placeholder: "Auto", help: "The big letter; empty takes the first letter of the name." },
      { kind: "font", key: "monogram.letterFont", label: "Initial font", sample: (p) => p.monogram.letter || familyNames(p)[0]?.[0] || "A", help: "The typeface of the big initial; serif letters split beautifully." },
      { kind: "number", key: "monogram.band", label: "Band", unit: "%", min: 14, max: 45, step: 1, help: "Height of the band across the letter, as a share of its height." },
    ],
  },
  {
    id: "bunting", title: "Flags", open: true, show: is("bunting"),
    help: "One flag per letter, with two holes for the cord.",
    fields: [
      { kind: "choice", key: "bunting.shape", shuffle: true, label: "Flag", rail: true, help: "The flag's shape.", options: [{ v: "pennant", text: "Pennant" }, { v: "swallowtail", text: "Swallowtail" }, { v: "square", text: "Square" }, { v: "scalloped", text: "Scalloped" }] },
      { kind: "number", key: "bunting.width", label: "Width", unit: "mm", min: 30, max: 300, step: 1, help: "Width of each flag." },
      { kind: "number", key: "bunting.height", label: "Height", unit: "mm", min: 30, max: 400, step: 1, help: "Height of each flag." },
      { kind: "number", key: "bunting.letter", label: "Letter size", unit: "%", min: 30, max: 90, step: 1, help: "Letter height as a share of the flag width." },
      { kind: "number", key: "bunting.hole", label: "Cord holes", unit: "mm", min: 2, max: 10, step: 0.5, help: "Diameter of the two holes for the cord." },
      { kind: "toggle", key: "bunting.spacer", label: "Blank between words", help: "Adds a plain flag between the words." },
    ],
  },
  {
    id: "backer", title: "Backer", open: false, show: is("tree", "snowflake", "monogram"),
    help: "A silhouette behind the names, cut from the main sheet, with the names on top in a second material.",
    fields: [
      { kind: "toggle", key: "backer.on", label: "Two layers", help: "Adds a backer behind the welded names; the names are cut from the second material." },
      { kind: "number", key: "backer.offset", label: "Backer border", unit: "mm", min: 1, max: 15, step: 0.5, show: (p) => p.backer.on, help: "How far the backer reaches past the names." },
    ],
  },
  {
    id: "hang", title: "Hanging", open: false, show: is("crossword", "tree", "snowflake", "ring", "monogram"),
    help: "A loop on the top edge (or a hole in a crossword plate) with enough material round it.",
    fields: [
      { kind: "choice", key: "hang.kind", label: "Hang by", help: "A loop on the top, a hole (crossword plates; the others use a loop), or nothing.", options: [{ v: "loop", text: "Loop" }, { v: "hole", text: "Hole" }, { v: "none", text: "None" }] },
      { kind: "number", key: "hang.hole", label: "Hole", unit: "mm", min: 1, max: 12, step: 0.1, show: (p) => p.hang.kind !== "none", help: "Diameter of the hole for the ribbon or hook." },
      { kind: "number", key: "hang.wall", label: "Wall", unit: "mm", min: 1, max: 10, step: 0.1, show: (p) => p.hang.kind !== "none", help: "Material kept all round the hole." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => (marked(p) && p.mark.kind === "layered") || (is("tree", "snowflake", "monogram")(p) && p.backer.on),
    help: "The material of the glued-on names: mirror, glitter or coloured acrylic, or wood.",
    fields: material2Fields<FamilyParams>("mat"),
  },
];

const mv = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as [number, number]));
const holeAt = (x: number, y: number, r: number) => circle(x, y, r, 0.2).slice().reverse();

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "tree.star" || key === "ring.motif") return motifArt(v);
  if (key === "layout.kind") {
    const tile = (x: number, y: number) => rect(x, y, 9, 9);
    const pics: Record<string, Contour[]> = {
      crossword: [tile(0, 9), tile(9, 9), tile(18, 9), tile(27, 9), tile(9, 0), tile(9, 18), tile(9, 27), tile(27, 18)],
      tree: [[[20, 0], [24, 8], [16, 8]], rect(13, 9, 14, 5), rect(9, 15, 22, 5), rect(5, 21, 30, 5), rect(1, 27, 38, 5), rect(17, 33, 6, 5)],
      snowflake: [circle(20, 20, 5, 0.2), ...[0, 60, 120, 180, 240, 300].map((a) => { const r = (a * Math.PI) / 180; const c: Contour = [[20 + 4 * Math.cos(r + 1.4), 20 + 4 * Math.sin(r + 1.4)], [20 + 19 * Math.cos(r + 0.12), 20 + 19 * Math.sin(r + 0.12)], [20 + 19 * Math.cos(r - 0.12), 20 + 19 * Math.sin(r - 0.12)], [20 + 4 * Math.cos(r - 1.4), 20 + 4 * Math.sin(r - 1.4)]]; return c; })],
      ring: [circle(20, 20, 18, 0.2), holeAt(20, 20, 12), circle(20, 20, 7, 0.2)],
      monogram: [rect(10, 0, 8, 14), rect(10, 26, 8, 14), roundedRect(0, 15, 40, 10, 2)],
      bunting: [...mv([[[0, 0], [12, 0], [6, 16]]], 0, 4), ...mv([[[0, 0], [12, 0], [6, 16]]], 14, 4), ...mv([[[0, 0], [12, 0], [6, 16]]], 28, 4)],
    };
    return [{ d: fitArt(pics[v] ?? [], 38).join(" "), fill: true }];
  }
  if (key === "mark.kind") {
    const L: Contour[] = [rect(8, 6, 4, 16), rect(8, 18, 12, 4)];
    const [o, ...m] = fitArt([roundedRect(0, 0, 28, 28, 4), ...L], 38);
    if (v === "engrave") return [{ d: o, fill: true }, { d: m.join(" ") }];
    if (v === "score") return [{ d: o }, { d: m.join(" ") }];
    if (v === "cutout") return [{ d: [o, ...m].join(" "), fill: true }];
    return [{ d: o, fill: true }, { d: m.join(" "), fill: true }];
  }
  if (key === "bunting.shape") {
    const pics: Record<string, Contour> = {
      pennant: [[0, 0], [30, 0], [15, 38]],
      swallowtail: [[0, 0], [30, 0], [30, 38], [15, 28], [0, 38]],
      square: roundedRect(0, 0, 30, 36, 2),
      scalloped: [[0, 0], [30, 0], [30, 30], [25, 36], [20, 30], [15, 36], [10, 30], [5, 36], [0, 30]],
    };
    return [{ d: fitArt([pics[v] ?? pics.pennant], 38).join(" "), fill: true }];
  }
  return [];
}

export const FAMILY: GeneratorDef<FamilyParams> = {
  id: "family",
  name: "Family Names",
  version: 1,
  defaults: () => mergeFamily({}),
  merge: mergeFamily,
  sections,
  presets: FAMILY_PRESETS,
  build: buildFamily,
  check: (p, out) => checkFamily(p, out as FamilyOutput),
  pro: (p) => ((is("tree", "snowflake", "monogram")(p) && p.backer.on) || (marked(p) && p.mark.kind === "layered") ? "Two-layer designs need Pro." : null),
  fonts: (p) => [p.names.fontId, ...(p.layout.kind === "ring" && p.ring.centre.trim() ? [p.ring.centreFont] : []), ...(p.layout.kind === "monogram" ? [p.monogram.letterFont] : []), ...(p.layout.kind === "tree" && p.tree.year.trim() || p.layout.kind === "snowflake" ? ["archivo-black"] : [])],
  scale: (p, s) => growFamily(p, s),
  art,
  batch: (p) => (p.layout.kind === "monogram" ? "names.list" : null),
  fileName: (p) => namedFile("family", p.name, p.layout.kind),
  summary: (p) => `${LAYOUT_NAMES[p.layout.kind]} · ${familyNames(p).length} ${p.layout.kind === "bunting" ? "words" : "names"}`,
  help: {
    intro: [
      "Family Names turns a list of names into one piece to cut: a crossword where the names cross on shared letters, a Christmas tree of names stacked shortest to longest, a snowflake with a name along every arm, a ring of names round a word or initial, a big split monogram with the name across it, or bunting with one letter per flag.",
      "Welded layouts (the tree and the snowflake) fuse the letters into one piece and score where letters overlap, so each still reads. Add a silhouette backer to make two layers: the backer from the main sheet, the names in mirror or coloured acrylic.",
      "Crosswords check that every name crosses another; any that cannot are listed. Holes and loops keep enough material round them not to tear.",
    ],
    tips: [
      "Crosswords work best with names that share common letters (A, E, I, N); a long name in the list gives the others more to cross.",
      "Bold, blocky fonts weld and cut most cleanly at ornament size; keep the smallest letters above about 5 mm.",
      "Paint the backer before gluing the names on, and glue with a thin bead so none squeezes out.",
      "Cut bunting flags from 3 mm wood and thread them on a cord through both holes so they hang straight.",
    ],
    keywords: ["family names", "name crossword", "crossword ornament", "name tree", "christmas tree ornament", "name snowflake", "monogram", "split monogram", "bunting", "banner", "circle ornament"],
  },
};

export { FAMILY_DEFAULTS };
