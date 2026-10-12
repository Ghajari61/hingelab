import type { GeneratorId } from "@/lib/generators/ids";

export const TEMPLATE_CATEGORIES = [
  "Boxes & storage", "Living hinges", "Home & decor", "Lamps & light", "Gifts & ornaments", "Games & puzzles",
  "Desk & organisers", "Signs & events", "Models & kits",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/**
 * "studio": built from live Studio shapes and effects when opened. "svg": bundled cut files opened through
 * SVG import. "editor": opens only in its classic editor, where the plan's export rules apply (Hinge Box
 * designs, and generator designs whose export needs Pro).
 */
export type TemplateSource = "studio" | "svg" | "editor";

/** The classic editor that can open a template's settings ("Customise in generator"). */
export type TemplateProduct = GeneratorId | "hinge";

export interface TemplateCredit {
  title: string;
  author: string;
  licence: string;
  licenceUrl: string;
  sourceUrl: string;
  /** What HingeLab changed (CC BY asks for it). */
  changes: string;
}

export interface TemplateMeta {
  id: string;
  title: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  /** What it is designed for, e.g. "Plywood". */
  material: string;
  /** Material thickness the joints and slots are drawn for, mm. */
  thickness: number;
  difficulty: "Easy" | "Medium" | "Advanced";
  source: TemplateSource;
  /** Set when a classic editor can customise it (settings in lib/templates/presets.ts). */
  product?: TemplateProduct;
  credit?: TemplateCredit;
  featured?: boolean;
}

/** Facts the build script measures (lib/templates/built.json). */
export interface TemplateBuilt {
  /** Overall size of the sheets, mm. */
  w: number;
  h: number;
  sheets: number;
  objects: number;
  /** Bundled SVG files under /templates/files/<id>/ ("svg" templates). */
  files?: string[];
  /** Why exporting it needs the Pro plan (the classic editor's own check). */
  pro?: string;
}

export type Template = TemplateMeta & TemplateBuilt;
