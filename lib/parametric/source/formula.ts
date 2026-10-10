/**
 * Formula sources. Expressions are parsed with mathjs and then compiled by walking the parse tree
 * into plain closures over an allow-list of symbols and functions: nothing from mathjs (or eval)
 * runs at evaluation time, so a formula can only do arithmetic.
 */
import { parse, type MathNode } from "mathjs";
import { LIMITS } from "../defaults";
import type { FormulaSpec, MeshData } from "../types";
import { heightfieldBlock, revolution } from "./library";

type Fn = (...a: number[]) => number;
export type Evaluator = (vars: Record<string, number>) => number;

const smoothstep = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

function functions(seed: number): Record<string, Fn> {
  const n = makeNoise(seed);
  return {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
    min: (...a) => Math.min(...a), max: (...a) => Math.max(...a),
    mod: (a, b) => ((a % b) + b) % b,
    clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
    smoothstep,
    noise2: (x, y) => n.noise2(x, y),
    noise3: (x, y, z) => n.noise3(x, y, z),
  };
}

export const ALLOWED_FUNCTIONS = ["sin", "cos", "tan", "asin", "acos", "atan", "atan2", "sqrt", "abs", "exp", "log", "pow", "min", "max", "floor", "ceil", "mod", "noise2", "noise3", "smoothstep", "clamp"];
const ARITY: Record<string, [number, number]> = { atan2: [2, 2], pow: [2, 2], mod: [2, 2], min: [1, 99], max: [1, 99], clamp: [3, 3], smoothstep: [3, 3], noise2: [2, 2], noise3: [3, 3] };

const BINARY: Record<string, (a: number, b: number) => number> = {
  add: (a, b) => a + b, subtract: (a, b) => a - b, multiply: (a, b) => a * b, divide: (a, b) => a / b,
  pow: (a, b) => Math.pow(a, b), mod: (a, b) => ((a % b) + b) % b,
  larger: (a, b) => +(a > b), smaller: (a, b) => +(a < b), largerEq: (a, b) => +(a >= b), smallerEq: (a, b) => +(a <= b),
  equal: (a, b) => +(a === b), unequal: (a, b) => +(a !== b), and: (a, b) => +(!!a && !!b), or: (a, b) => +(!!a || !!b),
};
const UNARY: Record<string, (a: number) => number> = { unaryMinus: a => -a, unaryPlus: a => a, not: a => +!a };

/**
 * Compile `expr` over the given symbols (plus pi, e, seed and the user variables). Throws an Error
 * with a message for the panel when the formula uses anything else.
 */
export function compileFormula(expr: string, symbols: string[], userVars: string[] = []): Evaluator {
  if (!expr.trim()) throw new Error("Type a formula.");
  if (expr.length > 2000) throw new Error("The formula is too long (2000 characters at most).");
  let root: MathNode;
  try {
    root = parse(expr);
  } catch (e) {
    throw new Error(`The formula could not be read: ${e instanceof Error ? e.message : String(e)}`);
  }
  const allowed = new Set([...symbols, ...userVars, "pi", "e", "seed"]);
  const constants: Record<string, number> = { pi: Math.PI, e: Math.E };

  const build = (node: MathNode): ((v: Record<string, number>, f: Record<string, Fn>) => number) => {
    const n = node as MathNode & Record<string, unknown>;
    switch (node.type) {
      case "ConstantNode": {
        const value = n.value;
        if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Only numbers can be used as constants.");
        return () => value;
      }
      case "SymbolNode": {
        const name = n.name as string;
        if (!allowed.has(name)) throw new Error(`“${name}” is not allowed here. Use ${[...symbols, ...userVars].join(", ")}, pi, e or seed.`);
        if (name in constants && !userVars.includes(name)) { const c = constants[name]; return () => c; }
        return v => v[name] ?? 0;
      }
      case "ParenthesisNode":
        return build(n.content as MathNode);
      case "OperatorNode": {
        const fn = n.fn as string, args = (n.args as MathNode[]).map(build);
        if (args.length === 1 && UNARY[fn]) { const u = UNARY[fn], a = args[0]; return (v, f) => u(a(v, f)); }
        if (args.length === 2 && BINARY[fn]) { const b = BINARY[fn], a0 = args[0], a1 = args[1]; return (v, f) => b(a0(v, f), a1(v, f)); }
        throw new Error(`The operator “${n.op as string}” is not allowed.`);
      }
      case "ConditionalNode": {
        const c = build(n.condition as MathNode), t = build(n.trueExpr as MathNode), e = build(n.falseExpr as MathNode);
        return (v, f) => (c(v, f) ? t(v, f) : e(v, f));
      }
      case "FunctionNode": {
        const fnNode = n.fn as MathNode & { name?: string };
        const name = fnNode.type === "SymbolNode" ? fnNode.name ?? "" : "";
        if (!ALLOWED_FUNCTIONS.includes(name)) throw new Error(`The function “${name || "?"}” is not allowed. Use ${ALLOWED_FUNCTIONS.join(", ")}.`);
        const args = (n.args as MathNode[]).map(build);
        const [lo, hi] = ARITY[name] ?? [1, 1];
        if (args.length < lo || args.length > hi) throw new Error(`${name} takes ${lo === hi ? lo : `${lo} or more`} argument${hi > 1 ? "s" : ""}.`);
        return (v, f) => f[name](...args.map(a => a(v, f)));
      }
      default:
        throw new Error(`This part of the formula is not allowed (${node.type.replace(/Node$/, "").toLowerCase()}).`);
    }
  };

  const ev = build(root);
  const cache = new Map<number, Record<string, Fn>>();
  return vars => {
    const seed = vars.seed ?? 0;
    let f = cache.get(seed);
    if (!f) { f = functions(seed); cache.set(seed, f); }
    return ev(vars, f);
  };
}

