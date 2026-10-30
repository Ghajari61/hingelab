/**
 * Puts the loose pieces of a leather product where they go in the assembled 3D preview. Builders
 * record what each piece is attached to (a handle's two ends, a strap's two rings, a tab's rivet,
 * a lining's panel); this places them once every panel is in place, so "outside" is known.
 */
import type { Contour, GenPart, Hardware3D, Pt } from "../types";
import type { Pattern } from "./kit";
import {
  add, arch, at, axesOf, centreOf, compose, cross, dot, frameOf, invert, len, lying, mul, pathLen, stripAlong, sub, surface, turning, unit, type V3,
} from "./view3d";

type View = NonNullable<GenPart["views3d"]>[number];
export interface At { host: GenPart; pt: Pt }

export type Rig =
  /** A flap and lid on the back panel's 3D pieces (Back, Lid, Flap): they open and close on the Fold slider. */
  | { kind: "flap"; back: GenPart; flap: number; E: number }
  /** A lining glued inside its panel. */
  | { kind: "lining"; part: GenPart; src: GenPart }
  /** A handle: each end lies flat from `anchor` to `rise` on its host, then the strap arches between the rises. */
  | { kind: "handle"; part: GenPart; ends: [{ host: GenPart; anchor: Pt; rise: Pt }, { host: GenPart; anchor: Pt; rise: Pt }]; length: number; width: number }
  /** A strap from one point to another, arching along `up` ("z", or "out" of the host at the start); split straps list both halves. */
  | { kind: "strap"; parts: { part: GenPart; from: number; to: number }[]; a: At; b: At; length: number; width: number; up: "z" | "out" }
  /** A strap that runs along a host's surface from a point in a direction, then on down (a flap strap over the flap's tip). */
  | { kind: "drape"; part: GenPart; a: At; tip: At; length: number; width: number }
  /** A small piece lying on a host's surface, outside (or inside), its u along `dir` (host directions), `anchor` its own point at `pt`. */
  | { kind: "lie"; part: GenPart; on: At; dir: Pt; anchor?: Pt; inside?: boolean; outer?: Contour }
  /** A piece standing where a matrix puts it (camera dividers). */
  | { kind: "stand"; part: GenPart; m: number[] }
  /** A ring (D-ring, buckle) at a point on a host, its axis along a host direction. */
  | { kind: "ring"; on: At; dir: Pt; r: number; lift?: number; color?: string };

/** The 3D piece of a host that holds (u, v), with its frames when it opens and closes. */
function pieceAt(host: GenPart, u: number, v: number) {
  for (const vw of host.views3d ?? []) {
    const xs = vw.outer.map((q) => q[0]), ys = vw.outer.map((q) => q[1]);
    if (u >= Math.min(...xs) - 0.5 && u <= Math.max(...xs) + 0.5 && v >= Math.min(...ys) - 0.5 && v <= Math.max(...ys) + 0.5) return vw;
  }
  return null;
}

/** Makes views follow a host piece that opens and closes: the same motion, frame by frame. */
function follow(views: View[], host: GenPart, pt: Pt): View[] {
  const pc = pieceAt(host, pt[0], pt[1]);
  if (!pc?.frames?.length || !pc.place.m) return views;
  const back = invert(pc.place.m);
  return views.map((vw) => ({ ...vw, frames: pc.frames!.map((F) => compose(compose(F, back), vw.place.m!)) }));
}

