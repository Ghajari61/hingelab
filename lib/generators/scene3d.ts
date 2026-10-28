/**
 * Any generator's assembled design in 3D: every part as a slab where `place` puts it, upright parts
 * stood on edge, engraving as a thin dark skin. Explode lifts each layer away from the one below.
 */
import * as THREE from "three";
import { applyRadialSurface } from '@/lib/three/radialSurface';
import { unionShapes } from "@/lib/letters/polygon";
import { finishScene, slab, slabs, type Scene3D } from "@/lib/three/flat";
import { ITEM_SEP, itemOf, itemSkinName } from "./items";
import type { Contour, GenImage, GenOutput, GenPart, Hardware3D } from "./types";
import type { Layout } from "@/lib/hinge";
import type { CutPart } from "./output";

const ENGRAVE = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9 });
ENGRAVE.userData.shared = true;
const SCORE_FILL = new THREE.MeshStandardMaterial({ color: "#3a2a1c", roughness: 0.9, transparent: true, opacity: 0.22, depthWrite: false });

/** Contours grouped by the item they were tagged as (undefined: not an item, a border). */
function byItem(cs: Contour[]): Map<string | undefined, Contour[]> {
  const out = new Map<string | undefined, Contour[]>();
  for (const c of cs) {
    const k = itemOf(c), group = out.get(k);
    if (group) group.push(c);
    else out.set(k, [c]);
  }
  return out;
}

/** An item's mesh: its own copy of `look` (so selecting it lights only it), kept in every look, left out of the dimensions. */
function itemMesh(mesh: THREE.Mesh, look: THREE.MeshStandardMaterial): THREE.Mesh {
  (mesh.material as THREE.Material).dispose();
  mesh.material = look.clone();
  mesh.userData.keepMaterial = true;
  mesh.userData.noMeasure = true;
  return mesh;
}

type View = NonNullable<GenPart["views3d"]>[number];
type Shown = GenPart & { frames?: View["frames"]; apart?: View["apart"]; creases?: View["creases"]; radialSurface?: View['radialSurface'] };

const CORD = new THREE.MeshStandardMaterial({ color: "#d9cbb4", roughness: 0.95 });
const METAL = new THREE.MeshStandardMaterial({ color: "#9aa0a6", roughness: 0.35, metalness: 0.8 });
const BULB = new THREE.MeshStandardMaterial({ color: "#fff6dc", emissive: "#ffe9b0", emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.85 });
for (const m of [CORD, METAL, BULB]) m.userData.shared = true;

/** Plan (x, y toward the viewer, z up) to the scene's axes (x, -y, z). */
const v3 = (p: [number, number, number]) => new THREE.Vector3(p[0], -p[1], p[2]);

/** Cords, knots, rings and sockets as meshes that keep their own materials and are not measured or picked. */
function hardwareGroup(hw: Hardware3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = "Hardware";
  const add = (mesh: THREE.Mesh, name: string) => {
    mesh.name = name;
    mesh.userData.keepMaterial = true;
    mesh.userData.noMeasure = true;
    mesh.userData.noPick = true;
    g.add(mesh);
  };
  for (const h of hw) {
    if (h.kind === "cord") {
      for (let i = 0; i + 1 < h.pts.length; i++) {
        const a = v3(h.pts[i]), b = v3(h.pts[i + 1]), L = a.distanceTo(b);
        if (L < 1e-3) continue;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(h.d / 2, h.d / 2, L, 8, 1), CORD);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        add(m, "Cord");
      }
    } else if (h.kind === "knot") {
      const m = new THREE.Mesh(new THREE.SphereGeometry(h.d / 2, 12, 8), CORD);
      m.position.copy(v3(h.at));
      add(m, "Knot");
    } else if (h.kind === "ring") {
      const m = new THREE.Mesh(new THREE.TorusGeometry(h.r, h.d / 2, 8, 32), METAL);
      m.position.copy(v3(h.at));
      m.rotation.x = Math.PI / 2;
      add(m, "Hanging ring");
    } else if (h.kind === "cylinder") {
      const mat = h.metal ? METAL : h.glass
        ? new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.1, transparent: true, opacity: 0.35, depthWrite: false })
        : new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.6 });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(h.r, h.r, h.h, 40, 1), mat);
      m.position.copy(v3(h.at)).add(new THREE.Vector3(0, 0, h.h / 2));
      m.rotation.x = Math.PI / 2;
      add(m, "Fitting");
    } else {
      const m = new THREE.Mesh(new THREE.SphereGeometry(h.r, 32, 20), BULB);
      m.position.copy(v3(h.at));
      add(m, "LED bulb");
    }
  }
  return g;
}

