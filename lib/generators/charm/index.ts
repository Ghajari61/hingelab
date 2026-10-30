/**
 * Name Charms: personalised ornaments, keychains, earrings, bag tags, drink markers, place cards and
 * gift tags, one per name on a list, each with a hanging hole or loop that keeps its wall.
 */
import { circle, rect, roundedRect, stadium } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import { motifArtFields, motifFonts } from "../motifArt";
import { SHAPE_KINDS, SHAPE_NAMES, shapeArt, type ShapeKind } from "../shapes";
import type { Contour, GeneratorDef, SectionSpec } from "../types";
import { textStyleSection } from "../textStyle";
import { fitArt, namedFile } from "../util";
import { blankOutline, buildCharm, type CharmOutput } from "./build";
import { checkCharm } from "./check";
import { CHARM_DEFAULTS, KIND_START, charmNames, mergeCharm, type CharmKind, type CharmParams } from "./params";
import { CHARM_PRESETS } from "./presets";
import { CHARACTERS, CHARACTER_NAMES, isCharacter } from "./characters";

const r1 = (v: number) => Math.round(v * 10) / 10;
const blanked = (p: CharmParams) => p.style.kind !== "letters";
const MOTIF_SHAPES = MOTIF_OPTIONS.filter((o) => o.v !== "none");

export const KIND_NAMES: Record<CharmKind, string> = {
  ornament: "Ornaments", keychain: "Keychains", earrings: "Earrings", bagtag: "Bag tags", drink: "Drink markers", placecard: "Place cards", gifttag: "Gift tags", cardholder: "Gift card holders",
  bookmark: "Bookmarks", magnet: "Fridge magnets",
};

const SHAPE_OPTIONS = [
  ...SHAPE_KINDS.map((k) => ({ v: k as string, text: SHAPE_NAMES[k] })),
  { v: "teardrop", text: "Teardrop" }, { v: "bauble", text: "Bauble" }, { v: "bone", text: "Dog bone" }, { v: "motif", text: "Motif silhouette" },
  ...CHARACTERS.map((c) => ({ v: c as string, text: CHARACTER_NAMES[c] })),
];

/** Picking a kind starts from the size, hanging and shape that suit it; names and style stay. */
function startKind(p: CharmParams, v: string): CharmParams {
  const k = v as CharmKind, s = KIND_START[k];
  return mergeCharm({ ...p, kind: { kind: k }, shape: { ...p.shape, ...s.shape }, hang: { ...p.hang, ...s.hang }, names: { ...p.names, size: s.size, along: k === "bookmark" },
    style: k === "keychain" || p.style.kind !== "letters" ? p.style : { ...p.style, kind: "engrave" } });
}

