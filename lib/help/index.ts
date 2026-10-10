/** The help centre: articles plus option lists generated from each product's field definitions. */
import { FIELDS, type BaseField } from "@/components/editor/fields";
import { LETTER_FIELDS } from "@/components/letters/fields";
import { PARAM_FIELDS } from "@/components/parametric/fields";
import { ALL_GENERATORS } from "@/lib/generators/all";
import type { GeneratorId } from "@/lib/generators/ids";
import { ARTICLES as BASE_ARTICLES, PRODUCT_NAMES, type FieldGroupRef, type HelpArticle } from "./articles";
import { HINGE_FIELD_HELP, LETTER_FIELD_HELP, PARAM_FIELD_HELP } from "./fieldHelp";
import { generatorArticles, generatorFields } from "./generators";
import type { HelpIndexEntry } from "./search";
import type { HelpProduct } from "./sections";

export { PRODUCT_NAMES };
export type { HelpArticle };

/** Every article: the written ones, then one overview and one tips article per generator. */
export const ARTICLES: HelpArticle[] = [...BASE_ARTICLES, ...generatorArticles()];

type AnyField = BaseField & { sec: string; range?: string };

export const FIELD_SOURCES: Record<HelpProduct | GeneratorId, { fields: AnyField[]; help: Record<string, string> }> = {
  hinge: { fields: FIELDS, help: HINGE_FIELD_HELP },
  letters: { fields: LETTER_FIELDS, help: LETTER_FIELD_HELP },
  parametric: { fields: PARAM_FIELDS, help: PARAM_FIELD_HELP },
  ...(Object.fromEntries(ALL_GENERATORS.map((d) => [d.id, generatorFields(d)])) as Record<GeneratorId, { fields: AnyField[]; help: Record<string, string> }>),
};

export interface FieldEntry {
  id: string;
  label: string;
  /** "mm", or "" for counts and ratios. */
  unit: string;
  range: string;
  /** Empty for choices, switches and text. */
  step: string;
  help: string;
}

const num = (v: number) => String(Math.round(v * 1000) / 1000);

export function fieldEntry(f: AnyField, help: string): FieldEntry {
  const unit = f.len ? "mm" : "";
  const u = unit ? ` ${unit}` : "";
  if (f.range) return { id: f.id, label: f.label, unit, range: f.range, step: "", help };
  const range = f.min != null && f.max != null ? `${num(f.min)} to ${num(f.max)}${u}`
    : f.min != null ? `${num(f.min)}${u} or more`
      : f.max != null ? `up to ${num(f.max)}${u}` : "any";
  return { id: f.id, label: f.label, unit, range, step: `${num(f.step)}${u}`, help };
}

export function fieldGroup(ref: FieldGroupRef): FieldEntry[] {
  const src = FIELD_SOURCES[ref.product];
  return src.fields.filter((f) => ref.secs.includes(f.sec)).map((f) => fieldEntry(f, src.help[f.id] ?? ""));
}

export const articleBySlug = (slug: string) => ARTICLES.find((a) => a.slug === slug);

/** Articles grouped by product, in the order the help centre lists them. */
export function articlesByProduct(): { product: HelpArticle["product"]; name: string; articles: HelpArticle[] }[] {
  return (Object.keys(PRODUCT_NAMES) as HelpArticle["product"][]).map((product) => ({
    product, name: PRODUCT_NAMES[product], articles: ARTICLES.filter((a) => a.product === product),
  }));
}

export function helpIndex(): HelpIndexEntry[] {
  return ARTICLES.map((a) => ({
    slug: a.slug,
    product: PRODUCT_NAMES[a.product],
    title: a.title,
    summary: a.summary,
    keywords: (a.keywords ?? []).join(" "),
    body: [
      ...a.blocks.flatMap((b) => [b.h, b.p, ...(b.list ?? [])]),
      ...(a.fields ?? []).flatMap((g) => fieldGroup(g).flatMap((f) => [f.label, f.help])),
    ].filter(Boolean).join(" "),
  }));
}
