/**
 * Job estimates for sellers: what a design's exported SVG cuts, scores and engraves, how much
 * material its parts take from the sheets, how long the job runs and what the material costs.
 * Measured from the same layered SVG every editor exports, so one estimate serves them all.
 *
 * Nothing here is invented: the job time uses only speeds the user saved (for a material or for a
 * machine) and the machine's own travel speed; without them only the lengths and areas are given.
 */
import { layerOp } from "@/lib/export/lbrn2";
import type { Rect } from "@/lib/export/profiles";
import { readScene, type Poly } from "@/lib/export/scene";
import { unionShapes } from "@/lib/letters/polygon";
import type { LaserOp, UserMaterial } from "@/lib/materials/library";

export interface JobMeasure {
  /** Length of the cut lines, mm. */
  cut: number;
  /** Length of score, mark and line-engraved lines, mm. */
  score: number;
  /** Filled engraving and pictures, mm². */
  engraveArea: number;
  /** Separate cut and score paths. */
  paths: number;
  /** Moves between paths in file order, mm. */
  travel: number;
  /** Material inside the cut outlines (holes taken out), mm². */
  partsArea: number;
  /** The stock sheets the parts are laid out on. */
  sheets: { w: number; h: number }[];
}

const dist = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function length(p: Poly): number {
  let s = 0;
  for (let i = 1; i < p.pts.length; i++) s += dist(p.pts[i - 1], p.pts[i]);
  if (p.closed && p.pts.length > 2) s += dist(p.pts[p.pts.length - 1], p.pts[0]);
  return s;
}

/** Filled area of closed outlines, nested ones taken out (even-odd). */
function areaOf(polys: Poly[]): number {
  const cs = polys.filter((p) => p.closed && p.pts.length > 2).map((p) => p.pts.map(([x, y]) => [x, y] as [number, number]));
  return cs.length ? unionShapes(cs, [], true).reduce((a, s) => a + s.area, 0) : 0;
}

/** Measures a layered SVG laid out on `sheets` (the whole drawing when there are none). */
export function measureSVG(svg: string, sheets?: Rect[] | null): JobMeasure {
  const scene = readScene(svg);
  const m: JobMeasure = { cut: 0, score: 0, engraveArea: 0, paths: 0, travel: 0, partsArea: 0, sheets: [] };
  let at: [number, number] = [0, 0];
  const cutPolys: Poly[] = [];
  for (const layer of scene.layers) {
    const op = layerOp(layer.label, layer.fill);
    for (const item of layer.items) {
      for (const im of item.images) {
        const clip = im.clip?.length ? areaOf(im.clip) : 0;
        m.engraveArea += clip || Math.abs(im.w * im.h * (im.m[0] * im.m[3] - im.m[1] * im.m[2]));
      }
      if (layer.fill) { m.engraveArea += areaOf(item.polys); continue; }
      for (const p of item.polys) {
        if (p.pts.length < 2) continue;
        const len = length(p);
        if (op === "cut") { m.cut += len; cutPolys.push(p); } else m.score += len;
        m.paths++;
        m.travel += dist(at, p.pts[0]);
        at = p.closed ? p.pts[0] : p.pts[p.pts.length - 1];
      }
    }
  }
  m.partsArea = areaOf(cutPolys);
  m.sheets = sheets?.length ? sheets.map((r) => ({ w: r.w, h: r.h })) : scene.W > 0 && scene.H > 0 ? [{ w: scene.W, h: scene.H }] : [];
  return m;
}

/** Speed, mm/s, and passes for one kind of work. */
export interface OpSpeed { speed: number; passes: number }

export interface Speeds {
  cut?: OpSpeed;
  score?: OpSpeed;
  engrave?: OpSpeed;
  /** Distance between engraving lines, mm. */
  interval: number;
  /** The machine's travel speed, mm/s (0: moves not counted). */
  travel: number;
}

export interface JobTime {
  /** Seconds, or null when a kind of work in the design has no speed. */
  total: number | null;
  parts: Partial<Record<LaserOp | "travel", number>>;
  /** Work in the design with no speed to time it. */
  missing: LaserOp[];
}

export function jobTime(m: JobMeasure, s: Speeds): JobTime {
  const parts: JobTime["parts"] = {}, missing: LaserOp[] = [];
  const work: [LaserOp, number][] = [["cut", m.cut], ["score", m.score], ["engrave", s.interval > 0 ? m.engraveArea / s.interval : 0]];
  for (const [op, len] of work) {
    if (len <= 0) continue;
    const sp = s[op];
    if (!sp || !(sp.speed > 0)) { missing.push(op); continue; }
    parts[op] = (len * Math.max(1, sp.passes)) / sp.speed;
  }
  if (s.travel > 0 && m.travel > 0) parts.travel = m.travel / s.travel;
  const total = missing.length ? null : Object.values(parts).reduce((a, b) => a + (b ?? 0), 0);
  return { total, parts, missing };
}

