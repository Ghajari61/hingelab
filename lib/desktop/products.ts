/**
 * The desktop app's products, built on the server: a catalog of plain-data settings panels, and
 * `generateDesign`, which applies an edit, runs the checks and fixes, enforces the caller's plan
 * and returns the SVG. The geometry never leaves the server; the app only renders what it gets.
 */
import { FIELDS, type FieldDef } from "@/components/editor/fields";
import { HINGE_RANGES, hingeRequestError } from "@/lib/billing/validate";
import { serverBuildContext } from "@/lib/billing/exportGenerator";
import { arrangeHinge } from "@/lib/fit/hinge";
import { GENERATOR_IDS, GENERATOR_INFO, isGeneratorId, type GeneratorId } from "@/lib/generators/ids";
import { arrangeGenerator, cleanExtras, genSVG, sheetIssues } from "@/lib/generators/output";
import { getPath, setPath } from "@/lib/generators/path";
import { loadGenerator } from "@/lib/generators/registry";
import { sanitizeGeneratorParams } from "@/lib/generators/sanitize";
import { MAX_BATCH, MAX_BATCH_TEXT, MAX_COPIES, type AnyGenerator, type FieldSpec, type GenBase } from "@/lib/generators/types";
import { HINGE_FIELD_HELP } from "@/lib/help/fieldHelp";
import { clone, DEFAULTS, exportSVG, MATERIALS, mergeParams, type Params } from "@/lib/hinge";
import { HINGE_PRESETS, hingePresetParams, randomHingeBox } from "@/lib/hinge/presets";
import { defaultRimWidth, isLidSlot, lidSlotSize } from "@/lib/hinge/lidSlot";
import { defaultCapH, LID_STEP_IN, roundHoleD } from "@/lib/hinge/model";
import { flipBandAuto } from "@/lib/hinge/flip";
import { SHEET_PRESETS } from "@/lib/studio/library";
import { FRET_BUILT_IN, FRET_NAMES } from "@/lib/generators/fretwork";
import { MOTIF_IDS, MOTIF_NAMES } from "@/lib/generators/motifs";
import { PIERCE_SHAPES, type PierceShape } from "@/lib/generators/windowShape";
import { hingeTextContext } from "@/lib/billing/hingeText";
import { applyStandardSize, insideText, STANDARD_SIZES, standardSizeOf } from "@/lib/hinge/standardSizes";
import { BASE_TEXT_FONT, BASE_TEXT_SIZE, MAX_BASE_TEXT } from "@/lib/hinge/baseText";
import { randomiseParams } from "@/lib/generators/randomise";
import { autoFixAll, sortIssues, type Issue } from "@/lib/issues";
import { hingeIssues } from "@/lib/issues/hinge";
import { BUNDLED_FONTS, FONT_CATEGORIES } from "@/lib/letters/fontList";
import { addWatermark, batchLimitMessage, designBatchCount, FREE_PATTERNS, FREE_SHAPES, hasPro, hingeLocks, needsWatermark, PATTERN_NAMES, SHAPE_NAMES, type Plan } from "@/lib/plans";
import { generatorScene } from "@/lib/generators/scene3d";
import { buildHingeScene } from "@/lib/hinge3d/scene";
import type { Scene3D } from "@/lib/three/flat";
import { sceneModel } from "./model3d";
import type { DCatalog, D3Model, DesktopProductId, DField, DForm, DIssue, DPicture, DProduct, DSection, GenerateRequest, GenerateResponse } from "./types";

export const FONTS_BY_STYLE = FONT_CATEGORIES.flatMap((c) => BUNDLED_FONTS.filter((f) => f.category === c.id));

const DESKTOP_GENERATORS: readonly GeneratorId[] = GENERATOR_IDS.filter(id => id !== "calibration");
export const DESKTOP_PRODUCTS: DesktopProductId[] = ["hinge", ...DESKTOP_GENERATORS, "letters", "parametric"];
export const CATALOG_VERSION = 1;

export const isDesktopProduct = (v: unknown): v is DesktopProductId => v === "hinge" || v === "letters" || v === "parametric" || isGeneratorId(v);

export const MATERIAL_OPTIONS = Object.entries(MATERIALS).map(([v, m]) => ({ v, text: m.name }));

/** The field with its starting value, when that value is one the field accepts. */
export function withDefault(f: DField, v: unknown): DField {
  switch (f.kind) {
    case "number": return typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max ? { ...f, default: v } : f;
    case "choice": return v != null && f.options.some((o) => o.v === String(v)) ? { ...f, default: String(v) } : f;
    case "toggle": return { ...f, default: v === true };
    case "text": return typeof v === "string" || v === undefined ? { ...f, default: v ?? "" } : f;
  }
}

// ---------------------------------------------------------------- Hinge Box

const HINGE_SECTIONS: { id: FieldDef["sec"] | "secShape"; title: string; help: string }[] = [
  { id: "secShape", title: "Shape", help: "The box's outline and lid." },
  { id: "secDims", title: "Dimensions", help: "Outside sizes of the box, in millimetres." },
  { id: "secMat", title: "Material", help: "The sheet you cut: its thickness and the laser's kerf." },
  { id: "secHinge", title: "Hinge", help: "The living-hinge pattern cut into the bending wall." },
  { id: "secJoints", title: "Joints", help: "Tabs and slots that join the wall to the base and lid." },
  { id: "secLid", title: "Lid", help: "The lid's opening, overhang and lip; a flip-top's hinge, a cap's height and stacked steps." },
  { id: "secBase", title: "Base & standing", help: "An opening in the base, hanging holes, and standing the box up as a cabinet." },
  { id: "secDiv", title: "Dividers", help: "Strips that split the inside into compartments (shelves when the box stands up)." },
  { id: "secDrawers", title: "Drawers", help: "A chest of drawers: an open-fronted case with drawers that slide in." },
  { id: "secFret", title: "Cut-out pattern", help: "A decorative pattern cut through the lid and the wall's flat stretches." },
  { id: "secText", title: "Text under the box", help: "A name, phone number or message engraved on the base." },
  { id: "secSheet", title: "Sheet", help: "Your laser bed and how parts are laid out on it." },
];

