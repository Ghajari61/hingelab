import { AXIS_NAMES, lenText, mmSetting, numberGrip, ratioSetting, type Grip, type GripAxis, type GripSet, type SizeSetting } from "../three/grips";
import { itemInName } from "./items";
import { getPath, setPath } from "./path";
import type { AnyGenerator, GenBase, NumberSpec } from "./types";

/** A number setting a 3D handle drags: a size on the scale gizmo, or a turn ring. */
export interface GripSpec {
  kind: "size" | "turn";
  axis: GripAxis;
  key: string;
  /** Setting change per mm (or degree) dragged. */
  k?: number;
}

const dims = (d: string, depth = true): GripSpec[] => [
  { kind: "size", axis: "x", key: `${d}.width` },
  ...(depth ? [{ kind: "size" as const, axis: "z" as const, key: `${d}.depth` }] : []),
  { kind: "size", axis: "y", key: `${d}.height` },
];

/** Designs whose handles set their own settings; the rest are scaled as a whole with `scale`. */
const SPECS: Record<string, (p: GenBase & Record<string, unknown>) => GripSpec[]> = {
  boxes: (p) => {
    switch (p.design as string) {
      case "hex": return [{ kind: "size", axis: "x", key: "hex.width" }, { kind: "size", axis: "z", key: "hex.width" }, { kind: "size", axis: "y", key: "hex.height" }];
      case "sign": return dims("sign", false);
      case "frame": return [{ kind: "size", axis: "x", key: "frame.photoW" }, { kind: "size", axis: "y", key: "frame.photoH" }];
      case "stand": return [...dims("stand", false), { kind: "turn", axis: "x", key: "stand.angle" }];
      case "keys": return [...dims("keys", false), { kind: "size", axis: "z", key: "keys.reach" }];
      default: return dims(p.design as string);
    }
  },
};

/**
 * What sizes each item on a product (lib/generators/items.ts), by generator: the setting, or several
 * grown together. `parts` does the same for parts that are an item cut out (raised letters).
 */
interface ItemSizes { items: Record<string, string[]>; parts?: [RegExp, string[]][] }
const ITEM_SIZES: Record<string, (p: GenBase & Record<string, unknown>) => ItemSizes> = {
  clock: () => ({ items: { Numerals: ["markers.size"], Ticks: ["markers.tickLength", "markers.tickWidth"], Dots: ["markers.dot"], Inscription: ["inscription.size"] } }),
  puzzle: () => ({ items: { Text: ["engrave.size"], Numbers: ["engrave.numberSize"], Picture: ["engrave.zoom"] } }),
  qr: () => ({ items: { Code: ["code.size"], Label: ["label.size"], Logo: ["logo.size"] } }),
  boxes: (p) => ({ items: { Text: [p.design === "sign" ? "sign.size" : p.design === "keys" ? "keys.size" : "engrave.size"], Motif: ["engrave.motifSize"] } }),
  topper: () => ({
    items: { Text: ["text.size"], Motif: ["motif.size"], Name: ["cupcake.textSize"] },
    parts: [[/^Front letters$/, ["text.size", "motif.size"]]],
  }),
  keyrack: () => ({
    items: { Text: ["text.size"], Motif: ["motif.size"], "Hook labels": ["hooks.labelSize"] },
    parts: [[/^Raised letters$/, ["text.size", "motif.size"]]],
  }),
  sign: () => ({
    items: { Text: ["text.size"], Motif: ["motif.size"] },
    parts: [[/^(Letters|Letter \d+|Inlay \d+)$/, ["text.size", "motif.size"]]],
  }),
  tablenum: () => ({
    items: { Number: ["text.size"], Label: ["text.labelSize"], Name: ["text.nameSize"], Motif: ["motif.size"] },
    parts: [[/^(Number|Front number|Back number)\b/, ["text.size", "text.labelSize", "text.nameSize", "motif.size"]]],
  }),
  trophy: () => ({ items: { "Emblem text": ["emblem.size"], Title: ["plate.titleSize"], Name: ["plate.nameSize"], Year: ["plate.nameSize"] } }),
  shadowbox: () => ({ items: { Words: ["text.size"], Photo: ["photo.zoom"] } }),
};

/** The settings that size the 3D object named `name` (`Sign · Text`, `Raised letters`), or null. */
export function itemKeys(id: string, p: GenBase, name: string | null): string[] | null {
  const of = ITEM_SIZES[id];
  if (!of || !name) return null;
  const sizes = of(p as never), item = itemInName(name);
  if (item) return sizes.items[item] ?? null;
  return sizes.parts?.find(([re]) => re.test(name))?.[1] ?? null;
}

/**
 * The scale gizmo of a text, motif, number or picture on a product: it sits on that item alone and
 * sizes it evenly; `write` gets the new settings when a drag ends.
 */
