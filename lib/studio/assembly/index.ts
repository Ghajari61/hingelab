/**
 * The 3D assembly of a Studio document: which parts there are, where each one goes, and what is wrong
 * with the drawing for putting them together (with the edit that fixes it, where there is a safe one).
 * Pure: the editor builds the 3D scene from `parts` and applies `issues[].fix` through fixes.ts.
 */
import { apply as apply2, invert, mul as mul2, rotateAt } from "../geom";
import { MATERIAL_PRESETS, materialById } from "../library";
import { walk } from "../scene";
import type { Document, Mat } from "../types";
import { dirToDoc, edgeVertices, ringOf, toLocal } from "./features";
import { apply, mul, translation, turnAbout, type M34, type V3 } from "./mat3";
import { collectParts, type P, type RawPart } from "./parts";
import { boundsOf, centreOf, makeParts, sheetPlacement, solve, type APart, type EdgeMove, type Placement, type Role, type SolveNote } from "./solve";

export type { M34, V3 } from "./mat3";
export type { Role } from "./solve";

export interface AsmPart {
  key: string;
  name: string;
  role: Role;
  group: number;
  /** Where the part goes: its flat frame (x, -y, thickness) into the 3D frame (x right, y back, z up), mm. */
  m: M34;
  /** Where it lies on its sheet, for "Lay flat". */
  flat: M34;
  t: number;
  materialId: string;
  /** Size of the part's own frame, mm. */
  w: number;
  h: number;
  /** Outline, holes and engraving in the part's frame (x right, y down), mm. */
  outer: P[];
  holes: P[][];
  engrave: P[][];
  nodes: string[];
  hidden: boolean;
  adjusted: boolean;
}

export interface AnchorMove { node: string; sub: number; index: number; dx: number; dy: number }

export type Fix =
  | { kind: "anchors"; moves: AnchorMove[] }
  /** Sheets of material `from` (every sheet when absent) become `materialId`. */
  | { kind: "material"; materialId: string; from?: string }
  | { kind: "close"; cuts: { node: string; sub: number }[] }
  /** Each node gets this document-space matrix applied on top of where it is. */
  | { kind: "place"; nodes: { node: string; m: Mat }[] };

export interface Issue {
  id: string;
  level: "fix" | "warn" | "info";
  title: string;
  detail: string;
  parts: string[];
  fix?: Fix;
  fixLabel?: string;
  /** Applied by itself when the 3D view opens (with auto-fix on). */
  safe?: boolean;
  /** A second way to fix it. */
  alt?: { label: string; fix: Fix };
}

export interface Assembly {
  parts: AsmPart[];
  issues: Issue[];
  summary: string;
  box: { W: number; D: number; H: number } | null;
  joined: number;
  /** Bounds of the visible parts, mm. */
  lo: V3;
  hi: V3;
  empty: boolean;
}

