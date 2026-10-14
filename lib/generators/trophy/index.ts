import { rect, roundedRect } from "../geom";
import { material2Fields } from "../material2";
import { MOTIF_OPTIONS, motifArt } from "../motifs";
import type { GeneratorDef, SectionSpec } from "../types";
import { fitArt, namedFile } from "../util";
import { buildTrophy, emblemShape, type TrophyOutput } from "./build";
import { checkTrophy } from "./check";
import { EMBLEMS, TROPHY_DEFAULTS, mergeTrophy, type Emblem, type TrophyParams } from "./params";
import { TROPHY_PRESETS } from "./presets";

const r1 = (v: number) => Math.round(v * 10) / 10;
const EMBLEM_NAMES: Record<Emblem, string> = { star: "Star", cup: "Cup", shield: "Shield", medal: "Medal", flame: "Flame", laurel: "Laurel", motif: "Motif", custom: "Custom" };

const sections: SectionSpec<TrophyParams>[] = [
  {
    id: "build", title: "Build", open: true,
    help: "One material, an acrylic figure on a wooden base, or a front layer of mirror acrylic.",
    fields: [
      {
        kind: "choice", key: "build.kind", label: "Build", rail: true,
        help: "Single cuts everything from one sheet; Mixed cuts the figure from the second material; Layered glues a mirror emblem and name plate onto the figure.",
        options: [{ v: "single", text: "Single" }, { v: "mixed", text: "Mixed", title: "Two materials" }, { v: "layered", text: "Layered", title: "Two materials" }],
      },
      { kind: "choice", key: "mark.kind", label: "Marks", options: [{ v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }], help: "Engrave fills the text and laurel; Score traces them." },
    ],
  },
  {
    id: "emblem", title: "Emblem", open: true,
    help: "The shape at the top of the trophy.",
    fields: [
      { kind: "choice", key: "emblem.kind", label: "Emblem", rail: true, options: EMBLEMS.map((k) => ({ v: k, text: EMBLEM_NAMES[k] })), help: "A star, cup, shield, medal, flame or laurel wreath, any motif, or your own outline." },
      { kind: "choice", key: "emblem.motif", label: "Motif", rail: true, show: (p) => p.emblem.kind === "motif", options: MOTIF_OPTIONS.filter((o) => o.v !== "none"), help: "The motif used as the emblem." },
      { kind: "text", key: "emblem.path", label: "SVG path", multiline: true, maxLength: 20000, placeholder: "M 0 0 L 100 0 L 50 90 Z", show: (p) => p.emblem.kind === "custom", help: "The d attribute of a closed SVG path; it is scaled to the emblem's size." },
      { kind: "number", key: "emblem.points", label: "Points", unit: "", min: 4, max: 12, step: 1, int: true, show: (p) => p.emblem.kind === "star", help: "How many points the star has." },
      { kind: "number", key: "emblem.width", label: "Width", unit: "mm", min: 30, max: 400, step: 1, help: "Width of the emblem." },
      { kind: "number", key: "emblem.height", label: "Height", unit: "mm", min: 30, max: 400, step: 1, help: "Height of the emblem." },
      { kind: "text", key: "emblem.text", label: "Emblem text", maxLength: 24, placeholder: "e.g. 1", help: "A number or short word engraved in the middle of the emblem." },
      { kind: "font", key: "emblem.fontId", label: "Emblem font", sample: (p) => p.emblem.text || "1", help: "The typeface of the emblem's text." },
      { kind: "number", key: "emblem.size", label: "Emblem text height", unit: "mm", min: 4, max: 150, step: 1, help: "Height of the emblem's text." },
      { kind: "toggle", key: "emblem.laurel", label: "Laurel engraving", help: "Engraves a laurel wreath around the emblem's text." },
    ],
  },
  {
    id: "plate", title: "Name plate", open: true,
    help: "A plate under the emblem with the winner's name, the award and the year.",
    fields: [
      { kind: "toggle", key: "plate.on", label: "Name plate", help: "Adds a plate under the emblem." },
      { kind: "text", key: "plate.title", label: "Award", maxLength: 60, placeholder: "e.g. Player of the Year", show: (p) => p.plate.on, help: "The award's title, on the first line." },
      { kind: "text", key: "plate.name", label: "Name", maxLength: 60, placeholder: "e.g. Alex Morgan", show: (p) => p.plate.on, help: "The winner's name." },
      { kind: "text", key: "plate.year", label: "Year or date", maxLength: 30, placeholder: "e.g. 2026", show: (p) => p.plate.on, help: "The year or date, on the last line." },
      { kind: "font", key: "plate.titleFont", label: "Award font", sample: (p) => p.plate.title || "Award", show: (p) => p.plate.on, help: "The typeface of the award line." },
      { kind: "font", key: "plate.fontId", label: "Name font", sample: (p) => p.plate.name || "Name", show: (p) => p.plate.on, help: "The typeface of the name and year." },
      { kind: "number", key: "plate.titleSize", label: "Award height", unit: "mm", min: 3, max: 40, step: 0.5, show: (p) => p.plate.on, help: "Height of the award line." },
      { kind: "number", key: "plate.nameSize", label: "Name height", unit: "mm", min: 3, max: 40, step: 0.5, show: (p) => p.plate.on, help: "Height of the name; the year is a little smaller." },
      { kind: "number", key: "plate.width", label: "Plate width", unit: "mm", min: 20, max: 400, step: 1, show: (p) => p.plate.on, help: "Smallest width of the name plate; it grows to fit a longer line." },
      { kind: "number", key: "plate.pad", label: "Plate margin", unit: "mm", min: 2, max: 30, step: 0.5, show: (p) => p.plate.on, help: "Space around the plate's text." },
      { kind: "number", key: "plate.corner", label: "Plate corners", unit: "mm", min: 0, max: 30, step: 0.5, show: (p) => p.plate.on, help: "Rounds the plate's corners." },
      { kind: "number", key: "stem.height", label: "Stem height", unit: "mm", min: 0, max: 150, step: 1, help: "Length of the stem between the emblem and the plate or base; 0 joins them directly." },
      { kind: "number", key: "stem.width", label: "Stem width", unit: "mm", min: 6, max: 120, step: 1, show: (p) => p.stem.height > 0, help: "Width of the stem." },
    ],
  },
  {
    id: "base", title: "Base", open: false,
    help: "The stepped base the figure slots into.",
    fields: [
      { kind: "number", key: "base.tiers", label: "Tiers", unit: "", min: 1, max: 3, step: 1, int: true, help: "Layers stacked into the base; the bottom one closes the slot when there are two or three." },
      { kind: "choice", key: "base.shape", label: "Base shape", options: [{ v: "rounded", text: "Rounded" }, { v: "circle", text: "Round" }, { v: "hexagon", text: "Hexagon" }, { v: "octagon", text: "Octagon" }], help: "The outline of each tier." },
      { kind: "number", key: "base.width", label: "Base width", unit: "mm", min: 30, max: 500, step: 1, help: "Width of the bottom tier." },
      { kind: "number", key: "base.depth", label: "Base depth", unit: "mm", min: 25, max: 300, step: 1, help: "Front-to-back depth of the bottom tier." },
      { kind: "number", key: "base.step", label: "Step", unit: "mm", min: 0, max: 30, step: 0.5, show: (p) => p.base.tiers > 1, help: "How much each tier above is smaller on every side." },
      { kind: "number", key: "base.corner", label: "Corner radius", unit: "mm", min: 0, max: 40, step: 0.5, show: (p) => p.base.shape === "rounded", help: "Rounds the base's corners." },
      { kind: "number", key: "base.fit", label: "Slot clearance", unit: "mm", min: -0.2, max: 1, step: 0.05, help: "Added to the figure's thickness for the slot width; 0.05 to 0.15 mm gives a snug push fit." },
      { kind: "text", key: "base.text", label: "Base text", maxLength: 40, placeholder: "e.g. 2026", help: "A short line engraved on the top tier in front of the figure." },
    ],
  },
  {
    id: "mat", title: "Second material", open: false, show: (p) => p.build.kind !== "single",
    help: "The figure's material in a mixed build, or the front layer's in a layered build.",
    fields: material2Fields<TrophyParams>("mat"),
  },
];