/* ---------- Deterministic simplex noise (Gustavson), seeded ---------- */

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];

export function makeNoise(seed: number) {
  const rnd = mulberry32(Math.round(seed * 1000) ^ 0x9e3779b9);
  const p = new Uint8Array(256).map((_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512), mod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; mod12[i] = perm[i] % 12; }
  const F2 = 0.5 * (Math.sqrt(3) - 1), Gs2 = (3 - Math.sqrt(3)) / 6;
  const noise2 = (xin: number, yin: number) => {
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * Gs2, x0 = xin - (i - t), y0 = yin - (j - t);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + Gs2, y1 = y0 - j1 + Gs2, x2 = x0 - 1 + 2 * Gs2, y2 = y0 - 1 + 2 * Gs2;
    const ii = i & 255, jj = j & 255;
    const corner = (x: number, y: number, g: number) => { let tt = 0.5 - x * x - y * y; if (tt < 0) return 0; tt *= tt; const gr = G3[g]; return tt * tt * (gr[0] * x + gr[1] * y); };
    return 70 * (corner(x0, y0, mod12[ii + perm[jj]]) + corner(x1, y1, mod12[ii + i1 + perm[jj + j1]]) + corner(x2, y2, mod12[ii + 1 + perm[jj + 1]]));
  };
  const noise3 = (xin: number, yin: number, zin: number) => {
    const F3 = 1 / 3, G = 1 / 6;
    const s = (xin + yin + zin) * F3, i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G, x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
    } else if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    const pts = [[x0, y0, z0, 0, 0, 0], [x0 - i1 + G, y0 - j1 + G, z0 - k1 + G, i1, j1, k1], [x0 - i2 + 2 * G, y0 - j2 + 2 * G, z0 - k2 + 2 * G, i2, j2, k2], [x0 - 1 + 3 * G, y0 - 1 + 3 * G, z0 - 1 + 3 * G, 1, 1, 1]];
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let sum = 0;
    for (const [x, y, z, a, b, c] of pts) {
      let tt = 0.6 - x * x - y * y - z * z;
      if (tt < 0) continue;
      const g = G3[mod12[ii + a + perm[jj + b + perm[kk + c]]]];
      tt *= tt;
      sum += tt * tt * (g[0] * x + g[1] * y + g[2] * z);
    }
    return 32 * sum;
  };
  return { noise2, noise3 };
}

/* ---------- Meshes ---------- */

const varValues = (s: FormulaSpec) => Object.fromEntries(Object.entries(s.variables).map(([k, v]) => [k, v.value]));

/**
 * Heightfield z = f(x, y) over the domain, as a closed block with a flat back on the wall. The
 * surface is lifted so its lowest point is `base` mm off the wall (reported as `lift`).
 */
export function formulaHeightfield(s: FormulaSpec): { mesh: MeshData; lift: number } {
  const res = Math.max(8, Math.min(512, Math.round(s.resolution)));
  if ((res + 1) * (res + 1) > LIMITS.maxFormulaSamples) throw new Error("Lower the resolution: the formula would need more than 5 million samples.");
  const f = compileFormula(s.expression, ["x", "y"], Object.keys(s.variables));
  const vars = varValues(s);
  const [x0, x1] = s.domain.x, [y0, y1] = s.domain.y;
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0 && h > 0)) throw new Error("The formula domain needs a positive width and depth.");
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const nx = res, ny = Math.max(4, Math.round((res * h) / w));
  const z = (x: number, y: number) => { vars.x = x + cx; vars.y = y + cy; const v = f(vars); return Number.isFinite(v) ? v : NaN; };
  let lo = Infinity;
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const v = z(-w / 2 + (w * i) / nx, -h / 2 + (h * j) / ny);
    if (Number.isNaN(v)) throw new Error("The formula gives no number somewhere in the domain (for example sqrt of a negative value or a division by zero).");
    lo = Math.min(lo, v);
  }
  const lift = Math.max(0.5, s.base) - lo;
  return { mesh: heightfieldBlock(w, h, (x, y) => z(x, y) + lift, nx, ny), lift };
}

/** Revolution r = f(h) for h in [0, H], around the Y axis. */
export function formulaRevolution(s: FormulaSpec): MeshData {
  const f = compileFormula(s.expression, ["h"], Object.keys(s.variables));
  const vars = varValues(s);
  const H = s.height;
  if (!(H > 0)) throw new Error("The height must be positive.");
  const rings = Math.max(8, Math.min(512, Math.round(s.resolution)));
  return revolution(hh => { vars.h = hh; const r = f(vars); if (!Number.isFinite(r)) throw new Error("The formula gives no number for some heights."); return r; }, H, rings, 128);
}
