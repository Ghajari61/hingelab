/**
 * Creating, checking and migrating studio documents. Every stored document carries schemaVersion;
 * `migrateDocument` upgrades older versions step by step (one tested function per step).
 */
import { defaultCutLayers, LAYER_COUNT } from "./cutLayers";
import { DEFAULT_MACHINE, DEFAULT_MATERIAL } from "./library";
import { isUnits } from "./units";
import type { Document, GroupNode, Mat, Sheet, Units } from "./types";

export const SCHEMA_VERSION = 1;

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface NewDocumentOptions {
  name: string;
  units?: Units;
  sheet?: { w: number; h: number; name?: string };
  /** Landscape swaps a portrait sheet so that w ≥ h. */
  orientation?: "portrait" | "landscape";
  materialId?: string;
  machineId?: string;
  origin?: Document["origin"];
  id?: string;
  now?: string;
}

export function emptyRoot(): GroupNode {
  return { id: "root", type: "group", transform: [...IDENTITY], layer: 0, children: [] };
}

export function createDocument(o: NewDocumentOptions): Document {
  const now = o.now ?? new Date().toISOString();
  let w = o.sheet?.w ?? 300, h = o.sheet?.h ?? 200;
  if (o.orientation === "landscape" && h > w) [w, h] = [h, w];
  if (o.orientation === "portrait" && w > h) [w, h] = [h, w];
  const sheet: Sheet = {
    id: "sheet-1", name: o.sheet?.name ?? "Sheet 1", x: 0, y: 0, w, h,
    materialId: o.materialId ?? DEFAULT_MATERIAL, machineId: o.machineId ?? DEFAULT_MACHINE,
  };
  return {
    id: o.id ?? newId(),
    name: o.name,
    schemaVersion: SCHEMA_VERSION,
    units: o.units ?? "mm",
    createdAt: now,
    updatedAt: now,
    sheets: [sheet],
    cutLayers: defaultCutLayers(),
    root: emptyRoot(),
    assets: [],
    guides: [],
    grid: { size: 10, subdivisions: 5, show: true },
    snapping: { grid: false, points: true, guides: true, smart: true },
    view: { zoom: 0, x: 0, y: 0 },
    origin: o.origin ?? { kind: "blank" },
  };
}

/** Throws a readable error when a value is not a usable document. */
export function assertDocument(d: unknown): asserts d is Document {
  const fail = (why: string): never => { throw new Error(`This is not a HingeLab document (${why}).`); };
  if (!d || typeof d !== "object") fail("empty");
  const x = d as Record<string, unknown>;
  if (typeof x.id !== "string" || !x.id) fail("no id");
  if (typeof x.name !== "string") fail("no name");
  if (typeof x.schemaVersion !== "number") fail("no schema version");
  if (!isUnits(x.units)) fail("unknown units");
  if (!Array.isArray(x.sheets) || !x.sheets.length) fail("no sheets");
  for (const s of x.sheets as Record<string, unknown>[]) {
    const ok = s && ["x", "y", "w", "h"].every((k) => typeof s[k] === "number" && isFinite(s[k] as number)) && (s.w as number) > 0 && (s.h as number) > 0;
    if (!ok) fail("bad sheet size");
  }
  if (!Array.isArray(x.cutLayers) || x.cutLayers.length !== LAYER_COUNT) fail("cut layers");
  const root = x.root as Record<string, unknown> | undefined;
  if (!root || root.type !== "group" || !Array.isArray(root.children)) fail("no scene");
  const nodes = (n: Record<string, unknown>) => {
    if (n.type === "clone" && typeof n.source !== "string") fail("clone without an original");
    if (n.type === "group" && Array.isArray(n.children)) for (const c of n.children as Record<string, unknown>[]) if (c && typeof c === "object") nodes(c);
  };
  nodes(root!);
}

/** One step per schema version: MIGRATIONS[n] turns version n into n + 1. */
export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  // Version 0 was the pre-release shape used by early local saves: no cut layers, `layers` instead of `root`.
  0: (d) => {
    const { layers, ...rest } = d as Record<string, unknown> & { layers?: unknown[] };
    return {
      ...rest,
      units: isUnits(rest.units) ? rest.units : "mm",
      cutLayers: Array.isArray(rest.cutLayers) && rest.cutLayers.length === LAYER_COUNT ? rest.cutLayers : defaultCutLayers(),
      root: (rest.root as GroupNode | undefined) ?? { ...emptyRoot(), children: Array.isArray(layers) ? layers : [] },
      assets: rest.assets ?? [],
      guides: rest.guides ?? [],
      grid: rest.grid ?? { size: 10, subdivisions: 5, show: true },
      snapping: rest.snapping ?? { grid: false, points: true, guides: true, smart: true },
      view: rest.view ?? { zoom: 0, x: 0, y: 0 },
      schemaVersion: 1,
    };
  },
};

export function migrateDocument(raw: unknown): Document {
  if (!raw || typeof raw !== "object") throw new Error("This is not a HingeLab document (empty).");
  let d = { ...(raw as Record<string, unknown>) };
  let v = typeof d.schemaVersion === "number" ? d.schemaVersion : 0;
  if (v > SCHEMA_VERSION) throw new Error("This document was made by a newer version of HingeLab. Reload the app to update it.");
  while (v < SCHEMA_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from document version ${v}.`);
    d = step(d);
    v = d.schemaVersion as number;
  }
  assertDocument(d);
  return d;
}