function art(key: string, v: string): { d: string; fill?: boolean }[] {
  if (key === "emblem.motif") return motifArt(v);
  if (key === "emblem.kind") {
    if (v === "motif") return motifArt("crown");
    if (v === "custom") return [{ d: fitArt([[[0, 30], [20, 0], [34, 18], [46, 4], [60, 30]]], 34).join(" ") }];
    const p = mergeTrophy({ emblem: { kind: v, width: 60, height: v === "cup" ? 56 : 60 } });
    const s = emblemShape(p, { v: false }).shape;
    const [o, ...h] = fitArt([s.outer, ...s.holes], 36);
    return [{ d: [o, ...h].join(" "), fill: true }];
  }
  if (key === "build.kind") {
    const fig = roundedRect(14, 0, 22, 30, 3), base = rect(4, 30, 42, 6);
    const [f, b] = fitArt([fig, base], 36);
    if (v === "single") return [{ d: f, fill: true }, { d: b, fill: true }];
    if (v === "mixed") return [{ d: f }, { d: b, fill: true }];
    const [f2, b2, inner] = fitArt([fig, base, roundedRect(17, 3, 16, 14, 2)], 36);
    return [{ d: f2, fill: true }, { d: b2, fill: true }, { d: inner }];
  }
  return [];
}

