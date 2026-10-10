/**
 * Shape buttons for the formula fields. A shape plus a few sliders (base, amplitude, waves, phase,
 * ease) writes an ordinary formula string, so the engine still only ever sees `expression`s.
 * The picker owns a field only while the stored formula is exactly what its spec writes; a typed
 * formula is left alone and shown as custom.
 */
import { compileFormula } from "./source/formula";
import type { FormulaSpec, ParametricParams } from "./types";

export type ShapeId = "constant" | "sine" | "arch" | "bulge" | "ramp" | "steps" | "leaf" | "ellipse" | "heart" | "star";
export type ShapeDir = "x" | "y" | "radial" | "along" | "around";
export type ShapeTargetId = "finLength" | "finHeight" | "twist" | "outline" | FormulaSpec["type"];

export interface ShapeSpec {
  shape: ShapeId;
  base: number;
  amp: number;
  /** Repeats (Steps: number of steps; Star: points). */
  waves: number;
  /** Shift, as a fraction of one wave (outline: of a turn). */
  phase: number;
  /** Sharpness or softness; 1 is the plain shape. */
  ease: number;
  dir?: ShapeDir;
}

export type ShapeSlider = "base" | "amp" | "waves" | "phase" | "ease";

export const SHAPES: { id: ShapeId; name: string; short?: string; title: string }[] = [
  { id: "constant", name: "Constant", title: "The same value everywhere" },
  { id: "sine", name: "Sine wave", short: "Wave", title: "Smooth waves up and down" },
  { id: "arch", name: "Arch", title: "Rises and falls back, like a bridge" },
  { id: "bulge", name: "Bulge", title: "A soft bump in the middle" },
  { id: "ramp", name: "Ramp", title: "Rises steadily from one end to the other" },
  { id: "steps", name: "Steps", title: "Flat steps up" },
  { id: "leaf", name: "Leaf", title: "Pointed at both ends, fullest near the start" },
  { id: "ellipse", name: "Ellipse", title: "A round dome (outline: an oval)" },
  { id: "heart", name: "Heart", title: "Two round lobes (outline: a heart)" },
  { id: "star", name: "Star", title: "Sharp spikes (outline: a star)" },
];

export interface ShapeTarget {
  id: ShapeTargetId;
  /** Outline r(phi): the shape is drawn round the centre. */
  polar: boolean;
  /** Base and amplitude are lengths in mm (shown in the user's units). */
  len: boolean;
  /** The base has no effect (a surface is lifted to its own Base field), so it gets no slider. */
  baseless?: boolean;
  base: { label: string; min: number; max: number; step: number };
  amp: { label: string; min: number; max: number; step: number };
  dirs?: { v: ShapeDir; text: string }[];
  /** The spec a newly opened field starts from (and that a default formula is recognised by). */
  defaults: ShapeSpec;
}

const spec = (shape: ShapeId, base: number, amp: number, extra: Partial<ShapeSpec> = {}): ShapeSpec => ({ shape, base, amp, waves: 1, phase: 0, ease: 1, ...extra });