const r1 = (v: number) => String(Math.round(v * 10) / 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function assemble(doc: Document): Assembly {
  const { parts: raw, open, truncated } = collectParts(doc);
  const parts = makeParts(raw);
  const settings = doc.assembly ?? {};
  const solved = solve(parts, settings);
  const adj = settings.parts ?? {};
  const worlds = new Map<string, Mat>();
  walk(doc.root, (l) => { worlds.set(l.node.id, l.world); });

  const place = new Map<string, Placement>();
  const out: AsmPart[] = parts.map((p) => {
    const base = solved.place.get(p.key) ?? { m: translation([0, 0, 0]), role: "loose" as Role, group: -1 };
    const a = adj[p.key];
    let m = base.m;
    if (a?.turn?.some((v) => v)) m = mul(turnAbout(apply(m, centreOf(p)), a.turn), m);
    if (a?.move?.some((v) => v)) m = mul(translation(a.move), m);
    place.set(p.key, { ...base, m });
    const loc = (pts: P[]) => pts.map((q) => toLocal(p.f.frame, q));
    return {
      key: p.key, name: p.name, role: base.role, group: base.group, m, flat: sheetPlacement(p), t: p.t, materialId: p.materialId,
      w: p.f.frame.w, h: p.f.frame.h, outer: loc(p.raw.outer.pts), holes: p.raw.holes.map((h) => loc(h.pts)), engrave: p.raw.engrave.map(loc),
      nodes: p.raw.nodes, hidden: !!a?.hidden, adjusted: !!(a && (a.hidden || a.flat || a.move?.some((v) => v) || a.turn?.some((v) => v))),
    };
  });

  const issues: Issue[] = [];
  const byKey = new Map(parts.map((p) => [p.key, p]));
  const nameOf = (k: string) => byKey.get(k)?.name ?? k;

  // Joint fits, grouped by the thickness they should fit.
  const fitNotes = solved.notes.filter((n) => n.kind === "depth" || n.kind === "slotWidth" || n.kind === "notchWidth");
  const wants = [...new Set(fitNotes.map((n) => r2(n.want)))];
  for (const want of wants) {
    const notes = fitNotes.filter((n) => r2(n.want) === want);
    const keys = [...new Set(notes.flatMap((n) => n.parts))];
    const found = notes.map((n) => n.found);
    const anchors = anchorMoves(notes, byKey, worlds);
    const what = describe(notes);
    const issue: Issue = {
      id: `fit-${want}`, level: "fix", parts: keys,
      title: `Joints don't fit ${r1(want)} mm material`,
      detail: `${what} on ${keys.map(nameOf).join(", ")}: cut for ${[...new Set(found.map(r1))].join(" / ")} mm, the material is ${r1(want)} mm.`,
    };
    if (anchors.moves.length) Object.assign(issue, { fix: { kind: "anchors", moves: anchors.moves }, fixLabel: `Fit to ${r1(want)} mm`, safe: true });
    if (anchors.skipped) issue.detail += " Some of these edges are curves or have effects, so they can't be moved automatically.";
    const depths = notes.filter((n) => n.kind === "depth").map((n) => n.found);
    if (depths.length && depths.every((d) => Math.abs(d - depths[0]) < 0.1)) {
      const current = byKey.get(keys[0])?.materialId;
      const mat = MATERIAL_PRESETS.find((m) => Math.abs(m.thickness - depths[0]) <= 0.05 && m.id !== current);
      if (mat) issue.alt = { label: `Use ${mat.name}`, fix: { kind: "material", materialId: mat.id, from: current || undefined } };
    }
    issues.push(issue);
  }
  const lenNotes = solved.notes.filter((n) => n.kind === "slotLength");
  if (lenNotes.length) {
    const anchors = anchorMoves(lenNotes, byKey, worlds);
    const keys = [...new Set(lenNotes.flatMap((n) => n.parts))];
    issues.push({
      id: "slot-length", level: "fix", parts: keys, title: "Slots don't match their tabs",
      detail: `Slot length ${r1(lenNotes[0].found)} mm for a ${r1(lenNotes[0].want)} mm tab (${keys.map(nameOf).join(", ")}).`,
      ...(anchors.moves.length ? { fix: { kind: "anchors" as const, moves: anchors.moves }, fixLabel: "Fit slots to tabs", safe: true } : {}),
    });
  }
  for (const n of solved.notes.filter((x) => x.kind === "interlock")) {
    issues.push({
      id: `interlock-${n.parts[0]}`, level: "warn", parts: n.parts, title: "Fingers may not interlock",
      detail: `${nameOf(n.parts[0])} and ${nameOf(n.parts[1])} share an edge but their fingers overlap or leave gaps (${r1(n.found)} mm).`,
    });
  }

  // Parts off their sheet.
  const nodeUse = new Map<string, number>();
  for (const p of raw) for (const id of p.nodes) nodeUse.set(id, (nodeUse.get(id) ?? 0) + 1);
  for (const p of raw) {
    const s = p.sheet;
    if (!s) continue;
    const b = boxOf(p.outer.pts);
    if (b.x0 >= s.x - 0.01 && b.y0 >= s.y - 0.01 && b.x1 <= s.x + s.w + 0.01 && b.y1 <= s.y + s.h + 0.01) continue;
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    const fits = w <= s.w && h <= s.h, turned = !fits && h <= s.w && w <= s.h;
    const own = p.nodes.every((id) => nodeUse.get(id) === 1);
    const issue: Issue = {
      id: `sheet-${p.key}`, level: fits || turned ? "fix" : "warn", parts: [p.key],
      title: fits || turned ? `${p.name} is off the sheet` : `${p.name} is larger than the sheet`,
      detail: fits || turned
        ? `It reaches outside ${s.name || "the sheet"} (${r1(s.w)} × ${r1(s.h)} mm) and would not be cut.${turned ? " It fits turned 90°." : ""}`
        : `${r1(w)} × ${r1(h)} mm doesn't fit ${s.name || "the sheet"} (${r1(s.w)} × ${r1(s.h)} mm) either way round.`,
    };
    if ((fits || turned) && own) {
      const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
      const rot: Mat = turned ? rotateAt(90, cx, cy) : [1, 0, 0, 1, 0, 0];
      const hw = (turned ? h : w) / 2, hh = (turned ? w : h) / 2;
      const nx = Math.min(Math.max(cx, s.x + hw), s.x + s.w - hw), ny = Math.min(Math.max(cy, s.y + hh), s.y + s.h - hh);
      const m = mul2([1, 0, 0, 1, nx - cx, ny - cy], rot);
      Object.assign(issue, { fix: { kind: "place", nodes: p.nodes.map((node) => ({ node, m })) }, fixLabel: turned ? "Turn onto the sheet" : "Move onto the sheet", safe: true });
    }
    issues.push(issue);
  }

  // Open cuts.
  const small = open.filter((o) => o.exact && o.gap <= 2);
  if (small.length) {
    issues.push({
      id: "open-small", level: "fix", parts: [], title: `${small.length} cut${small.length > 1 ? "s" : ""} not quite closed`,
      detail: "Their ends are 2 mm or less apart, so they don't make a part.", fix: { kind: "close", cuts: small.map(({ node, sub }) => ({ node, sub })) },
      fixLabel: "Close the gaps", safe: true,
    });
  }
  const big = open.length - small.length;
  if (big) issues.push({ id: "open", level: "warn", parts: [], title: `${big} open cut${big > 1 ? "s" : ""}`, detail: "Open lines cut through the material but don't make a part, so they aren't shown in 3D." });
  if (truncated) issues.push({ id: "truncated", level: "warn", parts: [], title: "Too much detail", detail: "The drawing has more geometry than the 3D view handles; some of it is left out." });

  const loose = out.filter((p) => p.role === "loose");
  if (!parts.length) {
    issues.push({ id: "empty", level: "info", parts: [], title: "Nothing to assemble", detail: "Closed shapes on an output cut layer are the parts. Draw some, then come back." });
  } else if (!solved.joined) {
    issues.push({ id: "nojoin", level: "info", parts: [], title: "No joints found", detail: "Parts join where finger edges match, where tabs match a row of slots, or where notches as wide as the material cross. Everything lies flat as on the sheet." });
  } else if (loose.length) {
    issues.push({ id: "loose", level: "info", parts: loose.map((p) => p.key), title: `${loose.length} part${loose.length > 1 ? "s" : ""} join nothing`, detail: `${loose.slice(0, 4).map((p) => p.name).join(", ")}${loose.length > 4 ? "…" : ""} lie${loose.length > 1 ? "" : "s"} beside the assembly.` });
  }

  const vis = boundsOf(parts, place, (p) => !adj[p.key]?.hidden);
  const joined = solved.joined;
  const box = solved.box;
  const summary = !parts.length ? "No parts"
    : box ? `Box ${r1(box.W)} × ${r1(box.D)} × ${r1(box.H)} mm · ${joined} parts joined${loose.length ? ` · ${loose.length} loose` : ""}`
    : joined ? `${joined} parts joined${loose.length ? ` · ${loose.length} loose` : ""}`
    : `${parts.length} part${parts.length > 1 ? "s" : ""} lying flat`;
  return { parts: out, issues, summary, box, joined, lo: vis.lo, hi: vis.hi, empty: vis.empty };
}

function describe(notes: SolveNote[]): string {
  const kinds = new Set(notes.map((n) => n.kind));
  const words = [kinds.has("depth") && "Finger depth", kinds.has("slotWidth") && "slot width", kinds.has("notchWidth") && "notch width"].filter(Boolean) as string[];
  return words.join(", ").replace(/^./, (c) => c.toUpperCase());
}

/** Edge moves (part frame) as anchor moves (each node's own coordinates); edges not drawn as plain straight paths are skipped. */
function anchorMoves(notes: SolveNote[], byKey: Map<string, APart>, worlds: Map<string, Mat>): { moves: AnchorMove[]; skipped: boolean } {
  const seen = new Set<string>();
  const sum = new Map<string, AnchorMove>();
  let skipped = false;
  const moves: EdgeMove[] = notes.flatMap((n) => n.moves);
  for (const mv of moves) {
    const id = `${mv.key}|${mv.ring}|${mv.edge}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = byKey.get(mv.key);
    if (!p) continue;
    const poly = ringOf(p.f, mv);
    if (!poly.src.exact) { skipped = true; continue; }
    const w = worlds.get(poly.src.node);
    if (!w) continue;
    const dd = dirToDoc(p.f.frame, mv.delta);
    const inv = invert(w);
    const o = apply2(inv, { x: 0, y: 0 }), q = apply2(inv, { x: dd[0], y: dd[1] });
    const dx = q.x - o.x, dy = q.y - o.y;
    for (const index of edgeVertices(poly, mv.edge)) {
      const k = `${poly.src.node}|${poly.src.sub}|${index}`;
      const cur = sum.get(k);
      if (cur) { cur.dx += dx; cur.dy += dy; } else sum.set(k, { node: poly.src.node, sub: poly.src.sub, index, dx, dy });
    }
  }
  return { moves: [...sum.values()], skipped };
}

function boxOf(pts: P[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

export { thicknessOf } from "./solve";
export type { RawPart };
export const materialName = (id: string) => materialById(id)?.name ?? "Material";
