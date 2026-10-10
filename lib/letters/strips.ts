/**
 * Living-hinge walls for Letter Box: unroll one wall centerline into strips.
 *
 * The rules follow the Hinge Box wall (lib/hinge/wall.ts): tabs on flats (even count on a seam
 * flat), hinge columns over the curves plus an overrun into the neighbouring flats limited by the
 * free space before the nearest tab, intervals closer than one pitch merged.
 */
import { bboxOf, hingeSegments, makeCols, tabCount, wallOutline } from "@/lib/hinge";
import type { HingeCol, Params } from "@/lib/hinge";
import { curvatureZones, tightestRadius, widestPoint } from "./curvature";
import { wallMaxLengthOf } from "./defaults";
import { Loop } from "./path";
import { signedArea } from "./polygon";
import type { Contour, LetterIssue, LetterParams, PartMark, Point, StripPart, Wall, Zone } from "./types";

/** Length of the flat placed inside a curve when a seam must go there, mm. */
export const SPLICE = 10;

export interface WallOptions {
  letter: string;
  /** "outer" or "hole 1", "hole 2", ... */
  contour: string;
  p: LetterParams;
  hp: Params;
  hBody: number;
  topTabs: boolean;
  rMin: number;
  /** Number of the first seam mark of this wall (seams are numbered per letter). */
  seamNo: number;
}

export interface WallResult {
  wall: Wall;
  parts: StripPart[];
  issues: LetterIssue[];
  seamCount: number;
}

const zone = (s0: number, s1: number, kind: Zone["kind"], splice = false): Zone => ({ s0, s1, kind, rTight: Infinity, verdict: null, splice });

/** Bend verdict, with the same thresholds as the Hinge Box bend analysis. */
export const verdictOf = (r: number, rMin: number): Zone["verdict"] => (r >= 1.25 * rMin ? "ok" : r >= rMin ? "tight" : "crack");

/** Slot rectangle for a tab centred at arc length s on the centerline (the Hinge Box slot size). */
export function slotAt(loop: Loop, s: number, p: LetterParams): Contour {
  const c = loop.at(s), t = loop.tangent(s), n: Point = [-t[1], t[0]];
  const sa = (p.tabW + p.slotClr - p.K) / 2, sb = (p.T + p.slotClr - p.K) / 2;
  const r = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([i, j]) => [c[0] + t[0] * sa * i + n[0] * sb * j, c[1] + t[1] * sa * i + n[1] * sb * j] as Point);
  return signedArea(r) < 0 ? r.reverse() : r;
}

