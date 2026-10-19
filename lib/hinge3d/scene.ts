/**
 * three.js model of a Hinge Box for the 3D view: the assembled box (base, hinge wall, lid) or the
 * cut parts lying flat. Built from the model the geometry code already computed; the bend is only
 * drawn (darker curved zones with slit lines), never recomputed.
 */
import * as THREE from "three";
import type { Edge, LayerContent, Layout, Model, Params, Point } from "@/lib/hinge";
import { honeyLattice } from "@/lib/hinge/hinge";
import { finishScene, flatScene, slab, type FlatPart, type Scene3D } from "@/lib/three/flat";

/** Points around the core at offset r: flat sides plus `perArc` points per quarter turn of corner. */
export function ringPoints(edges: Edge[], r: number, perArc = 10): { p: Point; arc: boolean }[] {
  const pts: { p: Point; arc: boolean }[] = [];
  for (const e of edges) {
    const a1 = Math.atan2(e.n[1], e.n[0]);
    pts.push({ p: [e.p0[0] + e.n[0] * r, e.p0[1] + e.n[1] * r], arc: false });
    pts.push({ p: [e.p1[0] + e.n[0] * r, e.p1[1] + e.n[1] * r], arc: false });
    const n = Math.max(2, Math.round((perArc * e.sweep) / (Math.PI / 2)));
    for (let s = 1; s < n; s++) {
      const a = a1 + (e.sweep * s) / n;
      pts.push({ p: [e.p1[0] + Math.cos(a) * r, e.p1[1] + Math.sin(a) * r], arc: true });
    }
  }
  return pts;
}

/** Indices of ring points kept: consecutive duplicates (zero-length sides) dropped. */
function keep(pts: { p: Point }[]) {
  return pts.map((q, i) => i).filter((i) => {
    const a = pts[i].p, b = pts[(i + 1) % pts.length].p;
    return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6;
  });
}

const outline = (edges: Edge[], r: number) => { const pts = ringPoints(edges, r); return keep(pts).map((i) => pts[i].p); };