export function itemGrips(id: string, sections: SectionsLike, p: GenBase, name: string | null, write: (values: Record<string, number>) => void, units: "mm" | "in"): GripSet | null {
  const keys = itemKeys(id, p, name);
  if (!keys) return null;
  const settings: SizeSetting[] = [];
  for (const key of new Set(keys)) {
    const f = numberField(sections, key), v0 = getPath(p, key);
    if (!f || typeof v0 !== "number" || !(v0 > 0)) continue;
    const show = (v: number) => `${f.label} ${f.unit === "mm" ? lenText(v, units) : f.unit === "%" ? `${v}%` : f.unit === "deg" ? `${v}°` : v}`;
    settings.push(ratioSetting(key, ["x", "y", "z"], { v0, min: f.min, max: f.max, step: f.step }, show));
  }
  return settings.length ? { size: { settings, write, part: true, uniform: true, thin: 1.5 } } : null;
}

/** Number fields as the editors and the Windows app's catalog both describe them. */
type NumberFieldLike = Pick<NumberSpec<unknown>, "key" | "label" | "unit" | "min" | "max" | "step">;
type SectionsLike = { fields: { kind: string; key?: string }[] }[];

export function numberField(sections: SectionsLike, key: string): NumberFieldLike | undefined {
  for (const s of sections) for (const f of s.fields) if (f.kind === "number" && f.key === key) return f as unknown as NumberFieldLike;
  return undefined;
}

/**
 * The handles of a design with its own (Boxes), or null for one without. `write` sets settings by dot
 * path: the scale gizmo's when a drag ends (`done`), a ring's as it turns. `sections` gives each
 * setting's label, unit, limits and step.
 */
export function specGrips(id: string, sections: SectionsLike, p: GenBase, write: (values: Record<string, number>, done: boolean) => void, units: "mm" | "in"): GripSet | null {
  const spec = SPECS[id];
  if (!spec) return null;
  const sizes = new Map<string, { axes: GripAxis[]; k?: number }>();
  const grips: Grip[] = [];
  for (const g of spec(p as never)) {
    const f = numberField(sections, g.key), v0 = getPath(p, g.key);
    if (!f || typeof v0 !== "number") continue;
    const show = (v: number) => `${f.label} ${f.unit === "mm" ? lenText(v, units) : f.unit === "deg" ? `${v}°` : v}`;
    if (g.kind === "size") {
      const s = sizes.get(g.key);
      if (s) s.axes.push(g.axis);
      else sizes.set(g.key, { axes: [g.axis], k: g.k });
      continue;
    }
    grips.push(numberGrip(`${g.kind}-${g.axis}-${g.key}`, g.kind, g.axis, {
      v0, min: f.min, max: f.max, step: f.step, k: g.k,
      set: (v, done) => write({ [g.key]: v }, done),
      show,
    }));
  }
  const settings: SizeSetting[] = [];
  for (const [key, s] of sizes) {
    const f = numberField(sections, key)!, v0 = getPath(p, key) as number;
    settings.push(mmSetting(key, s.axes, { v0, min: f.min, max: f.max, step: f.step, k: s.k }, (v) => `${f.label} ${f.unit === "mm" ? lenText(v, units) : v}`));
  }
  return { ...(settings.length ? { size: { settings, write: (values) => write(values, true) } } : {}), ...(grips.length ? { grips } : {}) };
}

/** Settings written by dot path onto `p`. */
export function withValues<P>(p: P, values: Record<string, number>): P {
  let out = p;
  for (const [k, v] of Object.entries(values)) out = setPath(out, k, v);
  return out;
}

/**
 * A generator's 3D handles for the selected object `selected`: a text, motif, number or picture
 * sizes its own setting; any other part gets the design's handles. `size` is the assembled design's
 * size (x, y, z) in mm: designs scaled as a whole get no handle along an axis thinner than a few
 * sheets (a flat clock is not made thicker).
 */
export function generatorGrips<P extends GenBase>(def: AnyGenerator, p: P, set: (p: P, record: boolean) => void, units: "mm" | "in", size: [number, number, number] | null, selected: string | null = null): GripSet {
  const item = itemGrips(def.id, def.sections, p, selected, (values) => set(withValues(p, values), true), units);
  if (item) return item;
  const own = specGrips(def.id, def.sections, p, (values, done) => set(withValues(p, values), done), units);
  if (own) return own;
  if (!def.scale || !size) return {};
  const axes = (["x", "z", "y"] as GripAxis[]).filter((a) => size["xyz".indexOf(a)] > 4 * p.T);
  if (!axes.length) return {};
  const ext = size["xyz".indexOf(axes[0])];
  return {
    size: {
      settings: [ratioSetting("scale", axes, { v0: 1, min: 0.2, max: 5, step: 0.001 }, (s) => `${AXIS_NAMES[axes[0]]} ${lenText(ext * s, units)} (${Math.round(s * 100)}%)`)],
      write: ({ scale }) => { if (scale && scale !== 1) set(def.scale!(p, scale), true); },
      uniform: true,
    },
  };
}