const sections: SectionSpec<CharmParams>[] = [
  {
    id: "kind", title: "What to make", open: true,
    help: "The kind of charm: each starts from the size, hanging hole and shape that suit it.",
    fields: [
      {
        kind: "choice", key: "kind.kind", label: "Make", rail: true, apply: startKind,
        help: "Ornaments, keychains, earrings, bag tags, drink markers that clip on a glass, place cards that stand, gift tags, gift card holder ornaments, bookmarks with a tassel hole, or fridge magnets with pockets for the magnets.",
        options: (Object.keys(KIND_NAMES) as CharmKind[]).map((v) => ({ v, text: KIND_NAMES[v] })),
      },
    ],
  },
  {
    id: "names", title: "Names", open: true,
    help: "One name per line makes one charm each (a pair for earrings); every name is fitted to its charm.",
    fields: [
      { kind: "text", key: "names.list", label: "Names", multiline: true, maxLength: 4000, placeholder: "One name per line", help: "One name or word per line; each line becomes its own charm. Leave it empty for plain blanks." },
      { kind: "font", key: "names.fontId", shuffle: true, label: "Font", sample: (p) => p.names.list.split("\n")[0] || "Aa", help: "The typeface of the names; script fonts look best welded as letters." },
      { kind: "number", key: "names.size", label: "Letter height", unit: "mm", min: 2, max: 80, step: 0.5, help: "Cap height of the names at most; a long name shrinks to fit its charm." },
      { kind: "number", key: "names.spacing", label: "Letter spacing", unit: "mm", min: -5, max: 10, step: 0.1, help: "Extra space between letters; a little negative spacing makes script letters join." },
      { kind: "text", key: "names.sub", label: "Second line", maxLength: 60, placeholder: "A year, a date, a phone number", show: blanked, help: "Smaller words under every name, such as a year, a date or a phone number." },
      { kind: "font", key: "names.subFontId", label: "Second line font", sample: (p) => p.names.sub || "2026", show: (p) => blanked(p) && !!p.names.sub.trim(), help: "The typeface of the second line." },
      { kind: "number", key: "names.subSize", label: "Second line size", unit: "%", min: 20, max: 100, step: 1, show: (p) => blanked(p) && !!p.names.sub.trim(), help: "Height of the second line as a share of the names'." },
      { kind: "number", key: "names.copies", label: "Copies of each", unit: "", min: 1, max: 50, step: 1, int: true, help: "How many of each name to cut, for sets and spares." },
      { kind: "toggle", key: "names.along", label: "Along the length", show: blanked, help: "Turns the words a quarter so they read bottom to top along a tall charm, as on a bookmark." },
    ],
  },
  textStyleSection<CharmParams>(),
  {
    id: "style", title: "Style", open: true,
    help: "How the name shows: engraved, scored, cut through the charm, glued on in a second material, or the welded name itself.",
    fields: [
      {
        kind: "choice", key: "style.kind", shuffle: true, label: "Style", rail: true,
        help: "Engrave fills the letters, Score traces them, Cut-out cuts them through, Layered glues them on in a second material, Inlay presses them flush into the face in a second material over a backing, Letters makes the welded name the charm.",
        options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }, { v: "cutout", text: "Cut-out" }, { v: "layered", text: "Layered", title: "Two materials" }, { v: "inlay", text: "Inlay", title: "Flush letters in a second material" }, { v: "letters", text: "Letters", title: "The name is the charm" }],
      },
      { kind: "toggle", key: "style.noWeld", label: "No Weld", show: (p) => p.style.kind === "letters" || p.style.kind === "layered", help: "Keep the original glyphs, dots and counters separate. Remembers the Weld value when switched off." },
      { kind: "choice", key: "style.operation", label: "Letters", show: (p) => p.style.kind === "letters" || p.style.kind === "layered", options: [{ v: "cut", text: "Cut" }, { v: "score", text: "Score" }], help: "Cut makes letter pieces. Score traces the original letters on a backing without cutting them out; a backing is added where needed." },
      { kind: "number", key: "style.weld", label: "Weld", unit: "mm", min: 0.2, max: 4, step: 0.1, show: (p) => !p.style.noWeld && p.style.operation !== "score" && (p.style.kind === "letters" || p.style.kind === "layered"), help: "How much the letters grow so they fuse into one piece; thicker welds are stronger." },
      { kind: "number", key: "style.backing", label: "Backing", unit: "mm", min: 0, max: 10, step: 0.5, show: (p) => p.style.kind === "letters", help: "A silhouette this much bigger behind the letters, cut from the main sheet, with the letters in the second material (0 = letters only)." },
    ],
  },
  {
    id: "shape", title: "Shape", open: true, show: blanked,
    help: "The outline of each charm and its size; the name is fitted inside a margin from the edge.",
    fields: [
      { kind: "choice", key: "shape.kind", shuffle: true, label: "Shape", rail: true, options: SHAPE_OPTIONS, help: "The charm's outline: a shape, a teardrop, a bauble, a dog bone, or a motif's silhouette." },
      { kind: "choice", key: "shape.motif", shuffle: true, label: "Silhouette", rail: true, options: MOTIF_SHAPES, show: (p) => p.shape.kind === "motif", help: "The motif whose outline the charm takes: a tree, snowflake, paw, lantern or your own picture." },
      ...motifArtFields<CharmParams>("shape.motif", "shape.art", (p) => blanked(p) && p.shape.kind === "motif"),
      { kind: "number", key: "shape.width", label: "Width", unit: "mm", min: 8, max: 300, step: 0.5, help: "Width of each charm." },
      { kind: "number", key: "shape.height", label: "Height", unit: "mm", min: 8, max: 300, step: 0.5, help: "Height of each charm." },
      { kind: "number", key: "shape.corner", label: "Corner radius", unit: "mm", min: 0, max: 30, step: 0.5, show: (p) => ["rect", "house", "hexagon", "octagon", "diamond", "banner", "tag", "star", "shield"].includes(p.shape.kind), help: "Rounds the shape's corners." },
      { kind: "number", key: "shape.margin", label: "Margin", unit: "mm", min: 0.5, max: 30, step: 0.5, help: "Space kept between the name and the charm's edge." },
      { kind: "toggle", key: "shape.frame", shuffle: true, label: "Scored frame", show: (p) => !isCharacter(p.shape.kind), help: "Scores a line just inside the edge, like a frame." },
      { kind: "choice", key: "shape.hat", shuffle: true, label: "Hat", show: (p) => p.shape.kind === "snowman" || p.shape.kind === "cat", help: "The character's hat: a top hat, a Santa hat, a bobble hat or none.", options: [{ v: "tophat", text: "Top hat" }, { v: "santa", text: "Santa hat" }, { v: "beanie", text: "Bobble hat" }, { v: "none", text: "None" }] },
      { kind: "toggle", key: "shape.paint", label: "Separate pieces", show: (p) => isCharacter(p.shape.kind), help: "Cuts the hat, nose and buttons on their own as well, to paint them or cut them in another colour and glue them in place." },
    ],
  },
  {
    id: "accent", title: "Motif", open: false, show: blanked,
    help: "A small motif beside the name: a snowflake, heart, star, paw or your own picture.",
    fields: [
      { kind: "choice", key: "accent.kind", shuffle: true, label: "Motif", rail: true, options: MOTIF_OPTIONS, help: "The picture added with the name, marked the same way as the name." },
      ...motifArtFields<CharmParams>("accent.kind", "accent.art", blanked),
      { kind: "choice", key: "accent.place", label: "Position", show: (p) => p.accent.kind !== "none", help: "Above, beside or below the name.", options: [{ v: "above", text: "Above" }, { v: "left", text: "Left" }, { v: "below", text: "Below" }] },
      { kind: "number", key: "accent.size", label: "Motif size", unit: "mm", min: 4, max: 120, step: 0.5, show: (p) => p.accent.kind !== "none", help: "The motif's larger side at full size; it shrinks with the name to fit." },
    ],
  },
  {
    id: "hang", title: "Hanging", open: true, show: (p) => p.kind.kind !== "drink" && p.kind.kind !== "placecard" && p.kind.kind !== "magnet",
    help: "A hole inside the charm, or a loop on its edge, with enough material round it not to tear.",
    fields: [
      { kind: "choice", key: "hang.kind", label: "Hang by", help: "A hole inside the charm, a loop added on its edge (keeps the whole face for the name), or nothing.", options: [{ v: "hole", text: "Hole" }, { v: "loop", text: "Loop" }, { v: "none", text: "None" }] },
      { kind: "choice", key: "hang.side", label: "Side", show: (p) => p.hang.kind !== "none" || p.kind.kind === "bagtag", help: "At the top, or at the left end for keychains and tags.", options: [{ v: "top", text: "Top" }, { v: "left", text: "Left" }] },
      { kind: "number", key: "hang.hole", label: "Hole", unit: "mm", min: 0.8, max: 15, step: 0.1, show: (p) => p.hang.kind !== "none", help: "Hole diameter: about 1.8 mm for jump rings, 3 to 4 mm for ribbon, 5 mm for split rings." },
      { kind: "number", key: "hang.wall", label: "Wall", unit: "mm", min: 0.8, max: 10, step: 0.1, show: (p) => p.hang.kind !== "none" || p.kind.kind === "bagtag", help: "Material kept all round the hole; the hole moves inwards until it has it." },
    ],
  },
  {
    id: "strap", title: "Strap slot", open: true, show: (p) => p.kind.kind === "bagtag",
    help: "The slot a strap or band threads through.",
    fields: [
      { kind: "number", key: "strap.length", label: "Slot length", unit: "mm", min: 8, max: 60, step: 0.5, help: "Length of the slot: a little more than the strap is wide." },
      { kind: "number", key: "strap.width", label: "Slot width", unit: "mm", min: 2, max: 15, step: 0.5, help: "Width of the slot: a little more than the strap is thick." },
    ],
  },
  {
    id: "clip", title: "Glass clip", open: true, show: (p) => p.kind.kind === "drink",
    help: "The ring that clips round a glass stem: its arms flex open over the stem and close round it.",
    fields: [
      { kind: "number", key: "clip.stem", label: "Stem", unit: "mm", min: 3, max: 30, step: 0.5, help: "Diameter of the glass stem; most wine glasses are 7 to 9 mm." },
      { kind: "number", key: "clip.opening", label: "Opening", unit: "mm", min: 1, max: 30, step: 0.1, help: "Width of the gap the stem pushes through: narrower than the stem so it grips." },
      { kind: "number", key: "clip.ring", label: "Ring width", unit: "mm", min: 1.5, max: 8, step: 0.1, help: "Width of the ring round the stem; thinner rings flex more and snap less." },
    ],
  },
  {
    id: "stand", title: "Stand", open: true, show: (p) => p.kind.kind === "placecard",
    help: "A foot that slots across the bottom of each card so it stands.",
    fields: [
      { kind: "number", key: "stand.depth", label: "Foot length", unit: "mm", min: 12, max: 80, step: 1, help: "Length of the foot front to back; longer feet stand steadier." },
      { kind: "number", key: "stand.clearance", label: "Slot clearance", unit: "mm", min: -0.3, max: 1, step: 0.05, help: "Added to the stock thickness for each slot; 0.1 mm slides together by hand." },
    ],
  },
  {
    id: "card", title: "Gift card", open: true, show: (p) => p.kind.kind === "cardholder",
    help: "The pocket the gift card slides into, between the back and the front.",
    fields: [
      { kind: "number", key: "card.width", label: "Card width", unit: "mm", min: 30, max: 200, step: 0.1, help: "Width of the card; a standard gift card is 85.6 mm." },
      { kind: "number", key: "card.height", label: "Card height", unit: "mm", min: 20, max: 150, step: 0.1, help: "Height of the card; a standard gift card is 54 mm." },
      { kind: "number", key: "card.clearance", label: "Clearance", unit: "mm", min: 0, max: 5, step: 0.1, help: "Room round the card on each side so it slides in and out easily." },
      { kind: "number", key: "card.lip", label: "Lip", unit: "mm", min: 1.5, max: 20, step: 0.5, help: "How far the front overlaps the card round the window, so it cannot fall out forwards." },
    ],
  },
  {
    id: "magnet", title: "Magnets", open: true, show: (p) => p.kind.kind === "magnet" && p.style.kind !== "letters",
    help: "Round magnets sit in pockets cut through a back layer of the same outline; the face glued on top hides them.",
    fields: [
      { kind: "number", key: "magnet.diameter", label: "Magnet diameter", unit: "mm", min: 3, max: 40, step: 0.5, help: "Diameter of each round magnet; 10 to 12 mm discs hold a fridge magnet and a photo." },
      { kind: "number", key: "magnet.thickness", label: "Magnet thickness", unit: "mm", min: 0.5, max: 10, step: 0.5, help: "Thickness of the magnets; no more than the stock, so they sit flush in their pockets." },
      { kind: "number", key: "magnet.count", label: "Magnets", unit: "", min: 1, max: 4, step: 1, int: true, help: "Magnets in each piece; two or more spread along a long piece stop it turning." },
      { kind: "number", key: "magnet.clearance", label: "Pocket clearance", unit: "mm", min: 0, max: 1, step: 0.05, help: "Added to the magnet's diameter for its pocket; 0.2 mm lets it drop in with a dot of glue." },
    ],
  },
  {
    id: "dangle", title: "Dangle", open: false, show: (p) => ["ornament", "keychain", "gifttag", "earrings"].includes(p.kind.kind),
    help: "A small tag hanging under the charm on a jump ring, with its own words such as the year, or a second tier under each earring.",
    fields: [
      { kind: "toggle", key: "dangle.on", label: "Dangle", help: "Adds a small tag under each charm (under each earring of a pair), joined by a jump ring." },
      { kind: "choice", key: "dangle.shape", label: "Dangle shape", show: (p) => p.dangle.on, options: [{ v: "heart", text: "Heart" }, { v: "star", text: "Star" }, { v: "circle", text: "Circle" }, { v: "teardrop", text: "Teardrop" }, { v: "tag", text: "Tag" }, { v: "house", text: "House" }, { v: "diamond", text: "Diamond" }], help: "The shape of the little tag." },
      { kind: "number", key: "dangle.size", label: "Dangle size", unit: "mm", min: 10, max: 80, step: 0.5, show: (p) => p.dangle.on, help: "Width of the little tag." },
      { kind: "text", key: "dangle.text", label: "Dangle words", maxLength: 12, show: (p) => p.dangle.on, placeholder: "A year or a date", help: "Words engraved on the little tag, such as the year." },
      { kind: "number", key: "dangle.hole", label: "Dangle holes", unit: "mm", min: 1.5, max: 8, step: 0.1, show: (p) => p.dangle.on, help: "Diameter of the holes the jump ring goes through." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => p.style.kind === "layered" || p.style.kind === "inlay" || p.kind.kind === "cardholder" || (p.style.kind === "letters" && p.style.backing > 0),
    help: "The material of the glued-on or inlaid letters: mirror, glitter or coloured acrylic, or wood.",
    fields: material2Fields<CharmParams>("mat"),
  },
];

const mv = (cs: Contour[], dx: number, dy: number) => cs.map((c) => c.map(([x, y]) => [x + dx, y + dy] as [number, number]));
const NAME: Contour[] = [rect(0, 0, 4, 12), rect(9, 0, 4, 12), rect(3, 4, 7, 4), rect(17, 4, 4, 8), circle(19, 1.2, 1.6, 0.2)];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "accent.kind" || key === "shape.motif") return motifArt(v);
  if (key === "shape.kind") {
    if (v === "motif") return motifArt("tree");
    if (v === "teardrop" || v === "bauble" || v === "bone" || isCharacter(v)) {
      const p = mergeCharm({ shape: { kind: v, width: v === "bone" ? 60 : 30, height: v === "bone" ? 26 : 44 } });
      const o = blankOutline(p, {}, []).outer;
      return o ? [{ d: fitArt([o], 38).join(" "), fill: true }] : [];
    }
    return shapeArt(v as ShapeKind);
  }
  if (key === "kind.kind") {
    const hole = (x: number, y: number, r = 2.2) => circle(x, y, r, 0.2).slice().reverse();
    const pics: Record<string, Contour[]> = {
      ornament: [circle(20, 24, 16, 0.2), roundedRect(16, 4, 8, 6, 1.5), hole(20, 12)],
      keychain: [stadium(10, 20, 40, 20, 16), hole(10, 20, 3), ...mv(NAME, 17, 14)],
      earrings: [circle(10, 26, 8, 0.2), hole(10, 21, 1.5), circle(32, 26, 8, 0.2), hole(32, 21, 1.5), rect(9, 6, 2, 12), rect(31, 6, 2, 12)],
      bagtag: [roundedRect(0, 4, 46, 30, 4), stadium(17, 10, 29, 10, 4).slice().reverse()],
      drink: [circle(20, 28, 12, 0.2), circle(20, 10, 7, 0.2), circle(20, 10, 4.5, 0.2).slice().reverse()],
      placecard: [roundedRect(0, 6, 44, 20, 3), rect(16, 26, 12, 6)],
      gifttag: [[[8, 6], [44, 6], [44, 32], [8, 32], [0, 19]], hole(8, 19)],
      cardholder: [roundedRect(0, 4, 44, 32, 4), roundedRect(6, 0, 32, 22, 1).slice().reverse(), rect(10, 26, 24, 4)],
      bookmark: [roundedRect(14, 0, 16, 46, 3), hole(22, 5, 2), rect(19.5, 12, 5, 28).slice().reverse(), rect(21, 46, 2, 2)],
      magnet: [roundedRect(0, 8, 44, 30, 4), circle(14, 23, 5, 0.2).slice().reverse(), circle(30, 23, 5, 0.2).slice().reverse()],
    };
    return [{ d: fitArt(pics[v] ?? [], 38).join(" "), fill: true }];
  }
  if (key === "style.kind") {
    const plate = roundedRect(-6, -8, 34, 28, 5);
    if (v === "letters") return [{ d: fitArt(NAME, 34).join(" "), fill: true }];
    const [o, ...m] = fitArt([plate, ...NAME], 38);
    if (v === "engrave") return [{ d: o, fill: true }, { d: m.join(" ") }];
    if (v === "score") return [{ d: o }, { d: m.join(" ") }];
    if (v === "cutout") return [{ d: [o, ...m].join(" "), fill: true }];
    if (v === "inlay") return [{ d: [o, ...m].join(" ") }, { d: m.join(" "), fill: true }];
    return [{ d: o, fill: true }, { d: m.join(" "), fill: true }];
  }
  return [];
}