export function applyRigs(pat: Pattern, rigs: Rig[], T: number): Hardware3D[] {
  const hw: Hardware3D[] = [];
  // flaps first: other pieces follow their motion
  for (const r of rigs) if (r.kind === "flap") flapFrames(r.back, r.flap, r.E);
  const centre = centreOf(pat.parts);
  const S = (a: At) => surface(a.host, a.pt[0], a.pt[1], centre, T);
  const dirOf = (a: At, d: Pt): V3 => { const s = S(a)!; const { U, V } = axesOf(s.m); return unit(add(mul(U, d[0]), mul(V, d[1]))); };
  for (const r of rigs) {
    switch (r.kind) {
      case "lining": {
        const tl = r.part.t ?? T;
        const inset = (m: number[]) => {
          const { N, O } = axesOf(m);
          const xs = r.src.outer.map((q) => q[0]), ys = r.src.outer.map((q) => q[1]);
          const mid = at(m, (Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2);
          const inward = dot(N, sub(centre, mid)) > 0;
          return [m[0], m[1], m[2], O[0] + N[0] * (inward ? T + 0.05 : -tl - 0.05), m[4], m[5], m[6], O[1] + N[1] * (inward ? T + 0.05 : -tl - 0.05), m[8], m[9], m[10], O[2] + N[2] * (inward ? T + 0.05 : -tl - 0.05)];
        };
        if (r.src.views3d?.length) {
          r.part.views3d = r.src.views3d.map((vw) => ({ ...vw, name: r.part.name, place: { ...vw.place, m: inset(vw.place.m!) }, ...(vw.frames ? { frames: vw.frames.map(inset) } : {}) }));
        } else if (r.src.place?.m) r.part.place = { x: 0, y: 0, z: 0, m: inset(r.src.place.m) };
        break;
      }
      case "handle": {
        const [e0, e1] = r.ends.map((e) => ({ a: S({ host: e.host, pt: e.anchor }), b: S({ host: e.host, pt: e.rise }) }));
        if (!e0.a || !e0.b || !e1.a || !e1.b) break;
        const lift = (p: V3, n: V3) => add(p, mul(n, 0.3));
        const A0 = lift(e0.a.p, e0.a.n), A1 = lift(e0.b.p, e0.b.n), B1 = lift(e1.b.p, e1.b.n), B0 = lift(e1.a.p, e1.a.n);
        const flat0 = len(sub(A1, A0)), flat1 = len(sub(B1, B0));
        const free = Math.max(len(sub(B1, A1)), r.length - flat0 - flat1);
        const top = arch(A1, B1, free, [0, 0, 1], 28);
        const path = [A0, ...top, B0];
        const chord = unit(sub(B1, A1));
        const n0 = e0.a.n, n1 = e1.a.n, last = path.length - 2;
        const views = stripAlong(r.part.name, path, r.width, (i, U) => (i === 0 ? cross(n0, U) : i === last ? cross(n1, U) : cross([0, 0, 1], chord)));
        // the handle's own u runs from end to end
        r.part.views3d = follow(views, r.ends[0].host, r.ends[0].anchor);
        break;
      }
      case "strap": {
        const a = S(r.a), b = S(r.b);
        if (!a || !b) break;
        const up: V3 = r.up === "z" ? [0, 0, 1] : a.n;
        const A = add(a.p, mul(a.n, 0.5)), B = add(b.p, mul(b.n, 0.5));
        // a long strap is drawn shorter, so the bag stays in view (the cut strap keeps its length)
        const chord = len(sub(B, A)), shown = Math.min(r.length, Math.max(chord * 1.8, chord + 300));
        const path = arch(A, B, Math.max(chord, shown), up, 48);
        const W = unit(cross(up, unit(sub(B, A))));
        const total = pathLen(path);
        for (const piece of r.parts) {
          const sub0 = subPath(path, (piece.from / r.length) * total, (piece.to / r.length) * total);
          piece.part.views3d = stripAlong(piece.part.name, sub0, r.width, () => W);
        }
        break;
      }
      case "drape": {
        const a = S(r.a), t = S(r.tip);
        if (!a || !t) break;
        const P0 = add(a.p, mul(a.n, 0.4)), P1 = add(t.p, mul(t.n, 0.4));
        // on down the front, no lower than the bag's base
        const rest = Math.max(0, Math.min(r.length - len(sub(P1, P0)), P1[2] - 4));
        const P2 = add(add(P1, [0, 0, -rest]), mul(t.n, 0));
        const views = stripAlong(r.part.name, [P0, P1, P2], r.width, (_i, U) => cross(t.n, U));
        r.part.views3d = follow(views, r.a.host, r.a.pt);
        break;
      }
      case "lie": {
        const s = S(r.on);
        if (!s) break;
        const n = r.inside ? mul(s.n, -1) : s.n;
        // inside: on the panel's inner surface, a thickness in from the outside one
        const p = r.inside ? add(s.p, mul(s.n, -((r.on.host.t ?? T) + 0.05))) : add(s.p, mul(n, 0.05));
        const vw = lying(r.part.name, r.outer ?? r.part.outer, p, n, dirOf(r.on, r.dir), 0, r.anchor ?? [0, 0]);
        r.part.views3d = follow([vw], r.on.host, r.on.pt);
        break;
      }
      case "stand":
        r.part.place = { x: 0, y: 0, z: 0, m: r.m };
        break;
      case "ring": {
        const s = S(r.on);
        if (!s) break;
        hw.push({ kind: "ring", at: add(s.p, mul(s.n, r.lift ?? r.r * 0.6)), r: r.r, d: Math.max(1.6, r.r * 0.22), axis: dirOf(r.on, r.dir), color: r.color ?? "#b8963f" });
        break;
      }
    }
  }
  return hw;
}

/** The part of a polyline between arc lengths s0 and s1. */
function subPath(p: V3[], s0: number, s1: number): V3[] {
  const out: V3[] = [];
  let acc = 0;
  const pt = (i: number, s: number): V3 => { const a = p[i - 1], b = p[i], L = len(sub(b, a)) || 1; return add(a, mul(sub(b, a), (s - (acc - L)) / L)); };
  for (let i = 1; i < p.length; i++) {
    const L = len(sub(p[i], p[i - 1]));
    const a0 = acc; acc += L;
    if (acc < s0) continue;
    if (!out.length) out.push(pt(i, Math.max(s0, a0)));
    if (acc >= s1) { out.push(pt(i, s1)); break; }
    out.push(p[i]);
  }
  return out.length > 1 ? out : [p[0], p[p.length - 1]];
}

/**
 * The flap opening on the Fold slider: at 0 the lid stands straight up from the back and the flap
 * straight up from the lid; at 1 both are closed over the bag.
 */
function flapFrames(back: GenPart, flap: number, E: number) {
  const views = back.views3d ?? [];
  const backV = views.find((v) => v.name === "Back"), lid = views.find((v) => v.name === "Lid"), fl = views.find((v) => v.name === "Flap");
  if (!backV?.place.m || !lid?.place.m || !fl?.place.m) return;
  const P1 = at(backV.place.m, 0, E), axis = axesOf(backV.place.m).U;
  const P2 = at(lid.place.m, 0, flap);
  const zOf = (m: number[], u: number, v: number) => at(m, u, v)[2];
  // which way each turn opens: the way that lifts the far edge
  const s1 = zOf(turnM(lid.place.m, P1, axis, Math.PI / 2), 0, flap) > zOf(turnM(lid.place.m, P1, axis, -Math.PI / 2), 0, flap) ? 1 : -1;
  const s2 = zOf(turnM(turnM(fl.place.m, P2, axis, Math.PI / 2), P1, axis, s1 * Math.PI / 2), 0, 0) > zOf(turnM(turnM(fl.place.m, P2, axis, -Math.PI / 2), P1, axis, s1 * Math.PI / 2), 0, 0) ? 1 : -1;
  const n = 12, lidF: number[][] = [], flF: number[][] = [];
  for (let i = 0; i <= n; i++) {
    const open = (1 - i / n) * (Math.PI / 2);
    lidF.push(turnM(lid.place.m, P1, axis, s1 * open));
    flF.push(turnM(turnM(fl.place.m, P2, axis, s2 * open), P1, axis, s1 * open));
  }
  lid.frames = lidF;
  fl.frames = flF;
}
const turnM = (m: number[], p: V3, axis: V3, a: number) => turning(m, p, axis, a, a, 1)[0];

export { frameOf };
