/**
 * Puts flat parts together from what their outlines show:
 * - a box: a bottom with joints on three or four sides, walls whose jointed edge matches each side
 *   (stood on that side, outside faces out, turned or flipped so the fingers interlock), and a top,
 *   lid or lid lip of the bottom's size;
 * - tabs in slots: a row of tabs on one edge that matches a row of thin rectangular holes stands the
 *   part in those holes, on the face towards the rest of the assembly;
 * - half-lap grids: parts with notches as wide as the material cross at their notches, one set slotted
 *   from below and the other from above; a grid that fits inside the box stands on its bottom.
 * Everything else lies flat beside the assembly as it lies on the sheet (or stacked, if asked).
 * Placements map a part's flat frame (x, -y, thickness) into the 3D frame (x right, y back, z up).
 */
import { materialById } from "../library";
import type { AssemblySettings } from "../types";
import { orient, orientPt, partFeatures, type EdgeRef, type Features, type Notch, type Orient, type Side, type Slot } from "./features";
import { add, apply, applyDir, cross, fromCols, I34, invRigid, mul, norm, scale, sub, translation, turnAbout, type M34, type V3 } from "./mat3";
import type { P, RawPart } from "./parts";

export type Role = "bottom" | "wall" | "top" | "lid" | "lip" | "inserted" | "divider" | "loose";

export interface APart {
  key: string;
  name: string;
  raw: RawPart;
  f: Features;
  /** Thickness, mm. */
  t: number;
  materialId: string;
}

export interface Placement { m: M34; role: Role; group: number }

/** An edge of a part moved by `delta` (part frame, mm). */
export interface EdgeMove { key: string; ring: number; edge: number; delta: P }

export interface SolveNote {
  kind: "depth" | "slotWidth" | "notchWidth" | "slotLength" | "interlock";
  parts: string[];
  /** What was found and what it should be, mm. */
  found: number;
  want: number;
  moves: EdgeMove[];
}

export interface Solved {
  place: Map<string, Placement>;
  notes: SolveNote[];
  box: { W: number; D: number; H: number } | null;
  joined: number;
}

