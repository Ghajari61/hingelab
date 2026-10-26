import type { Edge, Model, Params, PlatePart, Point } from "@/lib/hinge";
import { buildCore } from "@/lib/hinge/core";
import { clipHalf } from "@/lib/hinge/flip";
import { builtParams } from "@/lib/hinge/model";

type Vec3 = [number, number, number];
interface RingPt { p: Point; arc: boolean }
/** One flat face of the model in box coordinates (x, y as drawn, z up), with what is drawn on it. */
interface Face {
  q: Vec3[];
  /** Base brightness before lighting; inside faces are darker. */
  tone: number;
  /** Holes and windows drawn on the face. */
  decals?: { q: Vec3[]; fill: string }[];
  /** Lines drawn on the face (slits). */
  lines?: [Vec3, Vec3][];
  fill?: string;
  /** A hole through the face (the inside of a wall's top edge). */
  hole?: Vec3[];
  /** Drawn after faces it would otherwise sort behind (drawer fronts close a case). */
  bias?: number;
}

function ring(edges: Edge[], r: number, perArc: number): RingPt[] {
  const pts: RingPt[] = [];
  edges.forEach(e => {
    const a1 = Math.atan2(e.n[1], e.n[0]);
    pts.push({ p: [e.p0[0] + e.n[0] * r, e.p0[1] + e.n[1] * r], arc: false });
    pts.push({ p: [e.p1[0] + e.n[0] * r, e.p1[1] + e.n[1] * r], arc: false });
    const n = Math.max(2, Math.round(perArc * e.sweep / (Math.PI / 2)));
    for (let s = 1; s < n; s++) {
      const a = a1 + e.sweep * s / n;
      pts.push({ p: [e.p1[0] + Math.cos(a) * r, e.p1[1] + Math.sin(a) * r], arc: true });
    }
  });
  return pts.filter((q, i) => {
    const n = pts[(i + 1) % pts.length];
    return Math.hypot(q.p[0] - n.p[0], q.p[1] - n.p[1]) > 1e-6;
  });
}

const HOLE = "rgba(48,30,14,.62)";
const GLASS = "rgba(178,214,236,.78)";

/** Side faces of a solid with outline `pts` from z0 to z1, its top, and (when `bottom`) its underside. */
function prism(pts: Point[], z0: number, z1: number, tone: number, decals: Point[][] = [], opts: { bottom?: boolean; fill?: string; hinge?: boolean[]; skip?: number[]; decalFill?: string } = {}): Face[] {
  const out: Face[] = [];
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
  // Side faces wind so their normal points out of the solid.
  const ccw = area > 0;
  for (let i = 0; i < pts.length; i++) {
    if (opts.skip?.includes(i)) continue;
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const q: Vec3[] = ccw ? [[a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0]] : [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    const f: Face = { q, tone, fill: opts.fill };
    if (opts.hinge?.[i]) f.lines = [[[a[0], a[1], z0], [a[0], a[1], z1]]];
    out.push(f);
  }
  const top = (ccw ? pts.slice().reverse() : pts).map(([x, y]) => [x, y, z1] as Vec3);
  out.push({ q: top, tone: tone * 1.1, fill: opts.fill, decals: decals.map((d) => ({ q: d.map(([x, y]) => [x, y, z1 + 0.01] as Vec3), fill: opts.decalFill ?? HOLE })) });
  if (opts.bottom) out.push({ q: (ccw ? pts : pts.slice().reverse()).map(([x, y]) => [x, y, z0] as Vec3), tone: tone * 0.7, fill: opts.fill });
  return out;
}

/** A wall: outside and inside faces between rings `outer` and `inner`, and its top edge. */
function band(outer: RingPt[], inner: RingPt[], z0: number, z1: number): Face[] {
  const out: Face[] = [];
  const n = outer.length;
  let area = 0;
  for (let i = 0; i < n; i++) { const a = outer[i].p, b = outer[(i + 1) % n].p; area += a[0] * b[1] - b[0] * a[1]; }
  const ccw = area > 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = outer[i].p, b = outer[j].p, c = inner[i].p, d = inner[j].p;
    const arc = outer[i].arc || outer[j].arc;
    const o: Vec3[] = [[a[0], a[1], z0], [a[0], a[1], z1], [b[0], b[1], z1], [b[0], b[1], z0]];
    const inn: Vec3[] = [[c[0], c[1], z0], [d[0], d[1], z0], [d[0], d[1], z1], [c[0], c[1], z1]];
    out.push({ q: ccw ? o : o.slice().reverse(), tone: 1, lines: arc ? [[[a[0], a[1], z0], [a[0], a[1], z1]]] : undefined });
    out.push({ q: ccw ? inn : inn.slice().reverse(), tone: 0.62 });
  }
  // the top edge: one ring-shaped face
  const ringTop = (rg: RingPt[]) => rg.map((v) => [v.p[0], v.p[1], z1] as Vec3);
  out.push({ q: ccw ? ringTop(outer).reverse() : ringTop(outer), hole: ringTop(inner), tone: 1.05 });
  return out;
}