export const SHAPE_TARGETS: Record<ShapeTargetId, ShapeTarget> = {
  finLength: {
    id: "finLength", polar: false, len: true,
    base: { label: "Length", min: 5, max: 400, step: 1 }, amp: { label: "Change", min: -200, max: 200, step: 1 },
    defaults: spec("sine", 60, 20),
  },
  finHeight: {
    id: "finHeight", polar: false, len: true,
    base: { label: "Height at the ends", min: 1, max: 150, step: 0.5 }, amp: { label: "Rise", min: -150, max: 150, step: 0.5 },
    defaults: spec("arch", 5, 15),
  },
  twist: {
    id: "twist", polar: false, len: false,
    base: { label: "Twist °", min: -45, max: 45, step: 0.5 }, amp: { label: "Swing °", min: -45, max: 45, step: 0.5 },
    defaults: spec("sine", 0, 12),
  },
  outline: {
    id: "outline", polar: true, len: true,
    base: { label: "Size (radius)", min: 20, max: 600, step: 1 }, amp: { label: "Amount", min: 0, max: 0.9, step: 0.01 },
    defaults: spec("leaf", 160, 0.5),
  },
  heightfield: {
    id: "heightfield", polar: false, len: true, baseless: true,
    base: { label: "Offset", min: 0, max: 100, step: 0.5 }, amp: { label: "Relief depth", min: -100, max: 100, step: 0.5 },
    dirs: [{ v: "x", text: "Along X" }, { v: "y", text: "Along Y" }, { v: "radial", text: "From the centre" }],
    defaults: spec("sine", 0, 12, { waves: 3, dir: "x" }),
  },
  revolution: {
    id: "revolution", polar: false, len: true,
    base: { label: "Radius", min: 5, max: 300, step: 0.5 }, amp: { label: "Change", min: -150, max: 150, step: 0.5 },
    defaults: spec("bulge", 30, 30, { ease: 2 }),
  },
  "radial-profile": {
    id: "radial-profile", polar: false, len: true,
    base: { label: "Height at the hub", min: 1, max: 100, step: 0.5 }, amp: { label: "Rise", min: -100, max: 100, step: 0.5 },
    dirs: [{ v: "along", text: "Along the fin" }, { v: "around", text: "Round the centre" }],
    defaults: spec("bulge", 8, 22, { dir: "along" }),
  },
};

/** Sliders that change the shape (the rest are hidden). */
export function shapeSliders(shape: ShapeId, target: ShapeTargetId): ShapeSlider[] {
  const t = SHAPE_TARGETS[target];
  const all: ShapeSlider[] = shape === "constant" ? ["base"]
    : shape === "sine" || shape === "steps" ? ["base", "amp", "waves", "phase"]
    : t.polar && (shape === "ellipse" || shape === "heart") ? ["base", "amp", "phase"]
    : ["base", "amp", "waves", "phase", "ease"];
  return t.baseless ? all.filter((k) => k !== "base") : all;
}

export const SLIDER_LIMITS = {
  waves: { min: 1, max: 24, step: 1 },
  phase: { min: 0, max: 1, step: 0.01 },
  ease: { min: 0.2, max: 4, step: 0.05 },
} as const;

export const wavesLabel = (shape: ShapeId) => (shape === "steps" ? "Steps" : shape === "star" ? "Points" : "Waves");

/** What the formula's variable means: the domain and size that the fraction u is measured over. */
export interface ShapeContext {
  domain?: FormulaSpec["domain"];
  height?: number;
}

/* ---------- Expression writing ---------- */

const num = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return String(Object.is(r, -0) ? 0 : r);
};
/** One function call such as `mod(t + 0.5, 1)`, closed by its last character. */
const isCall = (s: string) => {
  const m = /^[A-Za-z_]\w*\(/.exec(s);
  if (!m || !s.endsWith(")")) return false;
  let depth = 0;
  for (let i = m[0].length - 1; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")" && --depth === 0) return i === s.length - 1;
  }
  return false;
};
const atomic = (s: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) || /^\d+(\.\d+)?$/.test(s) || isCall(s);
/** `a/b` and plain products can follow a `k*`; sums need brackets. */
const productSafe = (s: string) => atomic(s) || /^[A-Za-z0-9_.]+(\/[A-Za-z0-9_.]+)?$/.test(s) || /^[A-Za-z0-9_.]+\/\([^()]*\)$/.test(s);
const par = (s: string) => (atomic(s) ? s : `(${s})`);
const times = (k: number, s: string) => (k === 1 ? s : `${num(k)}*${productSafe(s) ? s : `(${s})`}`);
const power = (s: string, e: number) => (Math.abs(e - 1) < 1e-9 ? s : `${par(s)}^${num(e)}`);

/** The fraction u (0..1) and the angle k·π·u written in the formula's own variables. */
interface Var {
  u: string;
  ang: (k: number) => string;
}