const Z: V3 = [0, 0, 1];
const INWARD: P[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/** Oriented slab coords (u, -v, z) from the part's own slab coords (x, -y, z). */
export function lift(o: Orient): M34 {
  const [a11, a12, b1, a21, a22, b2] = o.m;
  return [a11, -a12, 0, b1, -a21, a22, 0, -b2, 0, 0, 1, 0];
}

/** A part standing on a line from S along d, its thickness from the line towards n, `H` tall. */
function stand(S: V3, d: V3, n: V3, H: number, t: number, L: number, mirror: boolean, z0 = 0): M34 {
  const base = add(S, scale(Z, z0 + H));
  return mirror ? fromCols(scale(d, -1), Z, n, add(base, scale(d, L))) : fromCols(d, Z, scale(n, -1), add(base, scale(n, t)));
}

export function thicknessOf(materialId: string | undefined): number {
  return (materialId && materialById(materialId)?.thickness) || 3;
}

export function makeParts(raw: RawPart[]): APart[] {
  return raw.map((r) => {
    const materialId = r.sheet?.materialId ?? "";
    const t = thicknessOf(materialId);
    return { key: r.key, name: r.name, raw: r, f: partFeatures(r, t), t, materialId };
  });
}

const jointed = (p: APart) => p.f.sides.filter((s) => s.kind === "jointed").length;
const tolOf = (t: number) => Math.max(0.3, 0.1 * t);

/** How badly two rows of fingers along one edge fail to interlock, mm (overlap plus gaps), inside the corners. */
function interlock(a: [number, number][], b: [number, number][], L: number, T: number): number {
  const lo = T, hi = L - T;
  const clip = (s: [number, number][]) => s.map(([x, y]) => [Math.max(lo, x), Math.min(hi, y)] as [number, number]).filter(([x, y]) => y > x);
  const A = clip(a), B = clip(b);
  let overlap = 0;
  for (const [x0, x1] of A) for (const [y0, y1] of B) overlap += Math.max(0, Math.min(x1, y1) - Math.max(x0, y0));
  const cover = [...A, ...B].reduce((t, [x, y]) => t + y - x, 0) - overlap;
  return overlap + Math.max(0, hi - lo - cover);
}

const flip = (s: [number, number][], L: number) => s.map(([a, b]) => [L - b, L - a] as [number, number]).reverse();

interface BoxPlan {
  bottom: APart;
  walls: { p: APart; k: number; edge: number; mirror: boolean; score: number }[];
  H: number;
}

const EDGES = (W: number, D: number) => [
  { k: 2, S: [0, -D, 0] as V3, d: [1, 0, 0] as V3, n: [0, 1, 0] as V3, L: W },
  { k: 0, S: [W, 0, 0] as V3, d: [-1, 0, 0] as V3, n: [0, -1, 0] as V3, L: W },
  { k: 3, S: [0, 0, 0] as V3, d: [0, -1, 0] as V3, n: [1, 0, 0] as V3, L: D },
  { k: 1, S: [W, -D, 0] as V3, d: [0, 1, 0] as V3, n: [-1, 0, 0] as V3, L: D },
];

const isJ = (s: Side) => s.kind === "jointed";
/** The bottom's side that meets each box edge at its start and at its end (see EDGES). */
const START_N: Record<number, number> = { 2: 3, 0: 1, 3: 0, 1: 2 };
const END_N: Record<number, number> = { 2: 1, 0: 3, 3: 2, 1: 0 };

/** What a part's name says it is: +1 a bottom, -1 a top or lid. */
const hint = (p: APart) => (/\b(bottom|base|floor)\b/i.test(p.name) ? 1 : 0) - (/\b(top|lid|cover)\b/i.test(p.name) ? 1 : 0);

function planBox(parts: APart[]): BoxPlan | null {
  const bottoms = parts.filter((p) => p.f.panel && jointed(p) >= 3).sort((a, b) => hint(b) - hint(a) || b.raw.area - a.raw.area).slice(0, 6);
  // A wall's top may be anything (a finger notch, a hinge cut-out, a gable); its bottom and ends are what join.
  const panels = parts.filter((p) => p.f.panel || jointed(p) >= 2);
  let best: BoxPlan | null = null, bestScore = -1;
  for (const B of bottoms) {
    const W = B.f.frame.w, D = B.f.frame.h, tolL = Math.max(1, 0.02 * Math.max(W, D));
    const edges = EDGES(W, D).filter((e) => B.f.sides[e.k].kind === "jointed");
    type Cand = { p: APart; k: number; edge: number; H: number; mirror: boolean; score: number };
    const cands: Cand[] = [];
    for (const Q of panels) {
      if (Q === B) continue;
      Q.f.sides.forEach((s, k) => {
        if (s.kind !== "jointed") return;
        edges.forEach((e, ei) => {
          if (!near(s.L, e.L, tolL)) return;
          const bt = B.f.sides[e.k].tabs;
          // The wall's ends are jointed where another wall meets it and straight where the box is open.
          const sN = isJ(B.f.sides[START_N[e.k]]), eN = isJ(B.f.sides[END_N[e.k]]);
          const a = isJ(Q.f.sides[(k + 1) % 4]), b = isJ(Q.f.sides[(k + 3) % 4]);
          const plain = interlock(bt, s.tabs, e.L, B.t) + 50 * (+(a !== sN) + +(b !== eN));
          const flipped = interlock(bt, flip(s.tabs, s.L), e.L, B.t) + 50 * (+(b !== sN) + +(a !== eN));
          cands.push({ p: Q, k, edge: ei, H: s.across, mirror: false, score: plain }, { p: Q, k, edge: ei, H: s.across, mirror: true, score: flipped + 0.5 });
        });
      });
    }
    const all = EDGES(W, D);
    const full = edges.map((e) => all.findIndex((x) => x.k === e.k));
    // The wall height most walls agree on.
    const heights = [...new Set(cands.map((c) => Math.round(c.H)))];
    for (const h of heights) {
      const walls = chooseWalls(W, D, full, cands.filter((c) => near(c.H, h, tolL)));
      const used = new Set(walls.map((w) => w.p));
      // Gables and raised backs: an edge still open takes a wall of another height that fits it well.
      edges.forEach((e, ei) => {
        if (walls.some((w) => w.edge === full[ei])) return;
        const pick = cands.filter((c) => c.edge === ei && !used.has(c.p) && c.score < Math.max(3, 0.08 * e.L)).sort((a, b) => a.score - b.score)[0];
        if (!pick) return;
        used.add(pick.p);
        walls.push({ p: pick.p, k: pick.k, edge: full[ei], mirror: pick.mirror, score: pick.score });
      });
      if (walls.length < 2) continue;
      const score = walls.length * 10 - walls.reduce((t, w) => t + Math.min(5, w.score / 10), 0) + hint(B) * 15 + B.raw.area / 1e7;
      if (score > bestScore) {
        bestScore = score;
        const Hm = walls.map((w) => w.p.f.sides[w.k].across).sort((a, b) => a - b)[Math.floor(walls.length / 2)];
        best = { bottom: B, walls, H: Hm };
      }
    }
  }
  return best;
}

type WallPick = { p: APart; k: number; edge: number; mirror: boolean; score: number };

/** Where a wall stands: on box edge `edge`, side k down, as tall as it is across that side. */
function wallMatrix(W: number, D: number, w: Omit<WallPick, "score">): M34 {
  const e = EDGES(W, D)[w.edge];
  const o = orient(w.k, w.p.f.frame.w, w.p.f.frame.h);
  return mul(stand(e.S, e.d, e.n, o.H, w.p.t, e.L, w.mirror), lift(o));
}

/** A wall's jointed end sides in 3D: where the side's outer line runs (x, y) and its fingers as heights. */
function wallEnds(W: number, D: number, w: Omit<WallPick, "score">) {
  const M = wallMatrix(W, D, w);
  const { w: fw, h: fh } = w.p.f.frame;
  return [(w.k + 1) % 4, (w.k + 3) % 4].filter((j) => isJ(w.p.f.sides[j])).map((j) => {
    const o = orient(j, fw, fh), [a, b, c, d, e, f] = o.m;
    // Orient is a quarter turn and a shift: its inverse is the transpose.
    const at = (u: number) => { const x = a * (u - c) + d * (o.H - f), y = b * (u - c) + e * (o.H - f); return apply(M, [x, -y, w.p.t / 2]); };
    const mid = at(o.L / 2);
    const z = w.p.f.sides[j].tabs.map(([u0, u1]) => { const z0 = at(u0)[2], z1 = at(u1)[2]; return [Math.min(z0, z1), Math.max(z0, z1)] as [number, number]; });
    return { mid, z, top: Math.max(at(0)[2], at(o.L)[2]) };
  });
}

/**
 * A wall for each jointed edge of the bottom (`full` maps the candidates' edge index to EDGES).
 * The bottom alone leaves a wall's turn open up to symmetry and doesn't say which of two alike walls
 * goes where: of the few that fit each edge about equally well, keep the set whose fingers also
 * interlock where neighbouring walls meet (branch and bound; an edge may stay open at a high cost).
 */
function chooseWalls(W: number, D: number, full: number[], cands: { p: APart; k: number; edge: number; mirror: boolean; score: number }[]): WallPick[] {
  const n = full.length;
  const opts = full.map((fe, ei) => {
    const slack = Math.max(1.5, 0.03 * EDGES(W, D)[fe].L);
    const mine = cands.filter((c) => c.edge === ei).sort((a, b) => a.score - b.score || jointed(b.p) - jointed(a.p));
    const parts: APart[] = [], out: typeof mine = [];
    for (const c of mine) {
      if (!parts.includes(c.p)) { if (parts.length >= 3) continue; parts.push(c.p); }
      const own = out.filter((x) => x.p === c.p);
      if (own.length < 4 && c.score <= (own[0]?.score ?? c.score) + slack) out.push(c);
    }
    return out.map((c) => ({ c, ends: wallEnds(W, D, { ...c, edge: fe }) }));
  });
  const T = Math.max(3, ...cands.map((c) => c.p.t));
  const corner = (a: ReturnType<typeof wallEnds>, b: ReturnType<typeof wallEnds>) => {
    let s = 0;
    for (const A of a) for (const B of b) {
      if (Math.hypot(A.mid[0] - B.mid[0], A.mid[1] - B.mid[1]) <= 2 * T) s += interlock(A.z, B.z, Math.min(A.top, B.top), T);
    }
    return s;
  };
  const MISS = 1000;
  const pick = new Array<number>(n).fill(-1);
  let best = pick.slice(), bestCost = Infinity;
  const used = new Set<APart>();
  const dfs = (i: number, cost: number) => {
    if (cost >= bestCost) return;
    if (i === n) { bestCost = cost; best = pick.slice(); return; }
    opts[i].forEach((o, j) => {
      if (used.has(o.c.p)) return;
      let add = o.c.score;
      for (let q = 0; q < i; q++) if (pick[q] >= 0) add += corner(opts[q][pick[q]].ends, o.ends);
      pick[i] = j; used.add(o.c.p);
      dfs(i + 1, cost + add);
      used.delete(o.c.p); pick[i] = -1;
    });
    dfs(i + 1, cost + MISS);
  };
  dfs(0, 0);
  return best.flatMap((j, i) => (j < 0 ? [] : [{ p: opts[i][j].c.p, k: opts[i][j].c.k, edge: full[i], mirror: opts[i][j].c.mirror, score: opts[i][j].c.score }]));
}

/** A top turned (or turned over) so its jointed and straight sides sit over the bottom's. */
function topTurn(p: APart, B: APart, W: number, D: number, tolL: number): M34 {
  let best: { m: M34; s: number } | null = null;
  for (const j of [2, 0, 1, 3]) {
    const o = orient(j, p.f.frame.w, p.f.frame.h);
    if (!near(o.L, W, tolL) || !near(o.H, D, tolL)) continue;
    for (const over of [false, true]) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        const at = over && k % 2 === 1 ? (k + 2) % 4 : k;
        if (isJ(p.f.sides[(j + k + 2) % 4]) === isJ(B.f.sides[at])) s++;
      }
      if (!best || s > best.s) best = { m: over ? mul([-1, 0, 0, o.L, 0, 1, 0, 0, 0, 0, -1, p.t], lift(o)) : lift(o), s };
    }
  }
  return best?.m ?? I34;
}