const pts = (rg: RingPt[]) => rg.map((v) => v.p);
const named = (m: Model, name: string) => m.parts.find((pt): pt is PlatePart => pt.kind === "plate" && pt.name === name);
const dotA = (q: Point, a: Point) => q[0] * a[0] + q[1] * a[1];

/** Turn the faces about the line through `pivot` along `axis` (unit, horizontal) by `ang`. */
function turn(faces: Face[], pivot: Vec3, axis: [number, number], ang: number): Face[] {
  const c = Math.cos(ang), s = Math.sin(ang), [ux, uy] = axis;
  const rot = ([x, y, z]: Vec3): Vec3 => {
    const v: Vec3 = [x - pivot[0], y - pivot[1], z - pivot[2]];
    // Rodrigues' rotation about (ux, uy, 0)
    const d = v[0] * ux + v[1] * uy;
    const cx = uy * v[2], cy = -ux * v[2], cz = ux * v[1] - uy * v[0];
    return [pivot[0] + v[0] * c + cx * s + ux * d * (1 - c), pivot[1] + v[1] * c + cy * s + uy * d * (1 - c), pivot[2] + v[2] * c + cz * s];
  };
  return faces.map((f) => ({ ...f, q: f.q.map(rot), decals: f.decals?.map((d) => ({ ...d, q: d.q.map(rot) })), lines: f.lines?.map(([a, b]) => [rot(a), rot(b)] as [Vec3, Vec3]) }));
}