function scaleCharm(p: CharmParams, s: number): CharmParams {
  const k = (v: number) => r1(v * s);
  return { ...p, names: { ...p.names, size: k(p.names.size) }, shape: { ...p.shape, width: k(p.shape.width), height: k(p.shape.height) }, accent: { ...p.accent, size: k(p.accent.size) } };
}

export const CHARM: GeneratorDef<CharmParams> = {
  id: "charm",
  name: "Name Charms",
  version: 1,
  defaults: () => mergeCharm({}),
  merge: mergeCharm,
  sections,
  presets: CHARM_PRESETS,
  build: buildCharm,
  check: (p, out) => checkCharm(p, out as CharmOutput),
  pro: (p) => (p.kind.kind === "cardholder" ? "Gift card holders (four layers) need Pro." : p.style.kind === "inlay" ? "Inlay charms (two materials) need Pro." : p.style.kind === "layered" || (p.style.kind === "letters" && p.style.backing > 0) ? "Layered charms (two materials) need Pro." : null),
  fonts: (p) => [
    ...(p.names.list.trim() ? [p.names.fontId] : []),
    ...(p.names.sub.trim() && p.style.kind !== "letters" ? [p.names.subFontId] : []),
    ...(p.style.kind !== "letters" ? motifFonts(p.accent.kind, p.accent.art) : []),
    ...(p.shape.kind === "motif" ? motifFonts(p.shape.motif, p.shape.art) : []),
  ],
  scale: scaleCharm,
  art,
  // The names list already makes one charm per name, so the sheet batch is not offered.
  batch: () => null,
  fileName: (p) => namedFile("charms", p.name, p.kind.kind),
  summary: (p) => {
    const n = charmNames(p).length;
    return `${KIND_NAMES[p.kind.kind]} · ${n} ${p.kind.kind === "earrings" ? (n === 1 ? "pair" : "pairs") : n === 1 ? "charm" : "charms"} · ${p.style.kind}`;
  },
  help: {
    intro: [
      "Name Charms makes small personalised pieces by the dozen from one list of names: Christmas ornaments, keychains, earrings, school and luggage tags, drink markers that clip on a glass, place cards that stand on their own foot, and gift or stocking tags.",
      "Each line of the list becomes one charm. The name is fitted inside the charm, clear of the edge and of the hanging hole, and shrinks to fit a long name. Engrave it, score it, cut it through, glue it on in mirror acrylic, or make the welded name itself the charm.",
      "The hole keeps enough material round it not to tear (it moves inwards on stars and hearts until it has it), or hangs from a loop on the edge. Drink markers check that their clip flexes over the stem without snapping; place card slots are sized to your stock.",
      "Bookmarks read along their length with a tassel hole at the top. Fridge magnets get a back layer with a pocket for each round magnet, so the magnet sits flush and hidden. Inlay cuts the name through the face and the same letters from a second material to press in flush over a backing. Earrings can carry a second tier on a jump ring.",
    ],
    tips: [
      "Keep at least 2.5 mm of wood (2 mm of acrylic) round a hole for a split ring; earrings get by with 1.5 mm.",
      "Script fonts weld into one piece best with a little negative letter spacing and a weld of about 1 mm.",
      "Engrave with masking tape on wood, then peel it, so the smoke does not stain the face.",
      "Seal wooden earrings and ornaments with a clear coat; it also deepens the engraving.",
      "For drink markers, acrylic grips well with an opening about three quarters of the stem; wood needs a thinner ring to flex.",
      "For an inlay, cut both materials at the same thickness with the same kerf setting; the kerf alone makes the letters press in tight.",
      "Magnet pockets as deep as the stock hide the magnet; 10 × 2 mm neodymium discs hold a light wooden magnet.",
    ],
    keywords: ["name ornament", "christmas ornament", "keychain", "name keychain", "earrings", "bag tag", "luggage tag", "wine charm", "drink marker", "place card", "gift tag", "stocking tag", "personalised", "bookmark", "fridge magnet", "inlay", "statement earrings", "pet tag"],
  },
};

export { CHARM_DEFAULTS };