/** Slots in a row: parallel and on one line, in order along it. */
function slotRows(slots: Slot[]): Slot[][] {
  const rows: Slot[][] = [];
  for (const s of slots) {
    const row = rows.find((r) => {
      const a = r[0];
      const par = Math.abs(a.axis[0] * s.axis[1] - a.axis[1] * s.axis[0]) < 0.02;
      const off = Math.abs(a.axis[0] * (s.c[1] - a.c[1]) - a.axis[1] * (s.c[0] - a.c[0]));
      return par && off < 0.6;
    });
    if (row) row.push(s); else rows.push([s]);
  }
  for (const r of rows) {
    const a = r[0];
    r.sort((x, y) => (x.c[0] - a.c[0]) * a.axis[0] + (x.c[1] - a.c[1]) * a.axis[1] - ((y.c[0] - a.c[0]) * a.axis[0] + (y.c[1] - a.c[1]) * a.axis[1]));
  }
  return rows;
}

/** Corners of a part's slab, in the part's slab coords. */
const corners = (p: APart): V3[] => {
  const { w, h } = p.f.frame;
  const out: V3[] = [];
  for (const x of [0, w]) for (const y of [0, -h]) for (const z of [0, p.t]) out.push([x, y, z]);
  return out;
};
export const centreOf = (p: APart): V3 => [p.f.frame.w / 2, -p.f.frame.h / 2, p.t / 2];