function hingeNumber(f: FieldDef): DField {
  const [lo, hi] = HINGE_RANGES[f.id] ?? [0, 10000];
  return {
    kind: "number", key: f.id, label: f.label, help: HINGE_FIELD_HELP[f.id],
    unit: f.len ? "mm" : f.id === "stretch" ? "%" : "",
    min: f.min ?? lo, max: Math.min(f.max ?? hi, hi), step: f.step,
    ...(!f.len && !f.float ? { int: true } : {}),
  };
}

/** The sheet preset with this size, or "custom". */
const bedPresetId = (w: number, h: number) => SHEET_PRESETS.find((s) => Math.abs(s.w - w) < 0.05 && Math.abs(s.h - h) < 0.05)?.id ?? "custom";

function hingeProduct(): DProduct {
  const extra: Record<string, DField[]> = {
    secDims: [
      { kind: "choice", key: "standard", label: "Standard size", help: "Sets the outside size for what goes inside, for your material thickness and lid.", default: "custom", options: [
        { v: "custom", text: "My own size" },
        ...STANDARD_SIZES.map((x) => ({ v: x.id, text: `${x.group} · ${x.name} (${insideText(x)})` })),
      ] },
    ],
    secShape: [
      { kind: "choice", key: "shape", label: "Shape", options: (["rect", "pill", "poly", "cyl"] as const).map((v) => ({ v, text: SHAPE_NAMES[v], pro: !FREE_SHAPES.includes(v) })) },
      { kind: "choice", key: "lid", label: "Lid", options: [
        { v: "open", text: "Open tray", title: "No lid" }, { v: "fixed", text: "Fixed lid", title: "A lid joined to the walls" }, { v: "removable", text: "Removable lid", title: "A lid with a lip that lifts off" },
        { v: "flip", text: "Flip-top lid", title: "One plate with a living-hinge band that swings open; a cabinet door when the box stands up" },
        { v: "cap", text: "Cap lid", title: "A shallow box that slips over the top, like a shoebox lid" },
      ] },
    ],
    secMat: [{ kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS }],
    secHinge: [
      { kind: "choice", key: "pattern", label: "Pattern", options: (["straight", "wave", "relief", "serpentine", "honeycomb"] as const).map((v) => ({ v, text: PATTERN_NAMES[v], pro: !FREE_PATTERNS.includes(v) })) },
      { kind: "choice", key: "cutStyle", label: "Cut style", options: [{ v: "slot", text: "Slots" }, { v: "line", text: "Single line" }] },
    ],
  };
  const tail: Record<string, DField[]> = {
    secJoints: [
      { kind: "toggle", key: "seamFingers", label: "Seam fingers", help: "The two ends of the wall lock together with fingers." },
      { kind: "toggle", key: "baseRing", label: "Support ring", help: "A ring glued on the base, inside the wall, so the bottom of the hinge has a shoulder to sit on." },
      { kind: "number", key: "baseRingW", label: "Ring width", help: HINGE_FIELD_HELP.baseRingW, unit: "mm", min: 3, max: 40, step: 0.5, default: 8 },
      { kind: "choice", key: "split", label: "Wall", options: [{ v: "1", text: "One strip" }, { v: "2", text: "Two halves" }] },
    ],
    secLid: [
      { kind: "choice", key: "lidHole", label: "Opening", default: "none", options: [
        { v: "none", text: "None", title: "A plain lid" },
        { v: "finger", text: "Finger", title: "A round hole to lift the lid with a fingertip" },
        { v: "knob", text: "Knob", title: "A small hole for a knob's screw" },
        { v: "tissue", text: "Tissue", title: "A long slot to pull tissues through" },
        { v: "coin", text: "Coin", title: "A narrow slot for coins: a money box" },
        { v: "rim", text: "Rim", title: "An open top: the lid's middle is cut away, leaving a rim round the edge" },
        { v: "lamp", text: "Lamp", title: "A 40 mm hole for an E27 lamp holder" },
      ] },
      { kind: "choice", key: "flipSide", label: "Hinge side", help: "Which side a flip-top lid's hinge runs along.", default: "back", options: [{ v: "back", text: "Back" }, { v: "left", text: "Left" }, { v: "right", text: "Right" }, { v: "front", text: "Front" }] },
      { kind: "number", key: "flipBand", label: "Hinge band", help: HINGE_FIELD_HELP.flipBand, unit: "mm", min: 4, max: 300, step: 0.5, default: 30 },
      { kind: "number", key: "capH", label: "Cap height", help: HINGE_FIELD_HELP.capH, unit: "mm", min: 12, max: 3000, step: 1, default: 30 },
      { kind: "number", key: "lidSteps", label: "Steps", help: HINGE_FIELD_HELP.lidSteps, unit: "", min: 0, max: 3, step: 1, int: true, default: 0 },
      { kind: "number", key: "lidStepIn", label: "Step size", help: HINGE_FIELD_HELP.lidStepIn, unit: "mm", min: 1, max: 60, step: 0.5, default: 6 },
      { kind: "toggle", key: "lidWindow", label: "Clear window", help: "A clear acrylic plate under a rim: a display box." },
      { kind: "number", key: "lidHoleD", label: "Hole size", help: HINGE_FIELD_HELP.lidHoleD, unit: "mm", min: 1, max: 500, step: 0.5, default: 22 },
      { kind: "number", key: "lidHoleW", label: "Slot width", help: HINGE_FIELD_HELP.lidHoleW, unit: "mm", min: 1, max: 200, step: 0.5, default: 30 },
      { kind: "number", key: "lidOver", label: "Overhang", help: HINGE_FIELD_HELP.lidOver, unit: "mm", min: 0, max: 100, step: 0.5, default: 0 },
      { kind: "toggle", key: "lidLipScore", label: "Score the lip on the lid", help: "Marks the lip's outline on the lid, so the lip lines up when you glue it. Put the scored side down." },
    ],
    secBase: [
      { kind: "choice", key: "baseHole", label: "Opening", default: "none", options: [{ v: "none", text: "None" }, { v: "hole", text: "Hole", title: "A lamp cord or a drain" }, { v: "rim", text: "Open bottom", title: "A rim round an open bottom: a lamp shade" }] },
      { kind: "number", key: "baseHoleD", label: "Hole size", help: HINGE_FIELD_HELP.baseHoleD, unit: "mm", min: 2, max: 500, step: 0.5, default: 10 },
      { kind: "number", key: "baseHoleW", label: "Bottom rim", help: HINGE_FIELD_HELP.baseHoleW, unit: "mm", min: 1, max: 200, step: 0.5, default: 13 },
      { kind: "toggle", key: "hangHoles", label: "Hanging holes", help: "Two keyhole slots near the top of the base, to hang the box on screws." },
      { kind: "toggle", key: "upright", label: "Stand it up (cabinet)", help: "Shows the box stood on its side: the base at the back and the lid as the door." },
    ],
    secDrawers: [
      { kind: "number", key: "drawers", label: "Drawers", help: HINGE_FIELD_HELP.drawers, unit: "", min: 0, max: 4, step: 1, int: true, default: 0 },
      { kind: "choice", key: "drawerPull", label: "Pull", default: "knob", options: [{ v: "knob", text: "Knob hole" }, { v: "finger", text: "Finger hole" }, { v: "none", text: "None" }] },
    ],
    secDiv: [
      { kind: "number", key: "divX", label: "Across width", help: HINGE_FIELD_HELP.divX, unit: "", min: 0, max: 8, step: 1, int: true, default: 0 },
      { kind: "number", key: "divY", label: "Across depth", help: HINGE_FIELD_HELP.divY, unit: "", min: 0, max: 8, step: 1, int: true, default: 0 },
      { kind: "number", key: "divH", label: "Height (0 = full)", help: HINGE_FIELD_HELP.divH, unit: "mm", min: 0, max: 3000, step: 1, default: 0 },
    ],
    secFret: [
      { kind: "choice", key: "fret", label: "Pattern", default: "none", options: FRET_BUILT_IN.map((v) => ({ v, text: FRET_NAMES[v] })) },
      { kind: "choice", key: "fretOn", label: "Cut it in", default: "both", options: [{ v: "both", text: "Lid and walls" }, { v: "lid", text: "Lid" }, { v: "walls", text: "Walls" }] },
      { kind: "number", key: "fretCell", label: "Pattern size", help: HINGE_FIELD_HELP.fretCell, unit: "mm", min: 6, max: 80, step: 0.5, default: 16 },
      { kind: "number", key: "fretBar", label: "Bar width", help: HINGE_FIELD_HELP.fretBar, unit: "mm", min: 1, max: 15, step: 0.25, default: 3 },
      { kind: "choice", key: "fretMotif", label: "Motif", default: "heart", options: MOTIF_IDS.map((v) => ({ v, text: MOTIF_NAMES[v] })) },
      { kind: "choice", key: "fretShape", label: "Shape", default: "full", options: (Object.keys(PIERCE_SHAPES) as PierceShape[]).map((v) => ({ v, text: PIERCE_SHAPES[v] })) },
      { kind: "number", key: "fretSize", label: "Shape size", unit: "%", min: 20, max: 100, step: 1, default: 70 },
      { kind: "choice", key: "fretMark", label: "Mark", default: "cut", options: [{ v: "cut", text: "Cut out" }, { v: "engrave", text: "Engrave" }, { v: "score", text: "Score" }] },
    ],
    secText: [
      { kind: "text", key: "baseText", label: "Text under the box", help: "Engraved in the middle of the base: a company name, phone number or message. One line per line.", placeholder: "Company name\nPhone 0912 000 0000", multiline: true, maxLength: MAX_BASE_TEXT },
      { kind: "number", key: "baseTextSize", label: "Letter height", help: "Height of the capital letters, mm. Long text is shrunk to fit inside the walls.", unit: "mm", min: 1.5, max: 40, step: 0.5, default: BASE_TEXT_SIZE },
      { kind: "choice", key: "baseTextFont", label: "Font", default: BASE_TEXT_FONT, options: BUNDLED_FONTS.map((x) => ({ v: x.id, text: `${x.name} · ${x.note}` })) },
    ],
    secSheet: [
      { kind: "choice", key: "bed", label: "Machine bed", help: "Sets the sheet to your laser's bed or a common sheet size.", default: bedPresetId(DEFAULTS.bedW, DEFAULTS.bedH), options: [
        { v: "custom", text: "Custom size" },
        ...SHEET_PRESETS.map((s) => ({ v: s.id, text: `${s.name} (${s.w} × ${s.h} mm)` })),
      ] },
      { kind: "toggle", key: "labels", label: "Engrave part names" },
      { kind: "toggle", key: "testStrip", label: "Add a bend test strip" },
    ],
  };
  const sections: DSection[] = HINGE_SECTIONS.map((s) => ({
    id: s.id, title: s.title, help: s.help,
    fields: [...(extra[s.id] ?? []), ...FIELDS.filter((f) => f.sec === s.id && !f.unset).map(hingeNumber), ...(tail[s.id] ?? [])]
      .map((f) => withDefault(f, (DEFAULTS as unknown as Record<string, unknown>)[f.key])),
  }));
  const presets = HINGE_PRESETS.map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: hingeLocks("free", hingePresetParams(pr.params)).length > 0 }));
  return { id: "hinge", name: "Hinge Box", blurb: "Living-hinge boxes in rounded, pill, polygon and cylinder shapes: flip-top, cap and lift-off lids, cabinets with doors, chests of drawers and lamp shades.", icon: "box", sections, presets };
}