export function hingeWall(centerline: Contour, o: WallOptions): WallResult {
  const { p, hp, hBody } = o;
  const issues: LetterIssue[] = [];
  const who = `“${o.letter}” (${o.contour})`;
  const f = 1 + (p.stretch || 0) / 100;
  const a = p.tabW;

  // ---- zones, seam at the middle of the longest flat (or on the widest curve with a splice)
  const loop0 = new Loop(centerline);
  const raw = curvatureZones(loop0, a + 6);
  const flats = raw.filter(z => z.kind === "flat");
  const startFlat = flats.length ? flats.reduce((m, z) => (z.s1 - z.s0 > m.s1 - m.s0 ? z : m)) : null;
  const start = startFlat ? (startFlat.s0 + startFlat.s1) / 2 : widestPoint(loop0, 0, loop0.length, 0);
  const loop = loop0.rotated(start);
  const L = loop.length;

  let zones: Zone[] = [];
  for (const z of raw) {
    const len = z.s1 - z.s0;
    const s0 = (((z.s0 - start) % L) + L) % L, s1 = s0 + len;
    if (s1 > L + 1e-9) zones.push(zone(s0, L, z.kind), zone(0, s1 - L, z.kind));
    else zones.push(zone(s0, Math.min(s1, L), z.kind));
  }
  zones.sort((m, n) => m.s0 - n.s0);
  const joined: Zone[] = [];
  for (const z of zones) {
    const last = joined[joined.length - 1];
    if (last && last.kind === z.kind) last.s1 = Math.max(last.s1, z.s1);
    else joined.push(z);
  }
  zones = joined;
  zones[0].s0 = 0;
  zones[zones.length - 1].s1 = L;
  for (let i = 1; i < zones.length; i++) zones[i].s0 = zones[i - 1].s1;

  if (!startFlat) {
    const h = Math.min(SPLICE / 2, L / 4);
    zones = [zone(0, h, "flat", true), zone(h, L - h, "curve"), zone(L - h, L, "flat", true)];
    issues.push({ lvl: "info", msg: `The ${who} wall has no flat stretch, so its seam sits on a curve. Glue a backing strip behind the seam.` });
  }

  // ---- strip coordinate: flats keep their length, curves shrink by the hinge stretch
  const xAt = (s: number) => zones.reduce((x, z) => x + Math.max(0, Math.min(s, z.s1) - z.s0) / (z.kind === "curve" ? f : 1), 0);

  // ---- extra seams for strips longer than the bed allows
  const seams = [0];
  const maxLen = wallMaxLengthOf(p);
  for (let guard = 0; guard < 64; guard++) {
    const cuts = [...seams.sort((m, n) => m - n), L];
    const i = cuts.findIndex((s, k) => k < cuts.length - 1 && xAt(cuts[k + 1]) - xAt(s) > maxLen);
    if (i < 0) break;
    const s0 = cuts[i], s1 = cuts[i + 1];
    const free = zones.filter(z => z.kind === "flat" && !z.splice && z.s0 > s0 + 1e-6 && z.s1 < s1 - 1e-6 && !seams.some(s => s > z.s0 && s < z.s1));
    if (free.length) {
      const z = free.reduce((m, q) => (q.s1 - q.s0 > m.s1 - m.s0 ? q : m));
      seams.push((z.s0 + z.s1) / 2);
      continue;
    }
    const curves = zones.filter(z => z.kind === "curve" && z.s0 >= s0 && z.s1 <= s1 && z.s1 - z.s0 > 2 * SPLICE + 2);
    if (!curves.length) {
      issues.push({ lvl: "warn", msg: `The ${who} wall is longer than ${Math.round(maxLen)} mm and has no place for another seam. Use a larger bed or a smaller size.` });
      break;
    }
    const z = curves.reduce((m, q) => (q.s1 - q.s0 > m.s1 - m.s0 ? q : m));
    const s = widestPoint(loop, z.s0, z.s1, SPLICE + 1);
    const k = zones.indexOf(z);
    zones.splice(k, 1, zone(z.s0, s - SPLICE / 2, "curve"), zone(s - SPLICE / 2, s + SPLICE / 2, "flat", true), zone(s + SPLICE / 2, z.s1, "curve"));
    seams.push(s);
    issues.push({ lvl: "info", msg: `The ${who} wall is split on a curve. Glue a backing strip behind that seam.` });
  }
  seams.sort((m, n) => m - n);
  const seamIn = (z: Zone) => seams.some(s => (s > z.s0 && s < z.s1) || (s === 0 && (z.s0 === 0 || z.s1 === L)));

  // ---- tabs on the flats; the flat around the first seam is split between the two ends
  const tabsOf = new Map<Zone, number[]>(zones.map(z => [z, []]));
  const first = zones[0], last = zones[zones.length - 1];
  const wraps = first.kind === "flat" && last.kind === "flat" && !first.splice && zones.length > 1;
  for (const z of zones) {
    if (z.kind !== "flat" || z.splice || (wraps && z === last)) continue;
    const z0 = wraps && z === first ? last.s0 : z.s0;
    const len = wraps && z === first ? L - last.s0 + first.s1 : z.s1 - z.s0;
    const n = tabCount(len, a, seamIn(z));
    for (let j = 0; j < n; j++) {
      const s = z0 + (len * (j + 0.5)) / n;
      if (s >= L) tabsOf.get(first)!.push(s - L);
      else tabsOf.get(wraps && z === first ? last : z)!.push(s);
    }
  }
  const tabs = [...tabsOf.values()].flat().sort((m, n) => m - n);

  // ---- hinge intervals over the curves, overrunning into the flats
  const free = (z: Zone, edge: number) => {
    const ts = tabsOf.get(z)!;
    if (ts.length) return Math.min(...ts.map(t => Math.abs(t - edge) - a / 2));
    if (z.splice) return 1.5;
    const ss = seams.filter(s => s >= z.s0 - 1e-9 && s <= z.s1 + 1e-9).concat(z.s1 === L && seams[0] === 0 ? [L] : []);
    if (ss.length) return Math.min(...ss.map(s => Math.abs(s - edge))) - 2;
    return (z.s1 - z.s0) / 2;
  };
  const ivals: [number, number][] = [];
  zones.forEach((z, k) => {
    if (z.kind !== "curve") return;
    const prev = zones[k - 1], next = zones[k + 1];
    const before = prev ? Math.max(0, Math.min(p.overrun, free(prev, prev.s1) - 1.5)) : 0;
    const after = next ? Math.max(0, Math.min(p.overrun, free(next, next.s0) - 1.5)) : 0;
    ivals.push([xAt(z.s0) - before, xAt(z.s1) + after]);
  });
  ivals.sort((m, n) => m[0] - n[0]);
  const merged: [number, number][] = [];
  for (const iv of ivals) {
    const lm = merged[merged.length - 1];
    if (lm && iv[0] <= lm[1] + p.pitch) lm[1] = Math.max(lm[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  const cols: HingeCol[] = [];
  for (const [x0, x1] of merged) cols.push(...makeCols(x0, x1, hp));
  const hs = hingeSegments(hBody, p.slit, p.bridge);

  // ---- strip pieces
  const tabX = tabs.map(xAt);
  const cuts = [...seams, L];
  const edgeMargin = p.cutStyle === "slot" ? Math.max(0.4, p.slotW) : 0.4;
  const base = `${o.letter} · ${o.contour}`;
  const parts: StripPart[] = [];
  const pieceLengths: number[] = [];
  for (let i = 0; i < seams.length; i++) {
    const x0 = xAt(cuts[i]), x1 = xAt(cuts[i + 1]), w = x1 - x0;
    const tabsHere = tabX.filter(t => t > x0 && t < x1).map(t => t - x0);
    const myCols = cols.filter(c => c.x > x0 + edgeMargin && c.x < x1 - edgeMargin).map(c => ({ x: c.x - x0, kind: c.kind }));
    const wo = wallOutline(w, hBody, o.topTabs ? tabsHere : [], tabsHere, myCols, hp, hs);
    let lab: number | null = null, best = 0;
    for (const z of zones) {
      if (z.kind !== "flat") continue;
      const a0 = Math.max(xAt(z.s0), x0), a1 = Math.min(xAt(z.s1), x1);
      if (a1 - a0 > best) { best = a1 - a0; lab = (a0 + a1) / 2 - x0; }
    }
    const idA = `${o.letter}${o.seamNo + i}`, idB = `${o.letter}${o.seamNo + ((i + 1) % seams.length)}`;
    const mark = (x: number, text: string): PartMark => ({ x, y: hBody / 2, text, size: 3, rot: -90 });
    parts.push({
      kind: "strip",
      name: seams.length > 1 ? `${base} ${i + 1}` : base,
      outline: wo.outline,
      caps: wo.caps,
      cols: myCols,
      hBody,
      w,
      tabs: tabsHere,
      label: best > 18 && lab != null ? { x: lab, y: hBody / 2 } : null,
      marks: [mark(2.5, `◂ ${idA}`), mark(w - 2.5, `${idB} ▸`)],
      bbox: bboxOf(wo.outline),
    });
    pieceLengths.push(w);
  }

  // ---- bend check per curve zone
  for (const z of zones) if (z.kind === "curve") {
    z.rTight = tightestRadius(loop, z.s0, z.s1);
    z.verdict = verdictOf(z.rTight, o.rMin);
  }

  const wall: Wall = {
    letter: o.letter,
    contour: o.contour,
    style: "hinge",
    centerline: loop.pts,
    length: L,
    zones,
    seams,
    tabs,
    joints: [],
    slots: tabs.map(s => slotAt(loop, s, p)),
    pieceLengths,
  };
  return { wall, parts, issues, seamCount: seams.length };
}