/** The faces of the assembled box, in box coordinates. */
function boxFaces(model: Model, user: Params, explode: number): Face[] {
  const p = builtParams(user);
  const t = p.T, edges = model.core.edges, R = model.R, H = p.H;
  const faces: Face[] = [];
  const outer = ring(edges, R, 10), inner = ring(edges, R - t, 10);
  const lidLift = p.lid === "removable" || p.lid === "cap" ? explode * H * 0.9 : 0;
  const zTop = p.lid === "open" ? H : H - t;
  const base = named(model, "BASE");
  faces.push(...prism(pts(outer), 0, t, 0.62, base ? base.slots.filter((h) => opening(h, p)) : []));
  faces.push(...band(outer, inner, t, zTop));
  for (const d of model.dividers ?? []) {
    const [a, b] = [d.at - t / 2, d.at + t / 2];
    const foot: Point[] = d.axis === "x" ? [[a, d.from], [b, d.from], [b, d.to], [a, d.to]] : [[d.from, a], [d.to, a], [d.to, b], [d.from, b]];
    // The ends stand against the wall, never seen; drawn, they would show through it.
    faces.push(...prism(foot, t, t + d.h, 0.8, [], { skip: d.axis === "x" ? [0, 2] : [1, 3] }));
  }
  const over = p.lidOver ?? 0;
  const lidRing = over ? ring(edges, R + over, 10) : outer;
  // With a window, the lid's opening is glass.
  const glass = named(model, "WINDOW") ? { decalFill: GLASS } : {};
  const lid = named(model, "LID");
  const tabs = edges.reduce((n, e) => n + e.tabs.length, 0);
  let top = H;
  if (p.lid === "fixed") faces.push(...prism(pts(lidRing), H - t, H, 1, lid ? lid.slots.slice(tabs) : [], glass));
  if (p.lid === "removable") {
    const z0 = H - t + lidLift, lipR = R - t - p.lidGap;
    if (lipR > 0.5 && lidLift > 0.5 && p.lidLip !== false) faces.push(...prism(pts(ring(edges, lipR, 8)), z0 - t, z0, 0.8));
    faces.push(...prism(pts(lidRing), z0, z0 + t, 1, lid?.slots ?? [], glass));
    top = z0 + t;
  }
  if (p.lid === "flip" && lid && model.flip) {
    const f = model.flip, a = f.a, all = pts(lidRing);
    const holes = lid.slots.filter((h) => !h.every((q) => dotA(q, a) >= f.to));
    const keep = clipHalf(all, [-a[0], -a[1]], -f.from);
    faces.push(...prism(keep, H - t, H, 1));
    // the band: a darker strip with a few of its cut lines
    const strip = clipHalf(keep, a, f.to);
    const bandFaces = prism(strip, H - t + 0.02, H + 0.02, 0.86);
    const b: Point = [-a[1], a[0]], span = Math.max(...all.map((q) => Math.abs(dotA(q, b))));
    const lines: [Vec3, Vec3][] = [];
    for (let u = f.from + 2; u < f.to - 1; u += Math.max(2, (f.to - f.from) / 7)) lines.push([[a[0] * u - b[0] * span * 0.92, a[1] * u - b[1] * span * 0.92, H + 0.05], [a[0] * u + b[0] * span * 0.92, a[1] * u + b[1] * span * 0.92, H + 0.05]]);
    bandFaces[bandFaces.length - 1].lines = lines;
    faces.push(...bandFaces);
    const flap = prism(clipHalf(all, a, f.from), H - t, H, 1, holes.filter((h) => h.every((q) => dotA(q, a) <= f.from)), { bottom: true, ...glass });
    const open = (Math.min(100, f.angle) * Math.PI / 180) * Math.min(1, explode * 1.6);
    const pivot: Vec3 = [a[0] * f.from, a[1] * f.from, H];
    // Turned so the flap's far edge goes up.
    let turned = turn(flap, pivot, [b[0], b[1]], open);
    const probe = turn([{ q: [[-a[0] * 10 + pivot[0], -a[1] * 10 + pivot[1], H]], tone: 1 }], pivot, [b[0], b[1]], open)[0].q[0];
    if (probe[2] < H - 1e-6) turned = turn(flap, pivot, [b[0], b[1]], -open);
    faces.push(...turned);
  }
  if (p.lid === "cap" && model.cap) {
    const c = model.cap, z1 = H + lidLift, capTop = named(model, "CAP TOP");
    const ctabs = c.edges.reduce((n, e) => n + e.tabs.length, 0);
    faces.push(...band(ring(c.edges, c.R, 10), ring(c.edges, c.R - t, 10), z1 - t - c.hBody, z1 - t));
    faces.push(...prism(pts(ring(c.edges, c.R, 10)), z1 - t, z1, 1, capTop ? capTop.slots.slice(ctabs) : [], glass));
    top = z1;
  }
  if (p.lid === "fixed") top = H;
  for (const st of model.parts) {
    if (st.kind !== "plate" || !/ STEP \d$/.test(st.name)) continue;
    const i = Number(st.name.slice(-1));
    faces.push(...prism(pts(ring(st.edges, st.r, 10)), top + (i - 1) * t, top + i * t, 1.04, st.slots));
  }

  // ---- drawer fronts on the open top of a chest of drawers
  for (const d of model.drawerPlaces ?? []) {
    const fc = buildCore({ ...p, shape: "rect", W: d.fw, D: d.fh, R: 2 });
    if ("error" in fc) continue;
    // Closed: a front that floats out would hide the case it belongs to.
    const pull = 0;
    const front = named(model, `${d.name} FRONT`);
    const knob = front?.slots.map((h) => h.map(([x, y]) => [x, y + d.cy] as Point)) ?? [];
    faces.push(...prism(pts(ring(fc.edges, 2, 4)).map(([x, y]) => [x, y + d.cy] as Point), H + pull, H + pull + t, 1.04, knob).map((f) => ({ ...f, bias: 1e4 })));
  }
  return faces;
}

/** Base cuts worth drawing: openings and keyholes, not tab slots. */
function opening(h: Point[], p: Params) {
  const xs = h.map((q) => q[0]), ys = h.map((q) => q[1]);
  const w = Math.max(...xs) - Math.min(...xs), d = Math.max(...ys) - Math.min(...ys);
  return !(Math.min(w, d) <= p.T + Math.max(0, p.slotClr) + 0.01 && Math.max(w, d) <= p.tabW + Math.max(0, p.slotClr) + 0.01);
}