function linear(u: string): Var {
  return { u, ang: (k) => `${k === 1 ? "" : `${num(k)}*`}pi*${productSafe(u) ? u : `(${u})`}` };
}
function angular(sym: string): Var {
  return { u: `${sym}/(2*pi)`, ang: (k) => (k === 2 ? sym : `${num(k / 2)}*${sym}`) };
}

function variableOf(target: ShapeTargetId, s: ShapeSpec, ctx: ShapeContext): Var {
  switch (target) {
    case "finLength": case "twist": return linear("t");
    case "finHeight": return linear("s/L");
    case "outline": return angular("phi");
    case "revolution": return linear(`h/${num(Math.max(1e-6, ctx.height ?? 100))}`);
    case "radial-profile": {
      if (s.dir === "around") return angular("theta");
      const d = ctx.domain?.x ?? [20, 120];
      return linear(`s/${num(Math.max(1e-6, Math.abs(d[1] - d[0])))}`);
    }
    case "heightfield": {
      const dx = ctx.domain?.x ?? [-100, 100], dy = ctx.domain?.y ?? [-100, 100];
      const shift = (sym: string, lo: number) => (lo === 0 ? sym : lo < 0 ? `${sym} + ${num(-lo)}` : `${sym} - ${num(lo)}`);
      if (s.dir === "y") return linear(`(${shift("y", dy[0])})/${num(Math.max(1e-6, dy[1] - dy[0]))}`);
      if (s.dir === "radial") {
        const cx = (dx[0] + dx[1]) / 2, cy = (dy[0] + dy[1]) / 2;
        const sq = (sym: string, c: number) => (c === 0 ? `${sym}^2` : `(${shift(sym, c)})^2`);
        const r = Math.max(1e-6, Math.min(dx[1] - dx[0], dy[1] - dy[0]) / 2);
        // The profile is spun round the centre: its middle sits on the centre and its end on the edge.
        return linear(`0.5 + sqrt(${sq("x", cx)} + ${sq("y", cy)})/${num(2 * r)}`);
      }
      return linear(`(${shift("x", dx[0])})/${num(Math.max(1e-6, dx[1] - dx[0]))}`);
    }
  }
}

/** k·π·u plus the phase (a fraction of one wave of length 2/k·… ), written as one angle. */
function angle(v: Var, k: number, phase: number, perWave: number) {
  const a = v.ang(k);
  return phase ? `${a} + ${num(perWave * phase)}*pi` : a;
}

/** The 0..1 fraction repeated `waves` times and shifted by `phase`. */
function frac(v: Var, s: ShapeSpec) {
  const n = Math.max(1, Math.round(s.waves));
  if (n === 1 && !s.phase) return v.u;
  return `mod(${times(n, v.u)}${s.phase ? ` + ${num(s.phase)}` : ""}, 1)`;
}

/** The unit profile p(u): 0..1 for most shapes, −1..1 for the sine wave. */
function profile(s: ShapeSpec, v: Var): string {
  const n = Math.max(1, Math.round(s.waves)), e = Math.max(0.05, s.ease);
  switch (s.shape) {
    case "constant": return "0";
    case "sine": return `sin(${angle(v, 2 * n, s.phase, 2)})`;
    case "arch": {
      if (n === 1 && !s.phase && e === 1) return `sin(${v.ang(1)})`;
      return power(`abs(sin(${angle(v, n, s.phase, 1)}))`, e);
    }
    case "bulge": return `exp(-((${frac(v, s)} - 0.5)/${num(0.18 * e)})^2)`;
    case "ramp": return power(frac(v, s), e);
    case "steps": {
      const k = Math.max(2, n);
      const f = s.phase ? `mod(${v.u} + ${num(s.phase)}, 1)` : v.u;
      return `min(floor(${times(k, f)}), ${k - 1})/${k - 1}`;
    }
    case "leaf": {
      const f = frac(v, s);
      return `${power(`abs(sin(pi*${productSafe(f) ? f : `(${f})`}))`, e)}*(1.25 - ${times(0.5, f)})`;
    }
    case "ellipse": return `max(0, 1 - (${times(2, frac(v, s))} - 1)^2)^${num(0.5 * e)}`;
    case "heart": return `max(0, 1 - (abs(${times(4, frac(v, s))} - 2) - 1)^2)^${num(0.5 * e)}`;
    case "star": return power(`abs(cos(${angle(v, n, s.phase, 1)}))`, 4 * e);
  }
}

