/** Bend estimate and the auto-fit search. */
import type { AutoFitResult, BendResult, Params } from "./types";
import { MATERIALS } from "./defaults";
import { cutWidth, hingeSegments } from "./hinge";
import { r3 } from "./util";

/* Bend estimate from torsion-bar strain. Each bar between two neighbouring cuts twists; the sum of
   the twists over a zone gives the bend. rMin = pitch * barWidth / (1.2 * gamma * barLength). */
export function bendAnalysis(p: Params, hBody: number, rN: number): BendResult {
  const mat = MATERIALS[p.material] || MATERIALS.custom;
  const hs = hingeSegments(hBody, p.slit, p.bridge);
  const barW = Math.min(p.pitch - cutWidth(p), p.T);
  let barLen;
  if (p.pattern === "serpentine") barLen = Math.max(0.1, (hBody - 2 * p.bridge) / 2);
  else barLen = Math.max(0.1, (hs.Lp - p.bridge) / 2) * (p.pattern === "wave" ? 1.12 : 1);
  const gamma = mat.gamma * (p.pattern === "relief" ? 1.1 : 1);
  const rMin = (p.pitch * barW) / (1.2 * gamma * barLen);
  const ratio = rN / rMin;
  return { rMin, ratio, verdict: ratio >= 1.25 ? "ok" : ratio >= 1 ? "warn" : "err", barLen, barW, Lp: p.pattern === "serpentine" ? hBody - p.bridge : hs.Lp, nSeg: p.pattern === "serpentine" ? 1 : hs.n };
}

/* Auto-fit: search spacing, bridge and slit length for the STIFFEST lattice that still reaches the
   needed radius with a 30% safety margin. Stiffer = fewer cuts, less charring, stronger wall. */
export function autoFit(p: Params, hBody: number, rN: number): AutoFitResult {
  const t = p.T;
  let best: { q: Params; a: BendResult } | null = null, fallback: { q: Params; a: BendResult } | null = null;
  const minBar = Math.max(0.9, 0.35 * t);
  for (let pitch = Math.max(cutWidth(p) + minBar, 0.45 * t); pitch <= Math.max(1.05 * t, cutWidth(p) + minBar + 0.5) + 1e-9; pitch += 0.05 * t) {
    for (let bridge = Math.max(2, 0.75 * t); bridge <= 1.25 * t + 1e-9; bridge += 0.125 * t) {
      const slits = p.pattern === "serpentine" ? [p.slit] : [];
      if (!slits.length) for (let s = Math.max(10, 4 * bridge); s <= hBody - bridge; s += 1) slits.push(s);
      for (const slit of slits) {
        const q = Object.assign({}, p, { pitch: r3(pitch), bridge: r3(bridge), slit });
        const a = bendAnalysis(q, hBody, rN);
        if (!fallback || a.rMin < fallback.a.rMin) fallback = { q, a };
        if (a.rMin * 1.3 <= rN && (!best || a.rMin > best.a.rMin + 1e-6 || (Math.abs(a.rMin - best.a.rMin) < 0.3 && q.pitch > best.q.pitch))) best = { q, a };
      }
    }
  }
  return best ? { ok: true, ...best } : { ok: false, ...fallback! };
}
