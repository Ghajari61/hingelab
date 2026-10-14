/** Help articles and option lists generated from each generator's definition (server only). */
import { ALL_GENERATORS } from "@/lib/generators/all";
import { generatorTipsSlug } from "@/lib/generators/helpMap";
import type { GeneratorId } from "@/lib/generators/ids";
import type { AnyGenerator, FieldSpec } from "@/lib/generators/types";
import type { BaseField } from "@/components/editor/fields";
import type { HelpArticle } from "./articles";

export type GenHelpField = BaseField & { sec: string; range?: string };

const UNIT_LABEL: Record<string, string> = { deg: " (°)", "%": " (%)" };

function toField(f: FieldSpec<unknown>, sec: string): GenHelpField {
  if (f.kind === "number") {
    return { id: f.key, label: f.label + (UNIT_LABEL[f.unit] ?? ""), sec, len: f.unit === "mm", step: f.step, min: f.min, max: f.max, float: !f.int };
  }
  const range = f.kind === "choice" ? f.options.map((o) => o.text).join(", ")
    : f.kind === "toggle" ? "on or off"
      : f.kind === "font" ? "any Letters font"
        : f.kind === "image" ? "a JPEG, PNG or WebP picture" : "text";
  return { id: f.key, label: f.label, sec, step: 0, range };
}

export function generatorFields(def: AnyGenerator): { fields: GenHelpField[]; help: Record<string, string> } {
  const fields: GenHelpField[] = [], help: Record<string, string> = {};
  for (const s of def.sections) for (const f of s.fields) {
    fields.push(toField(f, s.id));
    help[f.key] = f.help;
  }
  return { fields, help };
}

const presetImg = (def: AnyGenerator, id: string, name: string) => ({ src: `/presets/${def.id}/${id}.svg`, alt: `${name} preset`, caption: name });

export function generatorArticles(): HelpArticle[] {
  return ALL_GENERATORS.flatMap((def): HelpArticle[] => [
    {
      slug: def.id, product: def.id as GeneratorId, title: `${def.name} generator`,
      summary: def.help.intro[0],
      keywords: def.help.keywords,
      images: def.presets.slice(0, 3).map((p) => presetImg(def, p.id, p.name)),
      blocks: [
        ...def.help.intro.slice(1).map((p) => ({ p })),
        ...def.sections.map((s) => ({ h: s.title, p: s.help })),
        { h: "Presets", list: def.presets.map((p) => `${p.name}: ${p.note}.`) },
        { h: "Material, layers and sheet", p: "Set your material's thickness and kerf first: the kerf is applied once to every outline and hole. Engraving is filled on its own layer, which the SVG puts first so it runs before the cuts." },
      ],
      fields: def.sections.map((s) => ({ product: def.id as GeneratorId, secs: [s.id], title: s.title })),
      related: [generatorTipsSlug(def.id), "material-and-kerf", "checks-and-fixes", "layers-and-export", "sheet-and-fit"],
    },
    {
      slug: generatorTipsSlug(def.id), product: def.id as GeneratorId, title: `Tips for the ${def.name.toLowerCase()} generator`,
      summary: def.help.tips[0],
      keywords: ["tips", ...(def.help.keywords ?? []).slice(0, 3)],
      blocks: [{ list: def.help.tips }],
      related: [def.id, "checks-and-fixes"],
    },
  ]);
}
