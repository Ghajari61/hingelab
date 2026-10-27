/**
 * three.js model of a Hinge Box for the 3D view: the assembled box (base, hinge wall, lid) or the
 * cut parts lying flat. Built from the model the geometry code already computed; the bend is only
 * drawn (darker curved zones with slit lines), never recomputed.
 */
import * as THREE from "three";
import type { Edge, LayerContent, Layout, Model, Params, PlatePart, Point, WallPart } from "@/lib/hinge";
import { buildCore } from "@/lib/hinge/core";
import { honeyLattice } from "@/lib/hinge/hinge";
import { clipHalf } from "@/lib/hinge/flip";
import { builtParams } from "@/lib/hinge/model";
import { unionShapes } from "@/lib/letters/polygon";
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

export const outline = (edges: Edge[], r: number) => { const pts = ringPoints(edges, r); return keep(pts).map((i) => pts[i].p); };

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
export function slitLines(edges: Edge[], r: number, z0: number, h: number, pitch: number, bridge: number) {
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

const named = (m: Model, name: string) => m.parts.find((pt): pt is PlatePart => pt.kind === "plate" && pt.name === name);
const dotA = (q: Point, a: Point) => q[0] * a[0] + q[1] * a[1];

/** A see-through slab for a clear window. */
export function windowSlab(outer: Point[], z0: number, t: number) {
  const m = slab(outer, [], z0, t, "window");
  m.material = new THREE.MeshStandardMaterial({ color: 0xcfe6f5, transparent: true, opacity: 0.35, roughness: 0.1 });
  m.userData.keepMaterial = true;
  return m;
}

/**
 * A flip lid at height z: the strip behind the band and the band stay put; the flap turns about the
 * band's edge by `open` (0..1 of its reach, at most 100°).
 */
function flipLid(m: Model, p: Params, lid: PlatePart, z: number, open: number, win?: PlatePart) {
  const g = new THREE.Group(), f = m.flip!, a = f.a, t = p.T;
  const out = lid.pts ?? outline(lid.edges, lid.r);
  const holes = lid.slots.filter((h) => !h.every((q) => dotA(q, a) >= f.to));
  const onFlap = (h: Point[]) => h.every((q) => dotA(q, a) <= f.from);
  const rest = slab(clipHalf(out, [-a[0], -a[1]], -f.from), [], z, t, "lid");
  rest.userData.tint = 1.04;
  const strip = slab(clipHalf(clipHalf(out, [-a[0], -a[1]], -f.from), a, f.to), [], z + 0.02, t, "lid hinge");
  strip.userData.tint = 0.82;
  const flap = slab(clipHalf(out, a, f.from), holes.filter(onFlap), 0, t, "lid flap");
  flap.userData.tint = 1.04;
  // The flap turns about the band's edge on the lid's top face, upwards.
  const pivot = new THREE.Vector3(a[0] * f.from, -(a[1] * f.from), z + t);
  const axis = new THREE.Vector3(-a[1], -a[0], 0).normalize();
  const hinge = new THREE.Group();
  hinge.position.copy(pivot);
  flap.position.set(-pivot.x, -pivot.y, z - pivot.z);
  hinge.add(flap);
  // A window glued under the flap turns with it.
  if (win) {
    const w = windowSlab(win.pts ?? outline(win.edges, win.r), 0, 0.6 * t);
    w.position.set(-pivot.x, -pivot.y, z - 0.7 * t - pivot.z);
    hinge.add(w);
  }
  const angle = (Math.min(100, f.angle) * Math.PI * open) / 180;
  const q = new THREE.Quaternion().setFromAxisAngle(axis, angle);
  const probe = new THREE.Vector3(-a[0] * 10, a[1] * 10, 0).applyQuaternion(q);
  hinge.quaternion.copy(probe.z >= 0 ? q : new THREE.Quaternion().setFromAxisAngle(axis, -angle));
  g.add(rest, strip, hinge);
  return g;
}

/** The assembled box. `explode` 0..1 lifts the walls a little and the lid well clear (a flip lid swings open). */
export function buildHingeScene(model: Model, user: Params, explode = 0): Scene3D {
  const p = builtParams(user);
  const t = p.T, edges = model.core.edges, R = model.R, hBody = model.hBody;
  const inner = new THREE.Group();
  const wallLift = explode * hBody * 0.35;
  const lidLift = explode * (hBody * 0.9 + 20);
  const plateR = R + p.K / 2;
  const base = named(model, "BASE");
  inner.add(plate(edges, plateR, 0, t, "base", 0.93, base?.slots.filter((h) => isOpening(h, p)) ?? []));
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
  const lid = named(model, "LID");
  // The wall's tabs fill the lid's first slots, so only the opening (after them) shows.
  const tabSlots = edges.reduce((n, e) => n + e.tabs.length, 0);
  const holes = lid ? lid.slots.slice(p.lid === "fixed" ? tabSlots : 0) : [];
  let lidTop = top + t;
  if (p.lid === "fixed") inner.add(plate(edges, lidR, top + lidLift, t, "lid", 1.04, holes));
  if (p.lid === "removable") {
    const lipR = R - t - p.lidGap + p.K / 2;
    if (lipR > 0.5 && p.lidLip !== false) inner.add(plate(edges, lipR, top - t + lidLift, t, "lid lip", 0.86, holes));
    inner.add(plate(edges, lidR, top + lidLift, t, "lid", 1.04, holes));
  }
  // A flip lid stays on its walls (they lift as the view explodes) and swings open instead.
  if (p.lid === "flip" && lid && model.flip) inner.add(flipLid(model, p, lid, top + wallLift, explode, named(model, "WINDOW")));
  if (p.lid === "fixed" || p.lid === "removable") lidTop = top + t + lidLift;
  // ---- a cap lid: its walls round the top of the box, its top on the box's walls
  if (p.lid === "cap" && model.cap) {
    const c = model.cap, capTop = named(model, "CAP TOP"), cz = top + lidLift;
    const capTabs = c.edges.reduce((n, e) => n + e.tabs.length, 0);
    inner.add(wallBand(c.edges, c.R, c.R - t, cz - c.hBody, c.hBody));
    // The cap's walls may have their own lattice (fitted to their height).
    const lat = model.parts.find((pt): pt is WallPart => pt.kind === "wall" && pt.name.startsWith("CAP WALL"))?.lattice;
    inner.add(slitLines(c.edges, c.R + 0.15, cz - c.hBody, c.hBody, lat?.pitch ?? p.pitch, lat?.bridge ?? honeyLattice(p).bridge));
    inner.add(plate(c.edges, c.R + p.K / 2, cz, t, "cap top", 1.04, capTop ? capTop.slots.slice(capTabs) : []));
    lidTop = cz + t;
  }
  // ---- steps on the lid, and a window under an open top
  for (const st of model.parts) {
    if (st.kind !== "plate" || !/ STEP (\d)$/.test(st.name)) continue;
    const i = Number(st.name.slice(-1));
    inner.add(plate(st.edges, st.r, lidTop + (i - 1) * t, t, st.name.toLowerCase(), 1.06, st.slots));
  }
  const win = p.lid === "flip" ? undefined : named(model, "WINDOW");
  if (win) {
    const wz = p.lid === "cap" ? lidTop - 1.8 * t : p.lid === "flip" ? top - 0.7 * t : lidTop - 1.8 * t;
    inner.add(windowSlab(win.pts ?? outline(win.edges, win.r), wz, 0.6 * t));
  }
  // ---- drawers: fronts at the open top, boxes behind them, pulled out as the view explodes
  for (const d of model.drawerPlaces ?? []) {
    const front = named(model, `${d.name} FRONT`), pull = explode * d.d * 0.7;
    if (front) inner.add(plate(front.edges, front.r, top + pull + 0.5, t, d.name.toLowerCase() + " front", 1.04, front.slots).translateY(-d.cy));
    const dc = buildCore({ ...p, shape: "rect", W: d.w, D: d.d, R: d.r });
    if ("error" in dc) continue;
    const box = new THREE.Group();
    box.add(plate(dc.edges, d.r, 0, t, d.name.toLowerCase() + " base", 0.9));
    box.add(wallBand(dc.edges, d.r, d.r - t, t, d.h - t));
    // The drawer's height runs up the case (minus y in the drawing), its depth along the case's height.
    box.rotation.x = -Math.PI / 2;
    box.position.set(0, -(d.cy + d.h / 2), t + 1 + d.d / 2 + pull);
    inner.add(box);
  }
  if (p.upright || model.drawerPlaces?.length) {
    // Stood on its side: the base is the back, the lid or the drawer fronts face forward.
    const stand = new THREE.Group();
    stand.add(...inner.children.slice());
    stand.rotation.x = Math.PI / 2;
    inner.add(stand);
  }
  return finishScene(inner);
}

/** Base cuts that show: openings and keyholes, not the tab slots. */
export function isOpening(h: Point[], p: Params) {
  const b = bbox(h), w = b[2] - b[0], d = b[3] - b[1], small = Math.min(w, d), big = Math.max(w, d);
  return !(small <= p.T + Math.max(0, p.slotClr) + 0.01 && big <= p.tabW + Math.max(0, p.slotClr) + 0.01);
}
const bbox = (h: Point[]) => [Math.min(...h.map((q) => q[0])), Math.min(...h.map((q) => q[1])), Math.max(...h.map((q) => q[0])), Math.max(...h.map((q) => q[1]))];

/** The cut parts lying flat where the layout put them, with the hinge slits drawn on the walls. */
export function hingeFlatScene(lay: Layout, content: LayerContent | null, p: Params): Scene3D {
  const parts: FlatPart[] = lay.items.map(({ pt, ox, oy }) => {
    const sh = (q: Point): Point => [q[0] + ox, q[1] + oy];
    if (pt.kind === "wall") return { name: pt.name, outer: pt.outline.map(sh), holes: (pt.holes ?? []).map((h) => h.map(sh)) };
    return { name: pt.name, outer: (pt.pts ?? outline(pt.edges, pt.r)).map(sh), holes: pt.slots.map((s) => s.map(sh)) };
  });
  const regions = parts.flatMap(pt => unionShapes([pt.outer, ...pt.holes], [], true).map(s => ({ ...s, name: pt.name })));
  return flatScene(regions, p.T, content ? { d: content.hinge, width: lay.width, height: lay.height } : undefined);
}