/** A folded face's matrix at fold `a` (0..1), between its two nearest frames. */
function frameAt(frames: number[][], a: number): number[] {
  const n = frames.length - 1, x = Math.min(1, Math.max(0, a)) * n, i = Math.min(n - 1, Math.floor(x)), f = x - i;
  if (n < 1) return frames[0];
  return frames[i].map((v, k) => v + (frames[i + 1][k] - v) * f);
}

/** A plan matrix (x right, y toward the viewer, z up) on a wrap in the scene's axes (x, -y, z), moved by `d`. */
function placeWrap(wrap: THREE.Object3D, m: number[], d: [number, number, number] = [0, 0, 0]) {
  wrap.matrix.set(m[0], -m[1], m[2], m[3] + d[0], -m[4], m[5], -m[6], -(m[7] + d[1]), m[8], -m[9], m[10], m[11] + d[2], 0, 0, 0, 1);
  wrap.matrixAutoUpdate = false;
  wrap.matrixWorldNeedsUpdate = true;
}

const VALLEY = new THREE.LineBasicMaterial({ color: "#2a1d12", transparent: true, opacity: 0.85 });
const MOUNTAIN = new THREE.LineBasicMaterial({ color: "#6b3fd6", transparent: true, opacity: 0.95 });
VALLEY.userData.shared = MOUNTAIN.userData.shared = true;

/** Creases on a folded face, on both sides of the board. */
function creaseLines(cs: { pts: Contour; mountain: boolean }[], t: number, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  for (const mountain of [false, true]) {
    const pos: number[] = [];
    for (const { pts, mountain: m } of cs) if (m === mountain) for (let i = 0; i + 1 < pts.length; i++) for (const z of [t + 0.06, -0.06]) pos.push(pts[i][0], -pts[i][1], z, pts[i + 1][0], -pts[i + 1][1], z);
    if (!pos.length) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, mountain ? MOUNTAIN : VALLEY);
    lines.name = `${name} ${mountain ? "mountain" : "valley"}`;
    lines.userData.keepMaterial = true;
    lines.userData.noMeasure = true;
    lines.raycast = () => {};
    g.add(lines);
  }
  return g;
}

/** Scored outlines as lines at height z (y-down contours). */
function scoreLines(cs: Contour[], z: number, name: string): THREE.LineSegments {
  const pos: number[] = [];
  for (const c of cs) for (let i = 0; i + 1 < c.length; i++) pos.push(c[i][0], -c[i][1], z, c[i + 1][0], -c[i + 1][1], z);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#2a1d12", transparent: true, opacity: 0.9 }));
  lines.name = name;
  lines.userData.keepMaterial = true;
  lines.raycast = () => {};
  return lines;
}