export function hingeForm(p: Params): DForm {
  const hidden: string[] = [];
  const labels: Record<string, string> = {};
  for (const f of FIELDS) {
    if (f.show && !f.show(p)) hidden.push(f.id);
    if (f.lab) labels[f.id] = f.lab(p);
  }
  if (p.lid === "open") hidden.push("lidGap");
  if (!p.baseRing) hidden.push("baseRingW");
  if (!(p.lid === "removable" && p.lidLip !== false)) hidden.push("lidLipScore");
  const opening = p.lidHole ?? "none";
  if (opening === "none" || opening === "rim") hidden.push("lidHoleD");
  if (!isLidSlot(opening) && opening !== "rim") hidden.push("lidHoleW");
  const values: Record<string, unknown> = { bed: bedPresetId(p.bedW, p.bedH), standard: standardSizeOf(p) || "custom" };
  if (!p.baseText?.trim()) hidden.push("baseTextSize", "baseTextFont");
  if (!p.fret || p.fret === "none") hidden.push("fretOn", "fretCell", "fretBar", "fretMotif", "fretShape", "fretSize", "fretMark");
  else {
    if (p.fret !== "motif") hidden.push("fretMotif");
    if (!p.fretShape || p.fretShape === "full") hidden.push("fretSize");
  }
  if (p.fretMotif == null) values.fretMotif = "heart";
  if (p.fretShape == null) values.fretShape = "full";
  if (p.fretSize == null) values.fretSize = 70;
  if (p.fretMark == null) values.fretMark = "cut";
  if (p.fret == null) values.fret = "none";
  if (p.fretOn == null) values.fretOn = "both";
  if (p.fretCell == null) values.fretCell = 16;
  if (p.fretBar == null) values.fretBar = 3;
  if (p.baseTextSize == null) values.baseTextSize = BASE_TEXT_SIZE;
  if (p.baseTextFont == null) values.baseTextFont = BASE_TEXT_FONT;
  if (p.baseRing && p.baseRingW == null) values.baseRingW = 8;
  if (p.lidHole == null && p.lid !== "open") values.lidHole = "none";
  if (p.lidOver == null && p.lid !== "open") values.lidOver = 0;
  if (opening === "rim" && p.lidHoleW == null) values.lidHoleW = defaultRimWidth(p.T);
  if (opening !== "none" && p.lidHoleD == null) values.lidHoleD = isLidSlot(opening) ? lidSlotSize(p).len : roundHoleD(opening) ?? 22;
  if (p.flipSide == null) values.flipSide = "back";
  if (p.lid !== "flip") hidden.push("flipSide", "flipBand");
  else if (p.flipBand == null) values.flipBand = flipBandAuto(p);
  if (p.lid !== "cap") hidden.push("capH"); else if (p.capH == null) values.capH = defaultCapH(p);
  const steppable = p.lid === "fixed" || p.lid === "removable" || p.lid === "cap";
  if (!steppable) hidden.push("lidSteps", "lidStepIn");
  else { if (p.lidSteps == null) values.lidSteps = 0; if (!p.lidSteps) hidden.push("lidStepIn"); else if (p.lidStepIn == null) values.lidStepIn = LID_STEP_IN; }
  if (opening !== "rim") hidden.push("lidWindow");
  if (p.lid === "cap") hidden.push("lidOver");
  const bh = p.baseHole ?? "none";
  if (p.baseHole == null) values.baseHole = "none";
  if (bh !== "hole") hidden.push("baseHoleD"); else if (p.baseHoleD == null) values.baseHoleD = roundHoleD("hole") ?? 10;
  if (bh !== "rim") hidden.push("baseHoleW"); else if (p.baseHoleW == null) values.baseHoleW = defaultRimWidth(p.T);
  if (p.drawers == null) values.drawers = 0;
  if (p.drawerPull == null) values.drawerPull = "knob";
  if (!p.drawers) hidden.push("drawerPull");
  if (isLidSlot(opening) && p.lidHoleW == null) values.lidHoleW = lidSlotSize(p).w;
  if ((p.divX ?? 0) + (p.divY ?? 0) === 0) hidden.push("divH");
  for (const k of ["divX", "divY", "divH"] as const) if (p[k] == null) values[k] = 0;
  return { hidden: [...new Set(hidden)], hiddenSections: p.lid === "open" || (p.drawers ?? 0) > 0 ? ["secLid"] : [], labels, ...(Object.keys(values).length ? { values } : {}) };
}

