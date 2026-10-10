import type { Edge, Model, Params, Point } from "@/lib/hinge";
import { r3 } from "@/lib/hinge";

type Vec3 = [number, number, number];
interface RingPt { p: Point; arc: boolean }
interface Face { q: Vec3[]; fill: string; depth: number; line: [Vec3, Vec3] | null }

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

/** Orthographic preview of the assembled box. Dragging changes `yaw`; `explode` lifts a removable lid. */
export function sceneSVG(model: Model, p: Params, yaw: number, explode: number) {
  const t = p.T, edges = model.core.edges, R = model.R;
  const elev = 0.62, ce = Math.cos(elev), se = Math.sin(elev), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const proj = (x: number, y: number, z: number): Vec3 => {
    const X = x * cy - y * sy, Y = x * sy + y * cy;
    return [X, Y * se - z * ce, Y];
  };
  const rot = (nx: number, ny: number) => [nx * cy - ny * sy, nx * sy + ny * cy];
  const outer = ring(edges, R, 10);
  const lidLift = p.lid === "removable" ? explode * p.H * 0.9 : 0;
  const zBodyTop = p.lid === "open" ? p.H : p.H - t;
  const wood = [201, 163, 106];
  const shade = (k: number, dark = 0) => `rgb(${wood.map(c => Math.round(c * k * (1 - dark))).join(",")})`;
  const L = [-0.55, 0.83];
  function walls(rg: RingPt[], z0: number, z1: number, opts: { only?: "front" | "back"; hinge?: boolean }) {
    const out: Face[] = [];
    for (let i = 0; i < rg.length; i++) {
      const a = rg[i].p, b = rg[(i + 1) % rg.length].p;
      const nx = b[1] - a[1], ny = -(b[0] - a[0]), l = Math.hypot(nx, ny);
      const nr = rot(nx / l, ny / l);
      const front = nr[1] > 0;
      if (opts.only === "front" && !front) continue;
      if (opts.only === "back" && front) continue;
      const k = 0.5 + 0.5 * Math.max(0, nr[0] * L[0] + nr[1] * L[1]);
      const q: Vec3[] = [proj(a[0], a[1], z0), proj(b[0], b[1], z0), proj(b[0], b[1], z1), proj(a[0], a[1], z1)];
      const isArc = rg[i].arc || rg[(i + 1) % rg.length].arc;
      out.push({ q, fill: front ? shade(k) : shade(0.55, 0.15), depth: (q[0][2] + q[1][2]) / 2, line: opts.hinge && isArc && front ? [q[0], q[3]] : null });
    }
    return out;
  }
  const cap = (rg: RingPt[], z: number, k: number): Face => ({ q: rg.map(v => proj(v.p[0], v.p[1], z)), fill: shade(k), depth: -1e9, line: null });
  const items: Face[] = [];
  if (p.lid !== "fixed") {
    items.push(cap(outer, t, 0.62));
    items.push(...walls(outer, t, zBodyTop, { only: "back" }).sort((a, b) => a.depth - b.depth));
  }
  items.push(...walls(outer, 0, zBodyTop, { only: "front", hinge: true }).sort((a, b) => a.depth - b.depth));
  if (p.lid === "fixed") items.push(cap(outer, p.H, 1.02));
  if (p.lid === "removable") {
    const z0 = p.H - t + lidLift;
    const lipR = R - t - p.lidGap;
    if (lipR > 0.5 && lidLift > 0.5) items.push(...walls(ring(edges, lipR, 8), z0 - t, z0, { only: "front" }));
    items.push(...walls(outer, z0, z0 + t, { only: "front" }));
    items.push(cap(outer, z0 + t, 1.02));
  }
  const all = items.flatMap(it => it.q);
  const xs = all.map(q => q[0]), ys = all.map(q => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const VW = 280, VH = 186, sc = Math.min((VW - 30) / (maxX - minX), (VH - 26) / (maxY - minY));
  const ox = (VW - (maxX - minX) * sc) / 2 - minX * sc, oy = (VH - (maxY - minY) * sc) / 2 - minY * sc;
  const P2 = (q: Vec3) => `${r3(q[0] * sc + ox)},${r3(q[1] * sc + oy)}`;
  let svg = `<svg viewBox="0 0 ${VW} ${VH}" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<ellipse cx="${VW / 2}" cy="${r3(maxY * sc + oy + 4)}" rx="${r3((maxX - minX) * sc * 0.48)}" ry="7" fill="#000" fill-opacity=".35"/>`;
  for (const it of items) {
    svg += `<polygon points="${it.q.map(P2).join(" ")}" fill="${it.fill}" stroke="rgba(60,40,20,.35)" stroke-width=".5" stroke-linejoin="round"/>`;
    if (it.line) svg += `<line x1="${P2(it.line[0]).split(",")[0]}" y1="${P2(it.line[0]).split(",")[1]}" x2="${P2(it.line[1]).split(",")[0]}" y2="${P2(it.line[1]).split(",")[1]}" stroke="rgba(50,30,10,.55)" stroke-width=".7"/>`;
  }
  svg += `</svg>`;
  return svg;
}