export interface JobCost {
  sheets: number;
  /** Whole sheets at the price per sheet. */
  full: number;
  /** Only the material inside the parts, at the same price per area. */
  used: number;
  /** Share of the sheets the parts take, 0–1. */
  share: number;
}

export function jobCost(m: JobMeasure, pricePerSheet: number): JobCost | null {
  if (!m.sheets.length || !(pricePerSheet >= 0)) return null;
  const area = m.sheets.reduce((a, s) => a + s.w * s.h, 0);
  const share = area > 0 ? Math.min(1, m.partsArea / area) : 0;
  const full = m.sheets.length * pricePerSheet;
  return { sheets: m.sheets.length, full, used: full * share, share };
}

// ---------------------------------------------------------------- Settings on this device

export interface EstimateSettings {
  machine: string;
  /** Price of one sheet (null: not entered) and the currency sign shown with it. */
  price: number | null;
  currency: string;
  interval: number;
  /** The user's own speeds for each machine. */
  speeds: Record<string, Partial<Record<LaserOp, OpSpeed>>>;
}

export const ESTIMATE_KEY = "hingelab-estimate";
export const ESTIMATE_EVENT = "hingelab-estimate";
export const DEFAULT_INTERVAL = 0.1;
const OPS: LaserOp[] = ["cut", "score", "engrave"];

const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

export function cleanEstimate(raw: unknown, machine = ""): EstimateSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const speeds: EstimateSettings["speeds"] = {};
  const rs = r.speeds && typeof r.speeds === "object" ? (r.speeds as Record<string, unknown>) : {};
  for (const [id, v] of Object.entries(rs).slice(0, 50)) {
    if (!/^[\w-]{1,40}$/.test(id) || !v || typeof v !== "object") continue;
    const out: Partial<Record<LaserOp, OpSpeed>> = {};
    for (const op of OPS) {
      const q = (v as Record<string, unknown>)[op] as Record<string, unknown> | undefined;
      const speed = num(q?.speed, 0.1, 5000);
      if (speed != null) out[op] = { speed, passes: Math.round(num(q?.passes, 1, 50) ?? 1) };
    }
    if (Object.keys(out).length) speeds[id] = out;
  }
  return {
    machine: typeof r.machine === "string" && /^[\w-]{1,40}$/.test(r.machine) ? r.machine : machine,
    price: num(r.price, 0, 1e7),
    currency: typeof r.currency === "string" ? r.currency.replace(/[^\p{Sc}\p{L}]/gu, "").slice(0, 4) : "",
    interval: num(r.interval, 0.01, 2) ?? DEFAULT_INTERVAL,
    speeds,
  };
}

export function loadEstimate(machine = ""): EstimateSettings {
  try { return cleanEstimate(JSON.parse(localStorage.getItem(ESTIMATE_KEY) ?? "null"), machine); } catch { return cleanEstimate(null, machine); }
}

export function saveEstimate(s: EstimateSettings): void {
  try {
    localStorage.setItem(ESTIMATE_KEY, JSON.stringify(cleanEstimate(s, s.machine)));
    window.dispatchEvent(new Event(ESTIMATE_EVENT));
  } catch { /* private mode */ }
}

/**
 * The speeds for a job: the material's own laser settings first, then the user's speeds for the
 * machine; `from` says where each came from.
 */
export function speedsFor(mat: UserMaterial | undefined, machine: { id: string; maxSpeed: number } | undefined, s: EstimateSettings): Speeds & { from: Partial<Record<LaserOp, "material" | "machine">> } {
  const out: Speeds & { from: Partial<Record<LaserOp, "material" | "machine">> } = { interval: s.interval, travel: machine?.maxSpeed ?? 0, from: {} };
  const mine = machine ? s.speeds[machine.id] ?? {} : {};
  for (const op of OPS) {
    const ml = mat?.laser[op];
    if (ml) { out[op] = { speed: ml.speed, passes: ml.passes }; out.from[op] = "material"; }
    else if (mine[op]) { out[op] = mine[op]; out.from[op] = "machine"; }
  }
  return out;
}

// ---------------------------------------------------------------- Formatting

export function fmtLength(mm: number, units: "mm" | "in"): string {
  if (units === "in") { const ft = mm / 304.8; return ft >= 1 ? `${ft.toFixed(1)} ft` : `${(mm / 25.4).toFixed(1)} in`; }
  return mm >= 1000 ? `${(mm / 1000).toFixed(2)} m` : `${Math.round(mm)} mm`;
}

export function fmtArea(mm2: number, units: "mm" | "in"): string {
  if (units === "in") { const in2 = mm2 / 645.16; return in2 >= 144 ? `${(in2 / 144).toFixed(2)} ft²` : `${in2.toFixed(1)} in²`; }
  return mm2 >= 1e5 ? `${(mm2 / 1e6).toFixed(3)} m²` : `${(mm2 / 100).toFixed(1)} cm²`;
}

export function fmtDuration(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}

export const fmtMoney = (v: number, currency: string) => `${currency}${v.toFixed(2)}`;