// ---------------------------------------------------------------- Generators

/** Material and sheet settings every generator shares (the web editor's dock). */
const GEN_SHEET: DSection = {
  id: "_sheet", title: "Material and sheet", help: "The sheet you cut, your laser bed and how parts are laid out.",
  fields: [
    { kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS },
    { kind: "number", key: "T", label: "Thick", help: HINGE_FIELD_HELP.T, unit: "mm", min: 0.1, max: 30, step: 0.05 },
    { kind: "number", key: "K", label: "Kerf", help: HINGE_FIELD_HELP.K, unit: "mm", min: 0, max: 1, step: 0.01 },
    { kind: "number", key: "bedW", label: "Bed W", help: HINGE_FIELD_HELP.bedW, unit: "mm", min: 50, max: 10000, step: 10 },
    { kind: "number", key: "bedH", label: "Bed H", help: HINGE_FIELD_HELP.bedH, unit: "mm", min: 50, max: 10000, step: 10 },
    { kind: "number", key: "gap", label: "Spacing", help: HINGE_FIELD_HELP.gap, unit: "mm", min: 0, max: 1000, step: 0.5 },
    { kind: "number", key: "sheet.copies", label: "Copies", help: "How many sets of parts to cut.", unit: "", min: 1, max: MAX_COPIES, step: 1, int: true },
    { kind: "choice", key: "sheet.nest", label: "Packing", options: [{ v: "box", text: "Upright" }, { v: "outline", text: "True shape" }] },
    { kind: "toggle", key: "sheet.labels", label: "Score part names" },
    { kind: "toggle", key: "sheet.calibration", label: "Calibration bar" },
    { kind: "toggle", key: "job.mirror", label: "Mirror", help: "Flip every part left to right, so engraving on the back of clear acrylic reads the right way from the front." },
    {
      kind: "text", key: "job.names", label: "Batch names", multiline: true, maxLength: MAX_BATCH_TEXT,
      placeholder: "One name per line", help: `One set of parts for each line, with that line as the design's text (up to ${MAX_BATCH} lines).`,
    },
  ],
};