/** A picture on a part's top face at height z: its clip outline (or its box) textured with it, shown once it has loaded. */
function pictureSkin(im: GenImage, z: number, name: string, loads: Promise<void>[]): THREE.Mesh | null {
  if (typeof Image === "undefined") return null;
  const c = im.clip ?? [[im.x, im.y], [im.x + im.w, im.y], [im.x + im.w, im.y + im.h], [im.x, im.y + im.h]];
  if (c.length < 3) return null;
  const geo = new THREE.ShapeGeometry(new THREE.Shape(c.map(([x, y]) => new THREE.Vector2(x, -y))), 1);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) - im.x) / im.w;
    uv.setXY(i, im.flip ? 1 - u : u, 1 - (-pos.getY(i) - im.y) / im.h);
  }
  geo.translate(0, 0, z);
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 }));
  mesh.name = name;
  mesh.visible = false;
  mesh.userData.keepMaterial = true;
  mesh.userData.noMeasure = true;
  mesh.userData.noPick = true;
  loads.push(new Promise<void>((done) => {
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; mesh.visible = true; done(); };
    img.onerror = () => done();
    img.src = im.href;
  }));
  return mesh;
}

/**
 * With `lay` (the cut layout) and no folding parts, the design opens out in place: `explode(e)`
 * takes every part from where it sits assembled, one after another on a soft arc, to its place on
 * the sheet, lying flat (turned as the nesting turned it). Parts drawn as several pieces in 3D (a
 * bent part) shrink away, and the flat part they are cut as grows in their place.
 */