const plus = (base: number, amp: number, p: string) => {
  if (!amp || p === "0") return num(base);
  const term = `${num(Math.abs(amp))}*${p}`.replace(/^1\*/, "");
  if (!base) return amp < 0 ? `-${term}` : term;
  return `${num(base)} ${amp < 0 ? "-" : "+"} ${term}`;
};

/** r(phi) round the centre: always positive for amounts up to 0.9. */
function polarExpr(s: ShapeSpec, v: Var): string {
  const R = Math.max(1, s.base), a = Math.min(0.9, Math.max(0, s.amp)), e = Math.max(0.05, s.ease);
  const ph = s.phase ? `(phi - ${num(2 * s.phase)}*pi)` : "phi";
  switch (s.shape) {
    case "constant": return num(R);
    case "ellipse": {
      const k = 1 - 0.9 * a;
      return `${num(R * k)}/sqrt((${num(k)}*cos(${ph}))^2 + sin(${ph})^2)`;
    }
    case "leaf": {
      const q = Math.min(4, Math.max(0.6, 1.25 * e)), k = Math.max(0.1, 1 - 0.8 * a);
      return `${num(R)}/(abs(cos(${ph}))^${num(q)} + (abs(sin(${ph}))/${num(k)})^${num(q)})^${num(1 / q)}`;
    }
    case "heart":
      return `${num(R)}*(1 + ${num(a)}*((2 - 2*sin(${ph}) + sin(${ph})*sqrt(abs(cos(${ph})))/(sin(${ph}) + 1.4))/2 - 1))`;
    case "star": {
      const n = Math.max(2, Math.round(s.waves));
      return `${num(R)}*(1 - ${num(a)} + ${num(a)}*abs(cos(${num(n / 2)}*${ph}))^${num(2 * e)})`;
    }
    default: {
      if (!a) return num(R);
      return `${num(R)}*(1 + ${num(a)}*${profile(s, v)})`;
    }
  }
}

/** The formula a shape writes for a field. */
export function shapeExpression(target: ShapeTargetId, s: ShapeSpec, ctx: ShapeContext = {}): string {
  const v = variableOf(target, s, ctx);
  if (SHAPE_TARGETS[target].polar) return polarExpr(s, v);
  return plus(s.base, s.shape === "constant" ? 0 : s.amp, profile(s, v));
}

export const SHAPE_SYMBOLS: Record<ShapeTargetId, string[]> = {
  finLength: ["t"], twist: ["t"], finHeight: ["t", "s", "L"], outline: ["phi"],
  heightfield: ["x", "y"], revolution: ["h"], "radial-profile": ["theta", "s"],
};

/**
 * The spec that writes exactly this formula: the stored spec, a plain number (Constant), or the
 * field's starting shape. Null for a formula typed by hand.
 */
export function recognise(target: ShapeTargetId, expression: string, stored: ShapeSpec | undefined, ctx: ShapeContext = {}): ShapeSpec | null {
  const expr = expression.trim();
  if (stored && shapeExpression(target, stored, ctx) === expr) return stored;
  const t = SHAPE_TARGETS[target];
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    const c = { ...t.defaults, shape: "constant" as const, base: Number(expr) };
    if (shapeExpression(target, c, ctx) === expr) return c;
  }
  if (shapeExpression(target, t.defaults, ctx) === expr) return t.defaults;
  return null;
}