function scaleTrophy(p: TrophyParams, s: number): TrophyParams {
  const k = (v: number) => r1(v * s);
  return {
    ...p,
    emblem: { ...p.emblem, width: k(p.emblem.width), height: k(p.emblem.height), size: k(p.emblem.size) },
    plate: { ...p.plate, width: k(p.plate.width), nameSize: k(p.plate.nameSize), titleSize: k(p.plate.titleSize), pad: k(p.plate.pad) },
    stem: { width: k(p.stem.width), height: k(p.stem.height) },
    base: { ...p.base, width: k(p.base.width), depth: k(p.base.depth), step: k(p.base.step) },
  };
}

export const TROPHY: GeneratorDef<TrophyParams> = {
  id: "trophy",
  name: "Trophy",
  version: 1,
  defaults: () => mergeTrophy({}),
  merge: mergeTrophy,
  sections,
  presets: TROPHY_PRESETS,
  build: buildTrophy,
  check: (p, out) => checkTrophy(p, out as TrophyOutput),
  pro: (p) => (p.build.kind === "layered" ? "Layered trophies need Pro." : p.emblem.kind === "custom" ? "Custom emblems need Pro." : null),
  fonts: (p) => [...(p.emblem.text.trim() ? [p.emblem.fontId] : []), ...(p.plate.on ? [p.plate.fontId, p.plate.titleFont] : []), ...(p.base.text.trim() ? [p.plate.fontId] : [])],
  scale: scaleTrophy,
  art,
  batch: (p) => (p.plate.on ? "plate.name" : "emblem.text"),
  fileName: (p) => namedFile("trophy", p.name, p.emblem.kind),
  summary: (p) => `${EMBLEM_NAMES[p.emblem.kind]} trophy${p.plate.on && p.plate.name.trim() ? ` for ${p.plate.name.trim()}` : ""} · ${p.base.tiers}-tier base`,
  help: {
    intro: [
      "The Trophy generator makes awards that stand up: an emblem (star, cup, shield, medal, flame, laurel wreath, any motif from the library or your own SVG outline), an optional stem and name plate with the award, the winner and the year, all in one upright piece that slots into a stepped base of one to three tiers.",
      "Cut it from one material, cut the figure from acrylic and the base from wood, or glue a mirror-acrylic emblem and name plate onto a wooden figure. The slot is the figure's own thickness plus a clearance you set, so mixed thicknesses still fit snugly.",
    ],
    tips: [
      "For mirror or clear acrylic figures, a clearance of 0.05 mm gives a tight push fit; plywood likes 0.1 to 0.15 mm.",
      "Three tiers with a 5 to 8 mm step look like a turned plinth.",
      "Engrave the base text in front of the figure so it reads from the same side.",
      "Keep the figure no taller than about three times the base's depth so it does not tip.",
    ],
    keywords: ["trophy", "award", "plaque", "medal", "star award", "cup", "acrylic award", "sports", "employee of the month"],
  },
};

export { TROPHY_DEFAULTS };
