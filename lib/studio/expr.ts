/**
 * Numeric field expressions (spec §4.4): math (`25.4*2`), units (`3in`, `12mm`), relative changes
 * (`+10` adds to the current value, `-=5` subtracts) and percentages (`50%` of the current value).
 * A plain leading minus (`-5`) is a negative number, as in every design app.
 * Returns the value in the field's unit, or null when the text cannot be read. No eval.
 */
import { MM_PER } from "./units";
import type { Units } from "./types";

const UNIT_RE = /^(mm|cm|in|pt|"|px)/;
const PX_MM = 25.4 / 96;

export interface ExprContext {
  /** Current value of the field, in the field unit. */
  current: number;
  /** The field's display unit; null for unitless fields (counts, angles, percent). */
  unit: Units | null;
}

export function evalNumberExpr(input: string, ctx: ExprContext): number | null {
  let s = input.trim().replace(/,/g, ".").replace(/×/g, "*").replace(/÷/g, "/");
  if (!s) return null;
  let rel = null as "+" | "-" | "*" | "/" | null;
  const m = /^([+\-*/])=/.exec(s);
  if (m) { rel = m[1] as "+" | "-" | "*" | "/"; s = s.slice(2); }
  else if (s.startsWith("+")) { rel = "+"; s = s.slice(1); }
  const pct = /^\s*([\d.]+)\s*%\s*$/.exec(s);
  if (pct && !rel) {
    const v = (parseFloat(pct[1]) / 100) * ctx.current;
    return isFinite(v) ? v : null;
  }
  // One unit after a product or fraction belongs to all of it: `1/8in` is an eighth of an inch.
  const whole = ctx.unit ? /^([\d.\s*/()]*[*/][\d.\s*/()]*?)\s*(mm|cm|in|pt|"|px)$/.exec(s) : null;
  const head = whole ? parse(whole[1], { ...ctx, unit: null }) : null;
  const v = whole ? (head === null ? null : toUnit(head, whole[2], ctx.unit!)) : parse(s, ctx);
  if (v === null || !isFinite(v)) return null;
  switch (rel) {
    case "+": return ctx.current + v;
    case "-": return ctx.current - v;
    case "*": return ctx.current * v;
    case "/": return v === 0 ? null : ctx.current / v;
    default: return v;
  }
}

/** `v` written in unit word `u`, expressed in the field unit. */
function toUnit(v: number, u: string, unit: Units): number {
  const mm = u === '"' ? v * 25.4 : u === "px" ? v * PX_MM : v * MM_PER[u as Units];
  return mm / MM_PER[unit];
}

function parse(src: string, ctx: ExprContext): number | null {
  let i = 0;
  const ws = () => { while (i < src.length && /\s/.test(src[i])) i++; };
  const fail = (): never => { throw new Error("syntax"); };

  function primary(): number {
    ws();
    if (src[i] === "(") {
      i++;
      const v = sum();
      ws();
      if (src[i] !== ")") fail();
      i++;
      return withUnit(v);
    }
    if (src[i] === "-") { i++; return -primary(); }
    if (src[i] === "+") { i++; return primary(); }
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) fail();
    i += m![0].length;
    return withUnit(parseFloat(m![0]));
  }

  function withUnit(v: number): number {
    ws();
    const m = UNIT_RE.exec(src.slice(i));
    if (!m) {
      if (src[i] === "%") { i++; return (v / 100) * ctx.current; }
      return v;
    }
    i += m[0].length;
    return ctx.unit ? toUnit(v, m[1], ctx.unit) : v;
  }

  function product(): number {
    let v = primary();
    for (;;) {
      ws();
      const c = src[i];
      if (c === "*") { i++; v *= primary(); }
      else if (c === "/") { i++; const d = primary(); if (d === 0) fail(); v /= d; }
      else return v;
    }
  }

  function sum(): number {
    let v = product();
    for (;;) {
      ws();
      const c = src[i];
      if (c === "+") { i++; v += product(); }
      else if (c === "-") { i++; v -= product(); }
      else return v;
    }
  }

  try {
    const v = sum();
    ws();
    return i === src.length ? v : null;
  } catch {
    return null;
  }
}