export function boundsOf(parts: APart[], place: Map<string, Placement>, which?: (p: APart) => boolean) {
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const pl = place.get(p.key);
    if (!pl || (which && !which(p))) continue;
    for (const c of corners(p)) {
      const q = apply(pl.m, c);
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
    }
  }
  return { lo, hi, empty: lo[0] > hi[0] };
}

export function solve(parts: APart[], settings: AssemblySettings = {}): Solved {
  const place = new Map<string, Placement>();
  const notes: SolveNote[] = [];
  const adj = settings.parts ?? {};
  const pool = parts.filter((p) => !adj[p.key]?.flat);
  let group = 0;
  let box: Solved["box"] = null;
  let boxFloor: { x0: number; x1: number; y0: number; y1: number; z: number } | null = null;
  let boxGroup = -1;

  const depthNote = (p: APart, sides: number[], want: number) => {
    const moves: EdgeMove[] = [];
    let found = want;
    for (const k of sides) {
      const s = p.f.sides[k];
      if (s.kind !== "jointed" || near(s.d, want, tolOf(want))) continue;
      found = s.d;
      for (const e of s.deep) moves.push({ key: p.key, ring: e.ring, edge: e.edge, delta: scale2(INWARD[k], want - s.d) });
    }
    if (moves.length) notes.push({ kind: "depth", parts: [p.key], found, want, moves });
  };

  // ---- tabs in slots ----
  const usedTabs = new Set<string>();
  const tabFits = (P: APart, row: Slot[], R: APart) => (P === R ? null : tabMatch(P, row, R, (k) => usedTabs.has(`${P.key}|${k}`)));
  const insertPass = () => {
    let grew = false;
    for (const R of parts) {
      const pr = place.get(R.key);
      if (!pr || !R.f.slots.length) continue;
      for (const row of slotRows(R.f.slots)) {
        const P = pool.find((p) => !place.has(p.key) && tabFits(p, row, R));
        if (!P) continue;
        const m = tabFits(P, row, R)!;
        place.set(P.key, { m: insert(P, R, pr.m, row, m, parts, place), role: "inserted", group: pr.group });
        usedTabs.add(`${P.key}|${m.k}`);
        noteSlots(P, R, row, m, notes);
        grew = true;
      }
    }
    return grew;
  };
  // A part whose slots take tabs that already stand (the top of a tab-and-slot box) goes on them.
  const coverPass = () => {
    let grew = false;
    for (const R of pool) {
      if (place.has(R.key) || !R.f.slots.length) continue;
      for (const row of slotRows(R.f.slots)) {
        const P = parts.find((p) => place.has(p.key) && tabFits(p, row, R));
        if (!P) continue;
        const m = tabFits(P, row, R)!, pp = place.get(P.key)!;
        place.set(R.key, { m: cover(P, R, pp.m, row, m, parts, place), role: "top", group: pp.group });
        usedTabs.add(`${P.key}|${m.k}`);
        noteSlots(P, R, row, m, notes);
        grew = true;
        break;
      }
    }
    return grew;
  };
  const growTabs = () => { while (insertPass() || coverPass()); };
  const inserters = (R: APart) => new Set(slotRows(R.f.slots).flatMap((row) => pool.filter((p) => p !== R && tabMatch(p, row, R)).map((p) => p.key)));

  // Tabs read as fingers would make a wrong box: when the box's parts are what a part's slots take, slots go first.
  const tabRoot = pool.filter((p) => p.f.slots.length).sort((a, b) => b.raw.area - a.raw.area).find((R) => inserters(R).size >= 2);
  if (tabRoot) {
    const ins = inserters(tabRoot), plan0 = planBox(pool);
    const clash = !plan0 || [plan0.bottom, ...plan0.walls.map((w) => w.p)].filter((p) => p === tabRoot || ins.has(p.key)).length >= 2;
    if (clash) {
      place.set(tabRoot.key, { m: I34, role: "bottom", group: group++ });
      growTabs();
    }
  }

  // ---- boxes ----
  for (let plan = planBox(pool.filter((p) => !place.has(p.key))); plan; plan = planBox(pool.filter((p) => !place.has(p.key)))) {
    const before = new Set(place.keys());
    const B = plan.bottom, W = B.f.frame.w, D = B.f.frame.h, H = plan.H;
    const first = !box;
    const g = group++;
    place.set(B.key, { m: I34, role: "bottom", group: g });
    const wallT = plan.walls[0]?.p.t ?? B.t;
    depthNote(B, [0, 1, 2, 3], wallT);
    for (const w of plan.walls) {
      const e = EDGES(W, D)[w.edge];
      place.set(w.p.key, { m: wallMatrix(W, D, w), role: "wall", group: g });
      depthNote(w.p, [0, 1, 2, 3], B.t);
      if (w.score > Math.max(2, 0.08 * e.L)) notes.push({ kind: "interlock", parts: [w.p.key, B.key], found: w.score, want: 0, moves: [] });
    }
    if (first) {
      boxGroup = g;
      box = { W, D, H };
      boxFloor = { x0: wallT, x1: W - wallT, y0: -D + wallT, y1: -wallT, z: B.t };
    }
    // Top, lid and lid lip.
    const tolL = Math.max(1, 0.02 * Math.max(W, D));
    const free = () => pool.filter((p) => !place.has(p.key));
    const fit = (p: APart, w: number, d: number): Orient | null => {
      const o2 = orient(2, p.f.frame.w, p.f.frame.h), o1 = orient(1, p.f.frame.w, p.f.frame.h);
      if (near(o2.L, w, tolL) && near(o2.H, d, tolL)) return o2;
      if (near(o1.L, w, tolL) && near(o1.H, d, tolL)) return o1;
      return null;
    };
    // Walls jointed along their top take a jointed top between them; otherwise only a plain board sits on them as a lid.
    const flush = plan.walls.filter((w) => w.p.f.sides[(w.k + 2) % 4].kind === "jointed").length >= 2;
    const top = free().filter((p) => (flush ? p.f.panel && jointed(p) >= 3 : p.f.rect) && fit(p, W, D)).sort((a, b) => jointed(b) - jointed(a))[0];
    if (top) {
      place.set(top.key, { m: mul(translation([0, 0, flush ? H - top.t : H]), flush ? topTurn(top, B, W, D, tolL) : lift(fit(top, W, D)!)), role: flush ? "top" : "lid", group: g });
      if (flush) depthNote(top, [0, 1, 2, 3], wallT);
      if (!flush) {
        const lip = free().filter((p) => p.f.rect).map((p) => {
          const o2 = orient(2, p.f.frame.w, p.f.frame.h), o1 = orient(1, p.f.frame.w, p.f.frame.h);
          const ok = (o: Orient) => o.L < W - 2 * wallT + 0.5 && o.L > W - 2 * wallT - 6 && o.H < D - 2 * wallT + 0.5 && o.H > D - 2 * wallT - 6;
          return { p, o: ok(o2) ? o2 : ok(o1) ? o1 : null };
        }).find((x) => x.o);
        if (lip?.o) place.set(lip.p.key, { m: mul(translation([(W - lip.o.L) / 2, -(D - lip.o.H) / 2, H - lip.p.t]), lift(lip.o)), role: "lip", group: g });
      }
    }
    // A second box stands beside what is already there.
    if (before.size) {
      const mine = parts.filter((p) => place.has(p.key) && !before.has(p.key)), old = parts.filter((p) => before.has(p.key));
      const b = boundsOf(mine, place), all = boundsOf(old, place);
      const shift = translation([all.hi[0] + 40 - b.lo[0], all.hi[1] - b.hi[1], -b.lo[2]]);
      for (const p of mine) { const pl = place.get(p.key)!; place.set(p.key, { ...pl, m: mul(shift, pl.m) }); }
    }
  }

  // ---- the rest of tabs in slots ----
  const takes = (R: APart) => slotRows(R.f.slots).some((row) => pool.some((p) => !place.has(p.key) && tabFits(p, row, R)));
  for (;;) {
    growTabs();
    // A part with slots that something fits into starts the next assembly, flat, beside the last.
    const root = pool.filter((p) => !place.has(p.key) && p.f.slots.length).sort((a, b) => b.raw.area - a.raw.area).find(takes);
    if (!root) break;
    const all = boundsOf(parts, place);
    place.set(root.key, { m: all.empty ? I34 : translation([all.hi[0] + 40, all.hi[1], 0]), role: "bottom", group: group++ });
  }

  // ---- half-lap grids ----
  const notched = () => pool.filter((p) => !place.has(p.key) && p.f.sides.some((s) => s.notches.some((n) => n.w <= 2.2 * p.t + 0.5 && n.w >= 0.4 * p.t)));
  let left = notched();
  while (left.length) {
    const root = left.sort((a, b) => notchCount(b) - notchCount(a) || b.raw.area - a.raw.area)[0];
    const g = group++;
    const grid = lapGrid(root, left, g, place, notes);
    if (grid.length < 2) { place.delete(root.key); left = left.filter((p) => p !== root); continue; }
    // Into the box when it fits, else beside what is already there.
    const members = parts.filter((p) => grid.includes(p.key));
    const b = boundsOf(members, place);
    let move: M34 | null = null;
    if (boxFloor) {
      const fw = boxFloor.x1 - boxFloor.x0, fd = boxFloor.y1 - boxFloor.y0, gw = b.hi[0] - b.lo[0], gd = b.hi[1] - b.lo[1];
      const cx = (boxFloor.x0 + boxFloor.x1) / 2, cy = (boxFloor.y0 + boxFloor.y1) / 2;
      const gc: V3 = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, b.lo[2]];
      if (gw <= fw + 1.5 && gd <= fd + 1.5) move = translation([cx - gc[0], cy - gc[1], boxFloor.z - gc[2]]);
      else if (gd <= fw + 1.5 && gw <= fd + 1.5) move = mul(translation([cx - gc[0], cy - gc[1], boxFloor.z - gc[2]]), turnAbout(gc, [0, 0, 90]));
      if (move) for (const k of grid) { const pl = place.get(k)!; place.set(k, { ...pl, group: boxGroup }); }
    }
    if (!move) {
      const all = boundsOf(parts, place, (p) => !grid.includes(p.key));
      move = all.empty ? I34 : translation([all.hi[0] + 40 - b.lo[0], all.hi[1] - b.hi[1], -b.lo[2]]);
    }
    for (const k of grid) { const pl = place.get(k)!; place.set(k, { ...pl, m: mul(move, pl.m) }); }
    left = notched();
  }

  const joined = place.size;
  // A single part on its own is not an assembly: it lies flat with the loose ones.
  if (joined === 1) place.clear();

  // ---- loose parts ----
  const loose = parts.filter((p) => !place.has(p.key));
  if (loose.length) {
    if (settings.loose === "stack") {
      const order = [...loose].sort((a, b) => b.raw.area - a.raw.area);
      const all = boundsOf(parts, place);
      const cx = all.empty ? order[0].f.frame.w / 2 : all.hi[0] + 40 + order[0].f.frame.w / 2, cy = all.empty ? -order[0].f.frame.h / 2 : (all.lo[1] + all.hi[1]) / 2;
      let z = 0;
      for (const p of order) {
        place.set(p.key, { m: translation([cx - p.f.frame.w / 2, cy + p.f.frame.h / 2, z]), role: "loose", group: -1 });
        z += p.t;
      }
    } else {
      const ms = loose.map((p) => sheetPlacement(p));
      const tmp = new Map(loose.map((p, i) => [p.key, { m: ms[i], role: "loose" as Role, group: -1 }]));
      const lb = boundsOf(loose, tmp);
      const all = boundsOf(parts, place);
      const shift: V3 = all.empty ? [-lb.lo[0], -lb.hi[1], 0] : [all.hi[0] + 40 - lb.lo[0], all.hi[1] - lb.hi[1], 0];
      loose.forEach((p, i) => place.set(p.key, { m: mul(translation(shift), ms[i]), role: "loose", group: -1 }));
    }
  }
  return { place, notes, box, joined: joined > 1 ? joined : 0 };
}