const MAT_KEYS = new Set(["T", "K"]);

function genField(f: FieldSpec<GenBase>): DField | null {
  const common = { key: f.key, label: f.label, help: f.help, ...("shuffle" in f && f.shuffle ? { shuffle: true } : {}) };
  switch (f.kind) {
    case "number": return { kind: "number", ...common, ...(f.random ? { random: true } : {}), unit: f.unit, min: f.min, max: f.max, step: f.step, ...(f.int ? { int: true } : {}) };
    case "choice": {
      const opt = (o: (typeof f.options)[number]) => ({ v: o.v, text: o.text, ...(o.title ? { title: o.title } : {}), ...(o.pro ? { pro: true } : {}) });
      const pictures = f.options.filter((o) => o.input === "picture").map(opt);
      return { kind: "choice", ...common, options: f.options.filter((o) => o.input !== "picture").map(opt), ...(pictures.length ? { pictureOptions: pictures } : {}) };
    }
    case "toggle": return { kind: "toggle", ...common };
    case "text": return { kind: "text", ...common, placeholder: f.placeholder, multiline: f.multiline, maxLength: f.maxLength ?? 2000 };
    case "font": return { kind: "choice", ...common, options: FONTS_BY_STYLE.map((b) => ({ v: b.id, text: b.scripts.includes("arabic") ? `${b.name} (Persian)` : b.name, title: `${FONT_CATEGORIES.find((c) => c.id === b.category)?.name}: ${b.note}` })) };
    case "image": return null;
  }
}

const TRACE_HELP = "A photo or drawing (JPEG, PNG or WebP) or an SVG file. HingeLab shrinks it on this computer and the server traces it into outlines; the picture is not kept.";

/** A picture setting the app can fill: grey pictures and traced ones (colour photos stay on the website). */
function genPicture(f: FieldSpec<GenBase>): DPicture | null {
  if (f.kind !== "image" || f.color || f.look) return null;
  if (f.trace) return { key: f.key, label: f.label, help: TRACE_HELP, mode: "trace", aspectKey: f.aspectKey, levels: f.trace.levels, name: f.trace.name };
  return { key: f.key, label: f.label, help: f.help, mode: "grey", aspectKey: f.aspectKey };
}

const desktopHelp = (help?: string) => help?.replace("Pictures are traced on this device and never uploaded.", "Pictures are shrunk on this computer and traced on the server, which does not keep them.");

function genProduct(id: GeneratorId, def: AnyGenerator): DProduct {
  const info = GENERATOR_INFO[id] as { name: string; blurb: string; icon: DProduct["icon"] };
  const d = def.defaults() as GenBase;
  const extras = cleanExtras(d.sheet) as unknown as Record<string, unknown>;
  const start = (key: string) => {
    const v = getPath(d, key);
    if (v !== undefined) return v;
    if (key.startsWith("sheet.")) return extras[key.slice("sheet.".length)];
    return key === "job.mirror" ? false : undefined;
  };
  const sections: DSection[] = [
    ...def.sections.map((s) => {
      const pictures = s.fields.map(genPicture).filter((f): f is DPicture => !!f);
      return { id: s.id, title: s.title, help: desktopHelp(s.help), fields: s.fields.map(genField).filter((f): f is DField => !!f), ...(pictures.length ? { pictures } : {}) };
    }).filter((s) => s.fields.length || s.pictures),
    GEN_SHEET,
  ].map((s) => ({ ...s, fields: s.fields.map((f) => withDefault(f, start(f.key))) }));
  return {
    id, name: info.name, blurb: info.blurb, icon: info.icon, sections,
    presets: def.presets.map((pr) => ({ id: pr.id, name: pr.name, note: pr.note, pro: !!pr.pro })),
    ...(def.scale ? { scale: true } : {}),
  };
}