export function generatorScene(out: GenOutput, T: number, explode = 0, fold = 1, lay?: Layout<CutPart>): Scene3D {
  const inner = new THREE.Group();
  const wraps: { p: Shown; wrap: THREE.Object3D; content: THREE.Object3D }[] = [];
  const loads: Promise<void>[] = [];
  // A part that bends is drawn as its flat pieces, each where it sits.
  const parts: Shown[] = out.parts.flatMap((p) => p.views3d?.length
    ? p.views3d.map((v, i) => ({ ...p, name: v.name ?? p.name, id: `${p.id}-${i}`, outer: v.outer, holes: v.holes, cuts: undefined, score: v.score, engrave: v.engrave, images: undefined, pieces: undefined, place: v.place, views3d: undefined, frames: v.frames, apart: v.apart, creases: v.creases, radialSurface: v.radialSurface }))
    : [p]);
  // Folding faces: placed from their frames, so the fold and explode move them in place.
  const folding: { wrap: THREE.Object3D; frames: number[][]; apart: [number, number, number] }[] = [];
  const moving: ((e: number) => void)[] = [];
  let at = { fold, explode };
  const place = () => {
    for (const move of moving) move(at.explode);
    for (const f of folding) placeWrap(f.wrap, frameAt(f.frames, at.fold), [f.apart[0] * at.explode, f.apart[1] * at.explode, f.apart[2] * at.explode]);
    inner.updateMatrixWorld(true);
  };
  const levels = [...new Set(parts.map((p) => p.place?.z ?? 0))].sort((a, b) => a - b);
  parts.forEach((p) => {
    const pl = p.place ?? { x: 0, y: 0, z: 0 };
    const t = p.t ?? T;
    const apart = p.apart ?? [0, 0, 30 * levels.indexOf(pl.z)];
    const z = pl.z + explode * apart[2];
    const wrap = new THREE.Group();
    wrap.name = p.name;
    wrap.userData.partId = p.id;
    if (p.frames?.length) folding.push({ wrap, frames: p.frames, apart: p.apart ?? [0, 0, 0] });
    else if (pl.m) {
      // A folded face: the plan matrix, between the scene's axes (x, -y, z) and the part's (u, -v, h).
      placeWrap(wrap, pl.m, [apart[0] * explode, apart[1] * explode, apart[2] * explode]);
    } else if (pl.upright && p.apart) wrap.position.set(pl.x + apart[0] * explode, -pl.z - apart[1] * explode, -pl.y + apart[2] * explode);
    else if (pl.upright) wrap.position.set(pl.x, -z, -pl.y);
    else wrap.position.set(pl.x + apart[0] * explode, -pl.y - apart[1] * explode, z);
    if (pl.yaw) wrap.rotation.z = -(pl.yaw * Math.PI) / 180;
    if (!p.frames?.length) {
      if (pl.m) moving.push(e => placeWrap(wrap, pl.m!, [apart[0] * e, apart[1] * e, apart[2] * e]));
      else {
        const delta = !pl.upright || p.apart ? new THREE.Vector3(apart[0], -apart[1], apart[2]) : new THREE.Vector3(0, -apart[2], 0);
        const origin = wrap.position.clone().addScaledVector(delta, -explode);
        moving.push(e => { wrap.position.copy(origin).addScaledVector(delta, e); });
      }
    }
    const stand = new THREE.Group();
    if (pl.upright) stand.rotation.x = ((pl.tilt ?? 90) * Math.PI) / 180;
    const spin = new THREE.Group();
    spin.rotation.z = -((pl.rot ?? 0) * Math.PI) / 180;
    const tint = p.tone ?? (/hand/i.test(p.name) ? 0.72 : levels.indexOf(pl.z) % 2 ? 1.06 : 0.94);
    if (p.pieces?.length) {
      // Pieces drift apart from the middle as the view explodes.
      let cx = 0, cy = 0, n = 0;
      for (const c of p.pieces) for (const [x, y] of c) { cx += x; cy += y; n++; }
      cx /= n || 1; cy /= n || 1;
      p.pieces.forEach((c, i) => {
        let px = 0, py = 0;
        for (const [x, y] of c) { px += x; py += y; }
        px /= c.length; py /= c.length;
        const m = slab(c, [], 0, t, `${p.name} piece ${i + 1}`);
        moving.push(e => { m.position.set((px - cx) * e * 0.12, -(py - cy) * e * 0.12, 0); });
        m.userData.tint = tint * (i % 2 ? 1.03 : 0.97);
        spin.add(m);
      });
    } else {
      // Holes can hold islands (QR cut-outs): each filled region is its own slab.
      const shapes = p.holes.length ? unionShapes([p.outer, ...p.holes], [], true) : [{ outer: p.outer, holes: [] }];
      shapes.forEach((s, i) => {
        const mesh = slab(s.outer, s.holes, 0, t, i ? `${p.name} piece ${i}` : p.name);
        mesh.userData.tint = tint;
        if (p.color) {
          // A contrasting material (gold mirror acrylic and the like) keeps its own colour in every look.
          (mesh.material as THREE.Material).dispose();
          mesh.material = p.matte
            ? new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.92, metalness: 0, side: THREE.DoubleSide })
            : new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.28, metalness: 0.55, side: THREE.DoubleSide });
          mesh.userData.keepMaterial = true;
        }
        spin.add(mesh);
      });
    }
    const surface = new THREE.Group();
    // Decorations stay attached to whole parts; puzzle-wide marks fade when pieces separate.
    if (p.pieces?.length) moving.push(e => { surface.visible = e === 0; });
    const engrave = byItem(p.engrave ?? []);
    for (const s of engrave.has(undefined) ? unionShapes(engrave.get(undefined)!, [], true) : []) {
      const e = slab(s.outer, s.holes, t, 0.2, `${p.name} engraving`);
      (e.material as THREE.Material).dispose();
      e.material = ENGRAVE;
      e.userData.keepMaterial = true;
      e.userData.noMeasure = true;
      surface.add(e);
    }
    // Each text, motif or number is a part of its own, so it can be picked and sized on its own.
    for (const [item, cs] of engrave) if (item) {
      const shapes = unionShapes(cs, [], true);
      if (shapes.length) surface.add(itemMesh(slabs(shapes, t, 0.2, itemSkinName(p.name, item)), ENGRAVE));
    }
    // Scored items: their outlines, over a faint fill that picks them.
    for (const [item, cs] of byItem(p.score ?? [])) if (item) {
      const shapes = unionShapes(cs, [], true);
      if (!shapes.length) continue;
      const fill = itemMesh(slabs(shapes, t, 0.05, itemSkinName(p.name, item)), SCORE_FILL);
      fill.add(scoreLines(cs, t + 0.06, `${fill.name} lines`));
      surface.add(fill);
    }
    for (const im of p.images ?? []) {
      const item = itemOf(im);
      const m = pictureSkin(im, item ? t + 0.02 : t, item ? `${p.name}${ITEM_SEP}${item}` : `${p.name} picture`, loads);
      if (m && item) delete m.userData.noPick;
      if (m) surface.add(m);
    }
    if (p.creases?.length) spin.add(creaseLines(p.creases, t, `${p.name} creases`));
    spin.add(surface);
    if(p.radialSurface)applyRadialSurface(spin,p.radialSurface);
    stand.add(spin);
    wrap.add(stand);
    inner.add(wrap);
    wraps.push({ p, wrap, content: stand });
  });
  // Non-folding assemblies also need their purchased fittings. Previously the early return
  // below discarded them as soon as an assembly used rigid pieces instead of fold frames.
  const hardware = out.hardware?.length ? hardwareGroup(out.hardware) : null;
  if (hardware) inner.add(hardware);
  const showHardware = () => { if (hardware) hardware.visible = at.fold > 0.999 && at.explode < 0.001; };
  showHardware();
  if (!folding.length && lay) {
    // The layout transition starts from an assembled model, independent of the initial slider.
    at.explode = 0; place();
    const run = unfoldParts(inner, wraps, lay, T);
    run(0);
    const scene = finishScene(inner);
    run(explode);
    return { ...scene, explode: (e: number) => { at.explode = e; showHardware(); run(Math.min(1, Math.max(0, e))); }, ...(loads.length ? { ready: Promise.all(loads) } : {}) };
  }
  // Framed and centred on the folded box, so folding and exploding keep the box in its place.
  at = { fold: 1, explode: 0 };
  place();
  showHardware();
  const scene = finishScene(inner);
  at = { fold, explode };
  place();
  showHardware();
  const hooks = {
    ...(folding.length ? { fold: (a: number) => { at = { ...at, fold: a }; place(); showHardware(); } } : {}),
    explode: (e: number) => { at = { ...at, explode: Math.min(1, Math.max(0, e)) }; place(); showHardware(); },
  };
  return { ...scene, ...hooks, ...(loads.length ? { ready: Promise.all(loads) } : {}) };
}