const scale2 = (v: P, k: number): P => [v[0] * k, v[1] * k];

/** Where a part lies on its sheet, as a flat placement (the sheet's y flipped to point away). */
export function sheetPlacement(p: APart): M34 {
  const { angle, ox, oy } = p.f.frame, c = Math.cos(angle), s = Math.sin(angle);
  return [c, s, 0, ox, -s, c, 0, -oy, 0, 0, 1, 0];
}

// ---------- tabs in slots ----------

interface TabMatch { k: number; o: Orient; tau: number[]; reverse: boolean; side: { d: number } }

function tabMatch(P: APart, row: Slot[], R: APart, skip?: (k: number) => boolean): TabMatch | null {
  for (let k = 0; k < 4; k++) {
    const s = P.f.sides[k];
    if (s.kind !== "jointed" || s.tabs.length !== row.length || s.tabs.length > 8 || skip?.(k)) continue;
    // Tabs reach the side; the rest of the side is the depth the receiver's face sits at.
    if (!near(s.d, R.t, Math.max(1.5, 0.5 * R.t))) continue;
    const tau = s.tabs.map(([a, b]) => (a + b) / 2), tw = s.tabs.map(([a, b]) => b - a);
    const a0 = row[0];
    const sig = row.map((x) => (x.c[0] - a0.c[0]) * a0.axis[0] + (x.c[1] - a0.c[1]) * a0.axis[1]);
    const lenOk = (i: number, j: number) => near(tw[i], row[j].len, Math.max(1.5, 0.1 * row[j].len));
    const fwd = row.every((_, i) => lenOk(i, i) && near(tau[i] - tau[0], sig[i] - sig[0], 1.5));
    const n = row.length;
    const rev = row.every((_, i) => lenOk(n - 1 - i, i) && near(tau[n - 1] - tau[n - 1 - i], sig[i] - sig[0], 1.5));
    if (fwd || rev) return { k, o: orient(k, P.f.frame.w, P.f.frame.h), tau, reverse: !fwd, side: { d: s.d } };
  }
  return null;
}