/** The wall: a band between radius ro (outside) and ri, from z0 up h; curved zones darker. */
function wallBand(edges: Edge[], ro: number, ri: number, z0: number, h: number) {
  const out = ringPoints(edges, ro), inn = ringPoints(edges, ri);
  const idx = keep(out);
  const pos: number[] = [], col: number[] = [], tri: number[] = [];
  for (const i of idx) {
    const o = out[i].p, n = inn[i].p, k = out[i].arc ? 0.8 : 1;
    for (const [x, y, z] of [[o[0], o[1], z0], [o[0], o[1], z0 + h], [n[0], n[1], z0], [n[0], n[1], z0 + h]]) {
      pos.push(x, -y, z);
      col.push(k, k, k);
    }
  }
  const N = idx.length;
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  for (let j = 0; j < N; j++) {
    const a = 4 * j, b = 4 * ((j + 1) % N);
    quad(a, b, b + 1, a + 1);
    quad(a + 2, a + 3, b + 3, b + 2);
    quad(a + 1, b + 1, b + 3, a + 3);
    quad(a, a + 2, b + 2, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(tri);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  mesh.name = "wall";
  mesh.userData.vertexBase = "#ffffff";
  return mesh;
}

/** Slit lines drawn on the outside of each curved corner, staggered like the lattice. */
function slitLines(edges: Edge[], r: number, z0: number, h: number, pitch: number, bridge: number) {
  const pos: number[] = [];
  let col = 0;
  for (const e of edges) {
    if (e.sweep < 0.01) continue;
    const a1 = Math.atan2(e.n[1], e.n[0]);
    const n = Math.max(1, Math.floor((r * e.sweep) / Math.max(0.5, pitch)));
    for (let i = 0; i < n; i++, col++) {
      const a = a1 + (e.sweep * (i + 0.5)) / n;
      const x = e.p1[0] + Math.cos(a) * r, y = -(e.p1[1] + Math.sin(a) * r);
      const segs: [number, number][] = col % 2 ? [[0, h / 2 - bridge / 2], [h / 2 + bridge / 2, h]] : [[bridge, h - bridge]];
      for (const [s0, s1] of segs) if (s1 > s0) pos.push(x, y, z0 + s0, x, y, z0 + s1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a2614, transparent: true, opacity: 0.55 }));
  lines.name = "slits";
  lines.userData.keepMaterial = true;
  return lines;
}

function plate(edges: Edge[], r: number, z0: number, t: number, name: string, tint: number, holes: Point[][] = []) {
  const m = slab(outline(edges, r), holes, z0, t, name);
  m.userData.tint = tint;
  return m;
}

/** The assembled box. `explode` 0..1 lifts the walls a little and the lid well clear. */
export function buildHingeScene(model: Model, p: Params, explode = 0): Scene3D {
  const t = p.T, edges = model.core.edges, R = model.R, hBody = model.hBody;
  const inner = new THREE.Group();
  const wallLift = explode * hBody * 0.35;
  const lidLift = explode * (hBody * 0.9 + 20);
  const plateR = R + p.K / 2;
  inner.add(plate(edges, plateR, 0, t, "base", 0.93));
  const ring = model.parts.find((pt) => pt.kind === "plate" && pt.name === "BASE RING");
  if (ring?.kind === "plate") inner.add(plate(edges, ring.r, t + wallLift * 0.45, t, "base ring", 0.78, ring.slots));
  const z0 = t + wallLift;
  inner.add(wallBand(edges, R, R - t, z0, hBody));
  inner.add(slitLines(edges, R + 0.15, z0, hBody, p.pitch, honeyLattice(p).bridge));
  for (const d of model.dividers ?? []) {
    const [a, b] = [d.at - t / 2, d.at + t / 2];
    const foot: Point[] = d.axis === "x" ? [[a, d.from], [b, d.from], [b, d.to], [a, d.to]] : [[d.from, a], [d.to, a], [d.to, b], [d.from, b]];
    const m = slab(foot, [], t + wallLift * 0.7, d.h, d.name.toLowerCase());
    m.userData.tint = 0.9;
    inner.add(m);
  }
  const top = t + hBody;
  const lidR = plateR + Math.max(0, p.lidOver ?? 0);
  const lid = model.parts.find((pt) => pt.kind === "plate" && pt.name === "LID");
  // The wall's tabs fill the lid's first slots, so only the opening (after them) shows.
  const tabSlots = edges.reduce((n, e) => n + e.tabs.length, 0);
  const holes = lid?.kind === "plate" ? lid.slots.slice(p.lid === "fixed" ? tabSlots : 0) : [];
  if (p.lid === "fixed") inner.add(plate(edges, lidR, top + lidLift, t, "lid", 1.04, holes));
  if (p.lid === "removable") {
    const lipR = R - t - p.lidGap + p.K / 2;
    if (lipR > 0.5 && p.lidLip !== false) inner.add(plate(edges, lipR, top - t + lidLift, t, "lid lip", 0.86, holes));
    inner.add(plate(edges, lidR, top + lidLift, t, "lid", 1.04, holes));
  }
  return finishScene(inner);
}

/** The cut parts lying flat where the layout put them, with the hinge slits drawn on the walls. */
export function hingeFlatScene(lay: Layout, content: LayerContent | null, p: Params): Scene3D {
  const parts: FlatPart[] = lay.items.map(({ pt, ox, oy }) => {
    const sh = (q: Point): Point => [q[0] + ox, q[1] + oy];
    if (pt.kind === "wall") return { name: pt.name, outer: pt.outline.map(sh), holes: (pt.holes ?? []).map((h) => h.map(sh)) };
    return { name: pt.name, outer: outline(pt.edges, pt.r).map(sh), holes: pt.slots.map((s) => s.map(sh)) };
  });
  return flatScene(parts, p.T, content ? { d: content.hinge, width: lay.width, height: lay.height } : undefined);
}