function genForm(def: AnyGenerator, p: GenBase): DForm {
  const hidden: string[] = [];
  const hiddenSections: string[] = [];
  for (const s of def.sections) {
    if (s.show && !s.show(p)) hiddenSections.push(s.id);
    for (const f of s.fields) if (f.show && !f.show(p)) hidden.push(f.key);
  }
  if (!def.batch?.(p)) hidden.push("job.names");
  return { hidden, hiddenSections, labels: {} };
}

// ---------------------------------------------------------------- Catalog

let catalog: Promise<DCatalog> | null = null;

/** Every product a settings request may name: the catalog's list and the newer ones in `more`. */
export const allProducts = (c: DCatalog): DProduct[] => [...c.products, ...(c.more ?? [])];

export function desktopCatalog(): Promise<DCatalog> {
  catalog ??= (async () => {
    const gens = await Promise.all(DESKTOP_GENERATORS.map(async (id) => genProduct(id, await loadGenerator[id]())));
    const [{ ART_PRODUCT }, { lettersProduct }, { parametricProduct }] = await Promise.all([import("./art"), import("./letters"), import("./parametric")]);
    return { version: CATALOG_VERSION, products: [hingeProduct(), ...gens], more: [lettersProduct(), parametricProduct()], art: ART_PRODUCT };
  })();
  return catalog;
}

export function fieldOf(product: DProduct, key: string): DField | null {
  for (const s of product.sections) for (const f of s.fields) if (f.key === key) return f;
  return null;
}

/** An edit, checked against the field it targets. Returns the new value or a message. */
export function coerce(f: DField, value: unknown): { v: unknown } | { error: string } {
  switch (f.kind) {
    case "number": {
      const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
      if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
      const c = Math.min(f.max, Math.max(f.min, n));
      return { v: f.int ? Math.round(c) : c };
    }
    case "choice": {
      const s = String(value);
      return f.options.some((o) => o.v === s) || f.pictureOptions?.some((o) => o.v === s) ? { v: s } : { error: `Unknown option for ${f.label}.` };
    }
    case "toggle":
      return typeof value === "boolean" ? { v: value } : { error: `${f.label} must be on or off.` };
    case "text":
      return typeof value === "string" ? { v: value.slice(0, f.maxLength) } : { error: `${f.label} must be text.` };
  }
}

export function withMaterial<T extends { material: string; T: number; K: number }>(p: T, id: string): T {
  const m = MATERIALS[id];
  const next = { ...p, material: id };
  if (m && m.T != null && m.K != null) { next.T = m.T; next.K = m.K; }
  return next;
}

// ---------------------------------------------------------------- Generate

export type GenerateResult = { status: number; body: GenerateResponse | { error: string } };

export const toIssues = <P>(list: Issue<P>[]): DIssue[] => sortIssues(list).map((i) => ({
  code: i.code, level: i.level, message: i.message, fixes: i.fixes.map((f) => ({ id: f.id, label: f.label, safe: f.safe })),
}));

export function applyFix<P>(p: P, issues: Issue<P>[], fix: GenerateRequest["fix"]): { p: P; applied: string[] } {
  if (!fix || typeof fix.code !== "string" || typeof fix.id !== "string") return { p, applied: [] };
  const f = issues.find((i) => i.code === fix.code)?.fixes.find((x) => x.id === fix.id);
  return f ? { p: f.apply(p), applied: [f.label] } : { p, applied: [] };
}

export function sheetSize(svg: string): { width?: number; height?: number } {
  const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : {};
}

const plainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The 3D model when the app asked for it; a design too large to send, or a failed build, sends none. */
export function modelPart(r: GenerateRequest, at: (explode: number) => Scene3D): { model?: D3Model } {
  if (r.model !== true) return {};
  try {
    const model = sceneModel(at);
    return model ? { model } : {};
  } catch (e) {
    console.error("desktop 3D model failed", e);
    return {};
  }
}

/**
 * One request from the desktop editor. The plan comes from the caller's session, never from the
 * request; a design the plan does not include gets 403 with no SVG at all, because anything sent
 * to the app can be saved from it.
 */
export async function generateDesign(req: unknown, plan: Plan): Promise<GenerateResult> {
  if (!plainObject(req) || !(isDesktopProduct(req.product) || req.product === "art")) return { status: 400, body: { error: "Unknown product." } };
  const r = req as unknown as GenerateRequest;
  if (r.params !== undefined && !plainObject(r.params)) return { status: 400, body: { error: "Invalid settings." } };
  if (r.change !== undefined && (!plainObject(r.change) || typeof r.change.key !== "string")) return { status: 400, body: { error: "Invalid change." } };
  if (r.fix !== undefined && !plainObject(r.fix)) return { status: 400, body: { error: "Invalid fix." } };
  if (r.scale !== undefined && !(typeof r.scale === "number" && r.scale >= 0.2 && r.scale <= 5)) return { status: 400, body: { error: "Invalid scale." } };
  if (r.randomise !== undefined && !(plainObject(r.randomise) && (r.randomise.locked === undefined || (Array.isArray(r.randomise.locked) && r.randomise.locked.length <= 200 && r.randomise.locked.every((k) => typeof k === "string" && k.length <= 80))))) return { status: 400, body: { error: "Invalid randomise." } };
  if (r.change?.key === "name") {
    // The design's name is free text (used for the file name, which is sanitized separately).
    if (typeof r.change.value !== "string") return { status: 400, body: { error: "The name must be text." } };
    r.params = { ...(plainObject(r.params) ? r.params : {}), name: r.change.value.replace(/[\u0000-\u001f]/g, "").slice(0, 120) };
    delete r.change;
  }
  if (r.product === "art") return (await import("./art")).generateArt(r, plan);
  const product = allProducts(await desktopCatalog()).find((p) => p.id === r.product)!;
  if (r.product === "letters") return (await import("./letters")).generateLetters(r, product, plan);
  if (r.product === "parametric") return (await import("./parametric")).generateParametric(r, plan);
  return r.product === "hinge" ? generateHinge(r, product, plan) : generateGenerator(r, r.product, product, plan);
}