/** P standing in R's row of slots, from the top face (up) or the bottom face: P's slab coords into R's. */
function tabLocal(P: APart, R: APart, row: Slot[], m: TabMatch, up: boolean): M34 {
  const a0 = row[0];
  const as: V3 = [a0.axis[0], -a0.axis[1], 0];
  const c0: V3 = [a0.c[0], -a0.c[1], 0];
  const Hb = m.o.H - m.side.d;
  const n = m.tau.length;
  const N: V3 = up ? [0, 0, 1] : [0, 0, -1];
  const zf = up ? R.t : 0;
  const X = m.reverse ? scale(as, -1) : as;
  const Zc = cross(X, N);
  const tauRef = m.reverse ? m.tau[n - 1] : m.tau[0];
  let O = add(c0, [0, 0, zf]);
  O = add(O, scale(X, -tauRef));
  O = add(O, scale(N, Hb));
  O = add(O, scale(Zc, -P.t / 2));
  return mul(fromCols(X, N, Zc, O), lift(m.o));
}

/** Of two placements of `p`, the one that puts it nearest the middle of the other placed parts (or the higher one). */
function nearer(p: APart, a: M34, b: M34, skip: APart, parts: APart[], place: Map<string, Placement>): M34 {
  const others = parts.filter((q) => q !== skip && q !== p && place.has(q.key));
  const c = centreOf(p);
  if (!others.length) return apply(a, c)[2] >= apply(b, c)[2] ? a : b;
  const ob = boundsOf(others, place);
  const target: V3 = [(ob.lo[0] + ob.hi[0]) / 2, (ob.lo[1] + ob.hi[1]) / 2, (ob.lo[2] + ob.hi[2]) / 2];
  const dist = (mm: M34) => Math.hypot(...sub(apply(mm, c), target));
  return dist(a) <= dist(b) ? a : b;
}