const easeIO = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const segE = (e: number, a: number, b: number) => easeIO(Math.min(1, Math.max(0, (e - a) / Math.max(1e-6, b - a))));

/** The opening-out moves for generatorScene: each wrapped part travels from its assembled matrix to its place on the sheet. */
function unfoldParts(inner: THREE.Group, wraps: { p: Shown; wrap: THREE.Object3D; content: THREE.Object3D }[], lay: Layout<CutPart>, T: number) {
  const cx = lay.width / 2, cy = lay.height / 2;
  const used = new Set<number>();
  inner.updateMatrixWorld(true);
  const middle = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
  const moves: ((e: number) => void)[] = [];
  // the top layers leave first, so a stack comes apart from the top down
  const order = wraps.map((w, i) => ({ w, i, z: w.p.place?.z ?? 0 })).sort((a, b) => b.z - a.z || a.i - b.i);
  const n = Math.max(1, order.length - 1);
  order.forEach(({ w }, rank) => {
    // A wrap placed by a plan matrix keeps it; the others are placed by position and rotation.
    if (w.wrap.matrixAutoUpdate) w.wrap.updateMatrix();
    w.content.updateMatrix();
    const local = w.content.matrix.clone();
    const spin = w.content.children[0];
    if (spin) { spin.updateMatrix(); local.multiply(spin.matrix); }
    const startM = w.wrap.matrix.clone().multiply(local);
    const sp = new THREE.Vector3(), sq = new THREE.Quaternion(), ss = new THREE.Vector3();
    startM.decompose(sp, sq, ss);
    // A part standing on edge (a box's wall) first falls outwards about its foot, away from the middle.
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(sq);
    let fall: ((k: number) => THREE.Matrix4) | null = null;
    if (Math.abs(normal.z) < 0.5) {
      const bb = new THREE.Box3().setFromObject(w.wrap), c = bb.getCenter(new THREE.Vector3());
      const d = new THREE.Vector3(c.x - middle.x, c.y - middle.y, 0);
      if (d.lengthSq() < 1e-6) d.set(normal.x, normal.y, 0);
      if (d.dot(new THREE.Vector3(normal.x, normal.y, 0)) < 0 && d.lengthSq() < 1) d.negate();
      d.normalize();
      const axis = new THREE.Vector3(0, 0, 1).cross(d).normalize(), pivot = new THREE.Vector3(c.x, c.y, bb.min.z);
      fall = (k) => new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
        .multiply(new THREE.Matrix4().makeRotationAxis(axis, (Math.PI / 2) * k))
        .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z)).multiply(startM);
      fall(1).decompose(sp, sq, ss);
    }
    const idx = lay.items.findIndex((it, j) => !used.has(j) && it.pt.src.id === w.p.id);
    const t0 = fall ? 0.36 : 0.08, span = fall ? 0.3 : 0.5;
    const win: [number, number] = [t0 + (span * rank) / n, Math.min(1, t0 + (span * rank) / n + 0.34)];
    const inv = local.clone().invert();
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion();
    w.wrap.matrixAutoUpdate = false;
    if (idx < 0) {
      // drawn as pieces in 3D: shrink away as the others travel
      moves.push((e) => {
        const k = segE(e, win[0], win[1]);
        m.compose(sp, sq, ss.clone().multiplyScalar(Math.max(1e-3, 1 - k)));
        w.wrap.matrix.copy(m.multiply(inv));
        w.wrap.visible = k < 0.999;
        w.wrap.matrixWorldNeedsUpdate = true;
      });
      return;
    }
    used.add(idx);
    const it = lay.items[idx];
    const tp = new THREE.Vector3(it.ox - cx, -(it.oy - cy), 0);
    const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -((it.pt.turned ?? 0) * Math.PI) / 180);
    const lift = Math.min(80, 15 + sp.distanceTo(tp) * 0.2);
    moves.push((e) => {
      const k = segE(e, win[0], win[1]);
      if (fall && k === 0) {
        w.wrap.matrix.copy(fall(segE(e, 0.04, 0.36)).multiply(inv));
        w.wrap.matrixWorldNeedsUpdate = true;
        return;
      }
      pos.copy(sp).lerp(tp, k);
      // first up and clear of the others, then over and down
      pos.z += Math.sin(Math.PI * k) * lift;
      q.copy(sq).slerp(tq, k);
      m.compose(pos, q, ss);
      w.wrap.matrix.copy(m.multiply(inv));
      w.wrap.matrixWorldNeedsUpdate = true;
    });
  });
  // cut parts no 3D part stands for (a bent part's flat strip) grow in place as the others land
  lay.items.forEach((it, j) => {
    if (used.has(j)) return;
    const regions = unionShapes([...it.pt.outline, ...it.pt.inner], [], true);
    if (!regions.length) return;
    const mesh = slabs(regions, 0, it.pt.src.t ?? T, it.pt.name);
    mesh.matrixAutoUpdate = false;
    inner.add(mesh);
    const at = new THREE.Vector3(it.ox - cx, -(it.oy - cy), 0);
    moves.push((e) => {
      const k = segE(e, 0.8, 1);
      mesh.visible = k > 0.001;
      mesh.matrix.compose(at, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1).multiplyScalar(Math.max(1e-3, k)));
      mesh.matrixWorldNeedsUpdate = true;
    });
  });
  return (e: number) => { for (const mv of moves) mv(e); inner.updateMatrixWorld(true); };
}