type Change = { key: string; value: unknown };

function changeHinge(p: Params, product: DProduct, change: Change): Params | { error: string } {
  const f = fieldOf(product, change.key);
  if (!f) return { error: "Unknown setting." };
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  if (change.key === "standard") {
    const st = STANDARD_SIZES.find((x) => x.id === c.v);
    return st ? applyStandardSize(p, st) : p;
  }
  if (change.key === "baseText" && typeof c.v === "string" && !c.v.trim()) { const q = { ...p }; delete q.baseText; return q; }
  if (change.key === "bed") {
    const s = SHEET_PRESETS.find((x) => x.id === c.v);
    return s ? { ...p, bedW: s.w, bedH: s.h } : p;
  }
  const key = change.key as keyof Params;
  let q: Params = key === "material" ? withMaterial(p, c.v as string) : ({ ...p, [key]: key === "split" ? Number(c.v) : c.v } as Params);
  if (FIELDS.some((x) => x.id === key && x.mat) && q.material !== "custom") q = { ...q, material: "custom" };
  // A new opening starts at its own size, not the last one's.
  if (key === "lidHole") { delete q.lidHoleD; delete q.lidHoleW; }
  return q;
}

function changeGenerator(def: AnyGenerator, product: DProduct, p: GenBase, change: Change): GenBase | { error: string } {
  const f = fieldOf(product, change.key);
  if (!f) return { error: "Unknown setting." };
  const c = coerce(f, change.value);
  if ("error" in c) return c;
  const key = change.key;
  const spec = def.sections.flatMap((s) => s.fields).find((x) => x.key === key);
  let q: GenBase;
  if (key === "material") q = withMaterial(p, c.v as string);
  else if (spec?.kind === "choice" && spec.apply) q = spec.apply(p, c.v as string);
  else q = setPath(p, key, c.v);
  if (MAT_KEYS.has(key) && q.material !== "custom") q = { ...q, material: "custom" };
  if (key === "sheet.copies" || key === "sheet.nest" || key === "sheet.labels" || key === "sheet.calibration") {
    q = setPath(q, "sheet", { nest: "box", calibration: false, labels: false, copies: 1, ...(getPath(q, "sheet") as object), [key.slice(6)]: c.v });
  }
  return q;
}

/**
 * A design's settings from a preset (or the defaults) with edits applied, each checked against its
 * field like an edit from the editor; an edit the catalog does not allow is skipped and reported.
 */
export async function designFromChanges(id: DesktopProductId, preset: string | null, changes: Change[], from?: Record<string, unknown>): Promise<{ params: Record<string, unknown>; skipped: string[] }> {
  const product = allProducts(await desktopCatalog()).find((x) => x.id === id)!;
  const skipped: string[] = [];
  if (id === "letters") return (await import("./letters")).lettersFromChanges(product, preset, changes, from);
  if (id === "parametric") return { params: from ?? {}, skipped: changes.map((c) => c.key) };
  if (id === "hinge") {
    const pr = preset ? HINGE_PRESETS.find((x) => x.id === preset) : undefined;
    let p = from ? mergeParams(from as Partial<Params>) : pr ? hingePresetParams(pr.params) : clone(DEFAULTS);
    for (const c of changes) {
      const q = changeHinge(p, product, c);
      if ("error" in q) skipped.push(c.key);
      else p = q;
    }
    return { params: p as unknown as Record<string, unknown>, skipped };
  }
  const def = await loadGenerator[id]();
  const pr = preset ? def.presets.find((x) => x.id === preset) : undefined;
  let p: GenBase = def.merge(from ?? (pr ? pr.params : {}));
  for (const c of changes) {
    const q = changeGenerator(def, product, p, c);
    if ("error" in q) skipped.push(c.key);
    else p = q;
  }
  return { params: sanitizeGeneratorParams(def, def.merge(p)) as unknown as Record<string, unknown>, skipped };
}

async function generateHinge(r: GenerateRequest, product: DProduct, plan: Plan): Promise<GenerateResult> {
  let p: Params;
  if (typeof r.preset === "string") {
    const pr = HINGE_PRESETS.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    p = hingePresetParams(pr.params);
  } else {
    p = r.params ? mergeParams(r.params as Partial<Params>) : clone(DEFAULTS);
  }
  if (r.change) {
    const q = changeHinge(p, product, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  if (r.randomise) p = randomHingeBox(p, plan);
  const base = (q: Params, issues: DIssue[] = [], applied: string[] = []): GenerateResponse => ({
    product: "hinge", params: q as unknown as Record<string, unknown>, form: hingeForm(q), issues, stats: [], summary: hingeSummary(q), applied,
  });
  const invalid = hingeRequestError(p);
  if (invalid) return { status: 400, body: { ...base(p), error: invalid } };

  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, hingeIssues);
    p = res.params;
    applied = res.applied;
  } else if (r.fix) {
    ({ p, applied } = applyFix(p, hingeIssues(p), r.fix));
  }
  const after = hingeRequestError(p);
  if (after) return { status: 400, body: { ...base(p, [], applied), error: after } };
  const issues = toIssues(hingeIssues(p));

  const locks = hingeLocks(plan, p);
  if (locks.length) {
    const locked = `${locks.join(" and ")} ${locks.length > 1 ? "are Pro features" : "is a Pro feature"}. Upgrade to Pro to preview and export it in the desktop app.`;
    return { status: 403, body: { ...base(p, issues, applied), locked } };
  }
  const a = arrangeHinge(p);
  if ("error" in a.result) return { status: 422, body: { ...base(p, issues, applied), error: a.result.error } };
  if (!a.lay) return { status: 422, body: { ...base(p, issues, applied), error: "The parts could not be laid out." } };
  const raw = exportSVG(a.result, a.lay, a.params, await hingeTextContext(a.params).catch(() => undefined));
  const watermark = needsWatermark(plan);
  const svg = watermark ? addWatermark(raw) : raw;
  const size = sheetSize(svg);
  const stats = [
    { label: "Parts", value: String(a.lay.items.length) },
    { label: "Sheet", value: size.width ? `${Math.round(size.width)} × ${Math.round(size.height!)} mm` : "-" },
    { label: "Material", value: MATERIALS[p.material]?.name ?? "Custom" },
  ];
  const model = a.result;
  return {
    status: 200,
    body: { ...base(p, issues, applied), stats, svg, fileName: fileNameOf(p.name, "hinge-box"), ...size, watermark, ...modelPart(r, (e) => buildHingeScene(model, a.params, e)) },
  };
}