function insert(P: APart, R: APart, mR: M34, row: Slot[], m: TabMatch, parts: APart[], place: Map<string, Placement>): M34 {
  return nearer(P, mul(mR, tabLocal(P, R, row, m, true)), mul(mR, tabLocal(P, R, row, m, false)), R, parts, place);
}

function cover(P: APart, R: APart, mP: M34, row: Slot[], m: TabMatch, parts: APart[], place: Map<string, Placement>): M34 {
  return nearer(R, mul(mP, invRigid(tabLocal(P, R, row, m, true))), mul(mP, invRigid(tabLocal(P, R, row, m, false))), P, parts, place);
}

function noteSlots(P: APart, R: APart, row: Slot[], m: TabMatch, notes: SolveNote[]) {
  const tol = tolOf(P.t);
  const widthMoves: EdgeMove[] = [];
  let found = P.t;
  for (const s of row) {
    if (near(s.w, P.t, tol)) continue;
    found = s.w;
    for (const e of s.long) widthMoves.push({ key: R.key, ring: e.ring, edge: e.edge, delta: outward(R.f, e, s.c, (P.t - s.w) / 2) });
  }
  if (widthMoves.length) notes.push({ kind: "slotWidth", parts: [R.key, P.key], found, want: P.t, moves: widthMoves });
  const tabs = P.f.sides[m.k].tabs, n = row.length;
  const lenMoves: EdgeMove[] = [];
  let lf = 0, lw = 0;
  row.forEach((s, i) => {
    const [a, b] = tabs[m.reverse ? n - 1 - i : i];
    const want = b - a;
    if (near(s.len, want, 0.4)) return;
    lf = s.len; lw = want;
    for (const e of s.ends) lenMoves.push({ key: R.key, ring: e.ring, edge: e.edge, delta: outward(R.f, e, s.c, (want - s.len) / 2) });
  });
  if (lenMoves.length) notes.push({ kind: "slotLength", parts: [R.key, P.key], found: lf, want: lw, moves: lenMoves });
}