/** How far a thumbnail opens the box: a lift-off lid raised, a flip lid half open, a cap raised a little. */
export const thumbExplode = (p: Params) => (p.lid === "removable" || p.lid === "flip" ? 0.35 : p.lid === "cap" ? 0.22 : 0);

/**
 * Orthographic preview of the assembled box. Dragging changes `yaw`; `explode` lifts a removable or
 * cap lid and swings a flip lid open. An upright box (a cabinet, a chest of drawers) stands on its side.
 */
export function sceneSVG(model: Model, p: Params, yaw: number, explode: number) {
  const elev = 0.62, ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const upright = !!p.upright || !!model.drawerPlaces?.length;
  // Stood up: the base goes to the back, the lid to the front, the drawing's top edge up.
  const place = ([x, y, z]: Vec3): Vec3 => (upright ? [x, z - p.H / 2, -y] : [x, y, z]);
  const rotXY = ([x, y, z]: Vec3): Vec3 => [x * cy - y * sy, x * sy + y * cy, z];
  const proj = (v: Vec3): Vec3 => { const [X, Y, z] = rotXY(place(v)); return [X, Y * se - z * ce, Y * ce + z * se]; };
  const wood = [201, 163, 106];
  const L: Vec3 = [-0.55, 0.83, 0.5];
  const items: { q: Vec3[]; hole?: Vec3[]; fill: string; depth: number; lines: [Vec3, Vec3][]; decals: { q: Vec3[]; fill: string }[] }[] = [];
  for (const f of boxFaces(model, p, explode)) {
    const w = f.q.map((v) => rotXY(place(v)));
    // Newell normal of the face as placed.
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) continue;
    // y runs down the drawing, so the windings above give the inward normal: turn it round.
    nx /= -len; ny /= -len; nz /= -len;
    // Seen from the front and above; faces turned away are left out.
    if (ny * ce + nz * se <= 1e-6) continue;
    const lit = nz > 0.75 ? 1 : 0.5 + 0.5 * Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / Math.hypot(...L));
    const k = Math.min(1.12, lit * f.tone);
    const fill = f.fill ?? `rgb(${wood.map((c) => Math.round(Math.min(255, c * k))).join(",")})`;
    const q = f.q.map(proj);
    const depth = q.reduce((s, v) => s + v[2], 0) / q.length + (f.bias ?? 0);
    items.push({ q, hole: f.hole?.map(proj), fill, depth, lines: (f.lines ?? []).map(([a, b]) => [proj(a), proj(b)] as [Vec3, Vec3]), decals: (f.decals ?? []).map((d) => ({ q: d.q.map(proj), fill: d.fill })) });
  }
  items.sort((a, b) => a.depth - b.depth);
  const all = items.flatMap(it => it.q);
  const xs = all.map(q => q[0]), ys = all.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const VW = 280, VH = 186, sc = Math.min((VW - 30) / (maxX - minX), (VH - 26) / (maxY - minY));
  const ox = (VW - (maxX - minX) * sc) / 2 - minX * sc, oy = (VH - (maxY - minY) * sc) / 2 - minY * sc;
  // A tenth of a unit is finer than the picture shows and keeps the file small.
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const X = (q: Vec3) => r1(q[0] * sc + ox), Y = (q: Vec3) => r1(q[1] * sc + oy);
  const P2 = (q: Vec3) => `${X(q)},${Y(q)}`;
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<ellipse cx="${VW / 2}" cy="${r1(maxY * sc + oy + 4)}" rx="${r1((maxX - minX) * sc * 0.48)}" ry="7" fill="#000" fill-opacity=".16"/>`;
  for (const it of items) {
    if (it.hole) svg += `<path d="M${it.q.map(P2).join("L")}ZM${it.hole.map(P2).join("L")}Z" fill="${it.fill}" fill-rule="evenodd" stroke="rgba(60,40,20,.35)" stroke-width=".5" stroke-linejoin="round"/>`;
    else svg += `<polygon points="${it.q.map(P2).join(" ")}" fill="${it.fill}" stroke="rgba(60,40,20,.35)" stroke-width=".5" stroke-linejoin="round"/>`;
    for (const d of it.decals) svg += `<polygon points="${d.q.map(P2).join(" ")}" fill="${d.fill}" stroke="rgba(60,40,20,.4)" stroke-width=".4"/>`;
    for (const [a, b] of it.lines) svg += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke="rgba(50,30,10,.55)" stroke-width=".7"/>`;
  }
  svg += `</svg>`;
  return svg;
}