/** A new spec when a shape button is pressed: keeps the size from the current one. */
export function pickShape(target: ShapeTargetId, shape: ShapeId, current: ShapeSpec | null): ShapeSpec {
  const t = SHAPE_TARGETS[target];
  const from = current ?? t.defaults;
  const amp = from.shape === "constant" || (t.polar && !from.amp) ? t.defaults.amp : from.amp;
  const waves = shape === "star" ? (t.polar ? 5 : 3) : shape === "steps" ? 4 : shape === "sine" && !t.polar && target === "heightfield" ? 3 : 1;
  return { shape, base: from.base, amp, waves, phase: 0, ease: 1, dir: from.dir ?? t.defaults.dir };
}

export const contextOf = (src: FormulaSpec): ShapeContext => ({ domain: src.domain, height: src.height });

/** Where each field's formula lives in the params. */
export function fieldExpression(p: ParametricParams, target: ShapeTargetId): string | null {
  const cn = p.curveNormal;
  if (target === "finLength") return cn.finLength;
  if (target === "finHeight") return cn.finHeight;
  if (target === "twist") return cn.twist;
  if (target === "outline") return cn.outerBoundary.kind === "formula" ? cn.outerBoundary.expression : null;
  return p.source.kind === "formula" && p.source.type === target ? p.source.expression : null;
}

/** Write a shape into its field (the formula and the spec together). */
export function applyShape(p: ParametricParams, target: ShapeTargetId, s: ShapeSpec): void {
  const ctx = p.source.kind === "formula" ? contextOf(p.source) : {};
  const expr = shapeExpression(target, s, ctx);
  const cn = p.curveNormal;
  if (target === "finLength") cn.finLength = expr;
  else if (target === "finHeight") cn.finHeight = expr;
  else if (target === "twist") cn.twist = expr;
  else if (target === "outline") cn.outerBoundary = { kind: "formula", expression: expr };
  else if (p.source.kind === "formula" && p.source.type === target) p.source.expression = expr;
  else return;
  p.shapes = { ...p.shapes, [target]: { ...s } };
}

/**
 * After an edit: a formula source drawn by a shape follows its domain and height (they are
 * written into the formula as numbers). Typed formulas are left as they are.
 */
export function syncShapes(prev: ParametricParams, next: ParametricParams): void {
  const a = prev.source, b = next.source;
  if (a.kind !== "formula" || b.kind !== "formula" || a.type !== b.type || a.expression !== b.expression) return;
  const before = contextOf(a), after = contextOf(b);
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const s = recognise(a.type, a.expression, prev.shapes?.[a.type], before);
  if (s && s.shape !== "constant") applyShape(next, b.type, s);
}

/* ---------- Button icons ---------- */

/** A 24 × 16 icon path drawn from the shape's own formula. */
export function shapeIconPath(shape: ShapeId, polar: boolean): string {
  const target: ShapeTargetId = polar ? "outline" : "finLength";
  const t = SHAPE_TARGETS[target];
  const s = pickShape(target, shape, polar ? { ...t.defaults, base: 10, amp: 0.45 } : { ...t.defaults, base: 0, amp: 1 });
  const f = compileFormula(shapeExpression(target, s), SHAPE_SYMBOLS[target]);
  const pts: [number, number][] = [];
  if (polar) {
    for (let i = 0; i < 96; i++) { const phi = (2 * Math.PI * i) / 96, r = f({ phi }); pts.push([r * Math.cos(phi), -r * Math.sin(phi)]); }
  } else {
    for (let i = 0; i <= 64; i++) { const t = i / 64; pts.push([t, -(shape === "constant" ? 0.5 : f({ t }))]); }
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = polar ? 14 / Math.max(x1 - x0, y1 - y0, 1e-9) : 20 / Math.max(x1 - x0, 1e-9);
  const flat = y1 - y0 < 1e-9;
  const sy = polar ? sx : flat ? 0 : 12 / (y1 - y0);
  const ox = polar ? 12 - ((x0 + x1) / 2) * sx : 2 - x0 * sx;
  const oy = polar ? 8 - ((y0 + y1) / 2) * sy : flat ? 8 : 14 - y1 * sy;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * sx + ox).toFixed(2)} ${(y * sy + oy).toFixed(2)}`).join("");
  return polar ? `${d}Z` : d;
}