/** `k` mm along the normal of edge e pointing away from c. */
function outward(f: Features, e: EdgeRef, c: P, k: number): P {
  const poly = e.ring === 0 ? f.outer : f.holes[e.ring - 1], m = poly.pts.length;
  const a = poly.pts[e.edge % m], b = poly.pts[(e.edge + 1) % m];
  const mx = (a[0] + b[0]) / 2 - c[0], my = (a[1] + b[1]) / 2 - c[1];
  const l = Math.hypot(mx, my) || 1;
  return [(mx / l) * k, (my / l) * k];
}

// ---------- half-lap grids ----------

const notchCount = (p: APart) => p.f.sides.reduce((t, s) => t + s.notches.length, 0);
const notchSide = (p: APart) => p.f.sides.reduce((a, s) => (s.notches.length > a.notches.length ? s : a), p.f.sides[0]);

interface Lap { p: APart; o: Orient; down: boolean; m: M34; z0: number }

function lapGrid(root: APart, cands: APart[], g: number, place: Map<string, Placement>, notes: SolveNote[]): string[] {
  const s0 = notchSide(root);
  const o0 = orient(s0.k, root.f.frame.w, root.f.frame.h);
  const m0 = mul(fromCols([1, 0, 0], Z, [0, -1, 0], [0, root.t / 2, o0.H]), lift(o0));
  const laps: Lap[] = [{ p: root, o: o0, down: true, m: m0, z0: 0 }];
  place.set(root.key, { m: m0, role: "divider", group: g });
  const used = new Set<string>([root.key]);
  const taken = new Set<Notch>();
  for (let qi = 0; qi < laps.length; qi++) {
    const A = laps[qi];
    const sideA = A.p.f.sides[notchSideIndex(A)];
    const normal = norm(applyDir(A.m, [0, 0, 1]));
    for (const n of sideA.notches) {
      if (taken.has(n)) continue;
      const at = apply(A.m, [...slabOf(n.pt), A.p.t / 2] as V3);
      const found = mate(A, n, cands, used);
      if (!found) continue;
      const { q, mq } = found;
      taken.add(n);
      taken.add(mq);
      const oq = orient(A.down ? (mq.side + 2) % 4 : mq.side, q.f.frame.w, q.f.frame.h);
      const uq = orientPt(oq, mq.pt)[0];
      const build = (sgn: number) => {
        const X = scale([normal[0], normal[1], 0], sgn);
        const Zc = cross(X, Z);
        let O: V3 = [at[0], at[1], A.z0 + oq.H];
        O = add(O, scale(X, -uq));
        O = add(O, scale(Zc, -q.t / 2));
        return mul(fromCols(X, Z, Zc, O), lift(oq));
      };
      const mq3 = build(1);
      used.add(q.key);
      place.set(q.key, { m: mq3, role: "divider", group: g });
      laps.push({ p: q, o: oq, down: !A.down, m: mq3, z0: A.z0 });
      const want = A.p.t, wq = q.t;
      const moves: EdgeMove[] = [];
      if (!near(mq.w, want, tolOf(want))) moves.push(...widen(q, mq, want));
      if (!near(n.w, wq, tolOf(wq))) moves.push(...widen(A.p, n, wq));
      if (moves.length) notes.push({ kind: "notchWidth", parts: [A.p.key, q.key], found: near(mq.w, want, tolOf(want)) ? n.w : mq.w, want, moves });
    }
  }
  return [...used];
}

function notchSideIndex(A: Lap): number {
  // The side that faces down when this part's notches open downward (or up), in its own frame.
  return A.down ? A.o.k : (A.o.k + 2) % 4;
}

const slabOf = (p: P): [number, number] => [p[0], -p[1]];

function mate(A: Lap, n: Notch, cands: APart[], used: Set<string>): { q: APart; mq: Notch } | null {
  const HA = A.o.H;
  for (const q of cands) {
    if (used.has(q.key)) continue;
    for (const s of q.f.sides) {
      for (const m of s.notches) {
        if (Math.abs(m.w - n.w) > 1 + 0.2 * A.p.t) continue;
        if (!near(s.across, HA, Math.max(2, 0.05 * HA))) continue;
        if (!near(n.depth + m.depth, HA, Math.max(2, 0.08 * HA))) continue;
        return { q, mq: m };
      }
    }
  }
  return null;
}

/** Moves both walls of a notch so it is `want` wide. */
function widen(p: APart, n: Notch, want: number): EdgeMove[] {
  const o = orient(n.side, p.f.frame.w, p.f.frame.h);
  const u: P = [o.m[0], o.m[1]];
  const k = (want - n.w) / 2;
  return [
    { key: p.key, ring: n.flanks[0].ring, edge: n.flanks[0].edge, delta: [-u[0] * k, -u[1] * k] },
    { key: p.key, ring: n.flanks[1].ring, edge: n.flanks[1].edge, delta: [u[0] * k, u[1] * k] },
  ];
}
