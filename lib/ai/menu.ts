/**
 * What the AI designer may choose from, as plain text for the model: every product with its presets,
 * and for the chosen product its settings with their ranges and options. Built from the same catalog
 * the desktop editor uses, so the model can only ask for designs the product code already builds.
 */
import { desktopCatalog } from "@/lib/desktop/products";
import type { DField, DProduct } from "@/lib/desktop/types";
import { MATERIALS } from "@/lib/hinge";
import { BUNDLED_FONTS } from "@/lib/letters/fontList";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { AI_PRODUCTS, type AIProduct } from "./types";

export interface MenuProduct {
  id: AIProduct;
  name: string;
  blurb: string;
  presets: { id: string; name: string; note: string }[];
  /** Settings the model may set; empty for products it can only pick a preset of. */
  fields: DField[];
}

const MATERIAL_OPTIONS = Object.entries(MATERIALS).map(([v, m]) => ({ v, text: m.name }));

/** Letters settings worth setting from a description; the rest stay at the preset's values. */
export const LETTER_FIELDS: DField[] = [
  { kind: "text", key: "text", label: "Text", help: "The word or name, in any script the font covers.", maxLength: 60 },
  { kind: "choice", key: "fontId", label: "Font", options: BUNDLED_FONTS.map((f) => ({ v: f.id, text: f.name, title: f.note })) },
  { kind: "choice", key: "mode", label: "Kind", options: [{ v: "box", text: "Letter box (hollow letters with walls, base and lid)" }, { v: "solid", text: "Solid letters (flat cut-out)" }, { v: "stencil", text: "Stencil (sheet with bridged letter holes)" }] },
  { kind: "number", key: "size", label: "Letter height", help: "Cap height of the letters.", unit: "mm", min: 20, max: 600, step: 1 },
  { kind: "number", key: "depth", label: "Box depth", help: "How deep a letter box is.", unit: "mm", min: 10, max: 300, step: 1 },
  { kind: "choice", key: "lid", label: "Lid", options: [{ v: "open", text: "Open top" }, { v: "fixed", text: "Fixed lid" }, { v: "removable", text: "Removable lid" }] },
  { kind: "choice", key: "wallStyle", label: "Walls", options: [{ v: "hinge", text: "Bent living-hinge walls" }, { v: "faceted", text: "Flat wall panels" }] },
  { kind: "number", key: "letterSpacing", label: "Spacing", help: "Extra space between letters.", unit: "mm", min: -20, max: 100, step: 0.5 },
  { kind: "toggle", key: "weldDots", label: "Weld dots", help: "Join the dots of i and j to the letters (solid script)." },
  { kind: "choice", key: "material", label: "Material", options: MATERIAL_OPTIONS },
];

/** Settings the model leaves alone: machine and job details it cannot know from a description. */
const SKIP = new Set(["T", "K", "bedW", "bedH", "gap", "sheet.nest", "sheet.labels", "sheet.calibration", "job.mirror", "slotW", "overrun", "stretch", "slotClr", "lidGap", "tabW"]);
/** Long text fields hold drawn outlines (SVG path data), which the model should not write. */
const isOutline = (f: DField) => f.kind === "text" && (/path$/i.test(f.key) || f.maxLength > 5000);

const group = (key: string) => key.replace(/\.[^.]+$/, "");

/** The product's settings without the skipped and outline fields, and without the Custom choice that needs an outline. */
function usable(p: DProduct): DField[] {
  const all = p.sections.flatMap((s) => s.fields);
  const drawn = new Set(all.filter(isOutline).map((f) => group(f.key)));
  return all
    .filter((f) => !SKIP.has(f.key) && !isOutline(f))
    .map((f) => (f.kind === "choice" && drawn.has(group(f.key)) ? { ...f, options: f.options.filter((o) => o.v !== "custom") } : f));
}

let cached: Promise<MenuProduct[]> | null = null;

export function aiMenu(): Promise<MenuProduct[]> {
  cached ??= (async () => {
    const cat = await desktopCatalog();
    const fromCatalog = (p: DProduct): MenuProduct => ({ id: p.id as AIProduct, name: p.name, blurb: p.blurb, presets: p.presets.map(({ id, name, note }) => ({ id, name, note })), fields: usable(p) });
    const byId = new Map(cat.products.filter((p) => (AI_PRODUCTS as readonly string[]).includes(p.id)).map((p) => [p.id as AIProduct, fromCatalog(p)]));
    byId.set("letters", {
      id: "letters", name: "Letters", blurb: "Letter boxes (hollow letters with living-hinge or flat walls), solid cut-out letters and stencils from a word or name, in any of the bundled fonts.",
      presets: LETTER_PRESETS.map(({ id, name, note }) => ({ id, name, note })), fields: LETTER_FIELDS,
    });
    byId.set("art", {
      id: "art", name: "Original design", blurb: "An original flat laser design drawn from scratch for this request: signs and name plates with their own shapes, ornaments, coasters, keychains, wall art, mandalas, logos, stands and decorations of flat interlocking pieces, engraved pictures and text. Has no presets.",
      presets: [], fields: [],
    });
    byId.set("parametric", {
      id: "parametric", name: "Parametric sculpture", blurb: "Sliced 3D sculptures (fins, stacked layers, waffle grids, radial and folded paper) of faces, waves, flowers, vases, lamps, clocks and words. Pick the closest preset; its shape cannot be changed here.",
      presets: PARAMETRIC_PRESETS.map((p) => ({ id: p.id, name: p.name, note: [p.note, p.category, ...(p.tags ?? [])].join("; ") })), fields: [],
    });
    return AI_PRODUCTS.map((id) => byId.get(id)!).filter(Boolean);
  })();
  return cached;
}

/** The product list for the first step: what each product makes and the presets to start from. */
export function productsText(menu: MenuProduct[]): string {
  return menu.map((p) => [`## ${p.id}: ${p.name}`, p.blurb, "Presets:", ...p.presets.map((pr) => `- ${pr.id}: ${pr.name} (${pr.note})`)].join("\n")).join("\n\n");
}

function fieldLine(f: DField): string {
  const help = f.help ? ` - ${f.help}` : "";
  switch (f.kind) {
    case "number": return `${f.key} | number${f.unit ? ` ${f.unit}` : ""} ${f.min}..${f.max}${f.int ? " whole" : ""} | ${f.label}${help}`;
    case "choice": return `${f.key} | one of: ${f.options.map((o) => `${o.v} (${o.text})`).join(", ")} | ${f.label}${help}`;
    case "toggle": return `${f.key} | true or false | ${f.label}${help}`;
    case "text": return `${f.key} | text up to ${f.maxLength} characters | ${f.label}${help}`;
  }
}

/** The chosen product's settings, one per line: key | type and range | label - help. */
export function fieldsText(p: MenuProduct): string {
  return p.fields.map(fieldLine).join("\n");
}