function hingeSummary(p: Params): string {
  const size = p.shape === "cyl" ? `⌀${p.dia}` : p.shape === "poly" ? `${p.sides} sides × ${p.W}` : `${p.W} × ${p.D}`;
  return `${SHAPE_NAMES[p.shape]} · ${size} × ${p.H} mm · ${PATTERN_NAMES[p.pattern]}`;
}

/** A safe Windows file name: letters, digits, spaces, single dots, dashes and underscores. */
export function fileNameOf(name: string, fallback: string): string {
  let base = name.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\.{2,}/g, " ").replace(/\s+/g, " ").trim().replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).trim();
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `${base}-design`;
  return `${base || fallback}.svg`;
}

async function generateGenerator(r: GenerateRequest, id: GeneratorId, product: DProduct, plan: Plan): Promise<GenerateResult> {
  const def = await loadGenerator[id]();
  let p: GenBase;
  if (typeof r.preset === "string") {
    const pr = def.presets.find((x) => x.id === r.preset);
    if (!pr) return { status: 400, body: { error: "Unknown preset." } };
    p = def.merge(pr.params);
  } else {
    const v = typeof r.version === "number" && Number.isInteger(r.version) && r.version >= 1 ? r.version : null;
    p = def.merge(v && def.migrate && r.params ? def.migrate(r.params, v) : r.params ?? {});
  }
  if (r.change) {
    const q = changeGenerator(def, product, p, r.change);
    if ("error" in q) return { status: 400, body: { error: q.error } };
    p = q;
  }
  if (r.scale !== undefined) {
    if (!def.scale) return { status: 400, body: { error: "This design cannot be scaled as a whole." } };
    p = def.scale(p, r.scale);
  }
  if (r.randomise) p = randomiseParams(def, p as GenBase & Record<string, unknown>, new Set(r.randomise.locked ?? []));
  p = sanitizeGeneratorParams(def, def.merge(p));
  const ctx = await serverBuildContext(def, p);
  const base = (q: GenBase, issues: DIssue[] = [], applied: string[] = []): GenerateResponse => ({
    product: id, params: q as unknown as Record<string, unknown>, form: genForm(def, q), issues, stats: [], summary: def.summary(q), applied, version: def.version,
  });
  if (!ctx || "error" in ctx) return { status: 422, body: { ...base(p), error: "This design uses a font that is not available. Pick another font." } };

  const issuesOf = (q: GenBase): Issue<GenBase>[] => {
    const a = arrangeGenerator(def, q, ctx);
    if ("error" in a.result) return [];
    return [...def.check(q, a.result.out), ...sheetIssues(def, q, a)];
  };
  let applied: string[] = [];
  if (r.autofix) {
    const res = autoFixAll(p, issuesOf);
    p = sanitizeGeneratorParams(def, def.merge(res.params));
    applied = res.applied;
  } else if (r.fix) {
    const res = applyFix(p, issuesOf(p), r.fix);
    p = sanitizeGeneratorParams(def, def.merge(res.p));
    applied = res.applied;
  }
  const a = arrangeGenerator(def, p, ctx);
  if ("error" in a.result) return { status: 422, body: { ...base(p, [], applied), error: a.result.error } };
  const out = a.result.out;
  const issues = toIssues([...def.check(p, out), ...sheetIssues(def, p, a)]);
  const stats = out.stats;
  if (out.missing?.length) return { status: 422, body: { ...base(p, issues, applied), stats, error: "The font is missing some characters. Pick another font." } };
  if (!a.lay) return { status: 422, body: { ...base(p, issues, applied), stats, error: "The design does not fit on the sheet." } };
  const lock = def.pro?.(a.params, out) ?? null;
  const over = batchLimitMessage(plan, designBatchCount(a.params));
  if (over) return { status: 403, body: { ...base(p, issues, applied), stats, locked: over } };
  if (lock && !hasPro(plan)) return { status: 403, body: { ...base(p, issues, applied), stats, locked: `${lock} Upgrade to Pro to preview and export it in the desktop app.` } };
  const svg = genSVG(def, a.params, a.lay, "", a.sheets);
  return {
    status: 200,
    body: { ...base(p, issues, applied), stats, svg, fileName: fileNameOf(def.fileName(a.params), id), ...sheetSize(svg), watermark: false, ...modelPart(r, (e) => generatorScene(out, a.params.T, e)) },
  };
}
