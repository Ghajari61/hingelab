/**
 * The Hinge Box opening out in 3D, in place: `explode(e)` runs one choreography from the assembled
 * box (0) to every cut part lying flat where the sheet layout puts it (1).
 *
 *   0.00–0.30  a cabinet tips onto its back; a flip lid swings open on its hinge, a lift-off or cap
 *              lid rises with a little tilt; drawers slide out
 *   0.22–0.55  the walls fold down outwards, each side towards its own side, like petals
 *   0.50–1.00  the parts travel, one after another on a soft arc, to their places on the sheet;
 *              a flip lid closes flat as it goes, the walls unroll into their straight strips
 *
 * Every part is built once in its own flat coordinates and only its matrix (or, for the bending
 * walls, its vertices) moves, so scrubbing and the play button cost no rebuilding.
 */
import * as THREE from "three";
import type { Edge, LayerContent, Layout, Model, Params, PlatePart, Point, WallPart } from "@/lib/hinge";
import { buildCore } from "@/lib/hinge/core";
import { clipHalf } from "@/lib/hinge/flip";
import { builtParams } from "@/lib/hinge/model";
import { honeyLattice } from "@/lib/hinge/hinge";
import { cutOverlay, finishScene, slab, type Scene3D } from "@/lib/three/flat";
import { isOpening, outline, slitLines, windowSlab } from "./scene";
import { modelBox } from "@/lib/three/dims";

type Actor = (e: number) => void;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
/** Progress through the window [a, b], eased. */
const seg = (e: number, a: number, b: number) => smooth(clamp01((e - a) / Math.max(1e-6, b - a)));
const dotA = (q: Point, a: Point) => q[0] * a[0] + q[1] * a[1];

/** One point of a wall strip: the core point it is offset from, the outward normal, and its place along the strip. */
interface StripPt { c: Point; n: Point; s: number; arc: boolean }

/**
 * The wall's centre line as an open strip, in the order the wall is cut (from the middle of the
 * first flat side round to it again), with each point's distance along the strip scaled to `L`.
 * `cutAt` adds a point at the middle of that side, where a wall in two halves is split.
 */
function stripPoints(edges: Edge[], rN: number, L: number, cutAt: number | null, perArc = 10): StripPt[] {
  const out: StripPt[] = [];
  const add = (c: Point, n: Point, arc = false) => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.c[0] - c[0], last.c[1] - c[1]) < 1e-9 && Math.hypot(last.n[0] - n[0], last.n[1] - n[1]) < 1e-9) return;
    out.push({ c, n, s: 0, arc });
  };
  const mid = (e: Edge): Point => [(e.p0[0] + e.p1[0]) / 2, (e.p0[1] + e.p1[1]) / 2];
  const N = edges.length;
  add(mid(edges[0]), edges[0].n);
  add(edges[0].p1, edges[0].n);
  for (let i = 0; i < N; i++) {
    const e = edges[i], a1 = Math.atan2(e.n[1], e.n[0]), m = Math.max(2, Math.round((perArc * e.sweep) / (Math.PI / 2)));
    for (let k = 1; k < m; k++) { const a = a1 + (e.sweep * k) / m; add(e.p1, [Math.cos(a), Math.sin(a)], true); }
    const nx = edges[(i + 1) % N];
    add(nx.p0, nx.n);
    if (i + 1 < N) {
      if (cutAt === i + 1) add(mid(nx), nx.n);
      add(nx.p1, nx.n);
    }
  }
  add(mid(edges[0]), edges[0].n);
  // distances along the centre line
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    if (i) {
      const a = out[i - 1], b = out[i];
      s += Math.hypot(b.c[0] + b.n[0] * rN - (a.c[0] + a.n[0] * rN), b.c[1] + b.n[1] * rN - (a.c[1] + a.n[1] * rN));
    }
    out[i].s = s;
  }
  const k = s > 0 ? L / s : 1;
  for (const q of out) q.s *= k;
  return out;
}

interface BandSpec {
  edges: Edge[];
  R: number;
  t: number;
  /** Wall height and the height of its base edge; `down` when the wall hangs from its base (a cap). */
  h: number;
  zBase: number;
  down?: boolean;
  /** Fold outwards like petals in this window before travelling (the box's own walls). */
  petal?: [number, number];
  /** Where the band sits as e runs (a cap lifting, a drawer sliding out), applied to its own coordinates. */
  place?: (e: number) => THREE.Matrix4;
  /** Lift added while it waits to travel. */
  lift?: (e: number) => number;
  win: [number, number];
}

/**
 * A bending wall as a mesh whose vertices move: assembled round its core, folded down outwards, and
 * flat as the cut strip at `flat(s, h)` (sheet → scene coordinates).
 */
function bandActor(spec: BandSpec, pts: StripPt[], flat: (s: number, h: number, top: boolean) => THREE.Vector3, name: string): { mesh: THREE.Mesh; act: Actor } {
  const { R, t, h, zBase } = spec;
  const n = pts.length;
  const pos = new Float32Array(n * 4 * 3), col: number[] = [], tri: number[] = [];
  for (let j = 0; j < n; j++) { const k = pts[j].arc ? 0.8 : 1; for (let v = 0; v < 4; v++) col.push(k, k, k); }
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  // vertex 4j+0 outer foot, +1 outer top, +2 inner foot, +3 inner top
  for (let j = 0; j + 1 < n; j++) {
    const a = 4 * j, b = 4 * (j + 1);
    quad(a, b, b + 1, a + 1);
    quad(a + 2, a + 3, b + 3, b + 2);
    quad(a + 1, b + 1, b + 3, a + 3);
    quad(a, a + 2, b + 2, b);
  }
  // the strip's two ends
  const endA = 0, endB = 4 * (n - 1);
  quad(endA, endA + 1, endA + 3, endA + 2);
  quad(endB, endB + 2, endB + 3, endB + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(tri);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }));
  mesh.name = name;
  mesh.userData.vertexBase = "#ffffff";
  mesh.castShadow = true;
  const flats = pts.map((q) => [flat(q.s, 0, false), flat(q.s, h, false), flat(q.s, 0, true), flat(q.s, h, true)]);
  const v = new THREE.Vector3(), f = new THREE.Vector3();
  const act: Actor = (e) => {
    const kB = spec.petal ? seg(e, spec.petal[0], spec.petal[1]) : 0, th = (kB * Math.PI) / 2, cs = Math.cos(th), sn = Math.sin(th);
    const kC = seg(e, spec.win[0], spec.win[1]), arc = Math.sin(Math.PI * kC) * 28;
    const M = spec.place?.(e), lift = spec.lift?.(e) ?? 0, dir = spec.down ? -1 : 1;
    for (let j = 0; j < n; j++) {
      const { c, n: nn } = pts[j];
      for (let w = 0; w < 4; w++) {
        const ro = w < 2 ? 0 : -t, hh = w % 2 ? h : 0;
        // folded about the outer foot by th: the wall's height swings out along its normal
        const rad = ro * cs + hh * sn, up = -ro * sn + hh * cs;
        v.set(c[0] + nn[0] * (R + rad), -(c[1] + nn[1] * (R + rad)), zBase + dir * up + lift);
        if (M) v.applyMatrix4(M);
        f.copy(flats[j][w]);
        v.lerp(f, kC);
        v.z += arc;
        pos.set([v.x, v.y, v.z], (4 * j + w) * 3);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
  };
  return { mesh, act };
}

/** A rigid part: built flat in its own coordinates, moved from where it sits assembled to its place on the sheet. */
function rigidActor(obj: THREE.Object3D, from: (e: number) => { pos: THREE.Vector3; quat: THREE.Quaternion }, to: THREE.Vector3, win: [number, number], grow = false): Actor {
  const holder = obj;
  holder.matrixAutoUpdate = false;
  const pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), flatQ = new THREE.Quaternion(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return (e) => {
    const k = seg(e, win[0], win[1]), a = from(e);
    pos.copy(a.pos).lerp(to, k);
    pos.z += Math.sin(Math.PI * k) * Math.min(60, 12 + a.pos.distanceTo(to) * 0.18);
    q.copy(a.quat).slerp(flatQ, k);
    // A part that only exists flat (the bend test strip) grows in place as the others land.
    sc.copy(one).multiplyScalar(grow ? Math.max(1e-3, seg(e, 0.85, 1)) : 1);
    holder.matrix.compose(pos, q, sc);
    holder.matrixWorldNeedsUpdate = true;
    if (grow) { const show = e > 0.85; holder.visible = show; for (const c of holder.children) c.visible = show; }
  };
}

const Q0 = new THREE.Quaternion();
const at = (x: number, y: number, z: number, quat: THREE.Quaternion = Q0) => ({ pos: new THREE.Vector3(x, y, z), quat });

/**
 * The opening-out scene for `model` laid out as `lay`. Explode 0 is the assembled box (as
 * buildHingeScene draws it), 1 the parts lying flat as on the sheet, centred under the box.
 */
export function hingeUnfoldScene(model: Model, user: Params, lay: Layout, content?: LayerContent | null): Scene3D {
  const p = builtParams(user);
  const t = p.T, edges = model.core.edges, R = model.R, hBody = model.hBody, H = p.H;
  const inner = new THREE.Group();
  const stand = new THREE.Group();
  inner.add(stand);
  const actors: Actor[] = [];
  /** Objects that exist only opened out (drawn after the scene is framed on the closed box). */
  const late: THREE.Object3D[] = [];
  const cx = lay.width / 2, cy = lay.height / 2;
  const item = (name: string) => lay.items.find((it) => it.pt.name === name);
  const flatAt = (name: string): THREE.Vector3 | null => { const it = item(name); return it ? new THREE.Vector3(it.ox - cx, -(it.oy - cy), 0) : null; };
  const plateOf = (name: string) => model.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === name);

  // Travel windows: lid pieces first, then the walls, the inside, the base last.
  const order = ["LID", "LID STEP", "WINDOW", "LID LIP", "CAP", "WALL", "DIVIDER", "DRAWER", "BASE RING", "BASE", "BEND TEST"];
  const rank = (name: string) => { const i = order.findIndex((o) => name.startsWith(o) || name.includes(` ${o}`)); return i < 0 ? order.length : i; };
  const travelers = [...lay.items].sort((a, b) => rank(a.pt.name) - rank(b.pt.name)).map((it) => it.pt.name);
  const win = (name: string): [number, number] => {
    const i = Math.max(0, travelers.indexOf(name)), n = Math.max(1, travelers.length - 1);
    const a = 0.5 + (0.18 * i) / n;
    return [a, Math.min(1, a + 0.32)];
  };

  const top = t + hBody;
  // A cabinet opens its door (or slides its drawers out) standing, then tips onto its back.
  const upright = !!p.upright || !!model.drawerPlaces?.length;
  const OPEN: [number, number] = [0, 0.28], TIP: [number, number] = [0.2, 0.38];
  const FOLD: [number, number] = upright ? [0.32, 0.6] : [0.22, 0.55];
  const opened = (e: number) => seg(e, OPEN[0], OPEN[1]);
  const lidRise = (e: number) => (H * 0.45 + 25) * opened(e);
  const lidTilt = (e: number) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.22 * opened(e) * (1 - seg(e, 0.5, 0.75)));
  const lifts = p.lid === "removable" || p.lid === "fixed" || p.lid === "cap";

  /** A plate part built flat, moved by `from`. */
  const plateActor = (pt: PlatePart, from: (e: number) => { pos: THREE.Vector3; quat: THREE.Quaternion }, tint: number, holes: Point[][] = pt.slots) => {
    const to = flatAt(pt.name);
    if (!to) return;
    const holder = new THREE.Group();
    const m = pt.clear ? windowSlab(pt.pts ?? outline(pt.edges, pt.r), 0, t * 0.6) : slab(pt.pts ?? outline(pt.edges, pt.r), holes, 0, t, pt.name.toLowerCase());
    m.userData.tint = tint;
    holder.add(m);
    stand.add(holder);
    actors.push(rigidActor(holder, from, to, win(pt.name)));
  };
  /** A wall (or cap or drawer wall) as one or two bending strips. */
  const wallActors = (prefix: string, spec: Omit<BandSpec, "win">, L: number) => {
    const parts = model.parts.filter((q): q is WallPart => q.kind === "wall" && !q.test && !q.divider && (q.name === `${prefix}` || q.name === `${prefix} A` || q.name === `${prefix} B`));
    if (!parts.length) return;
    const split = parts.length > 1;
    const N = spec.edges.length, cut = split ? Math.floor(N / 2) : null;
    const pts = stripPoints(spec.edges, spec.R - t / 2, L, cut);
    let xs = L;
    if (split) { const i = pts.findIndex((q, j) => j > 0 && j < pts.length - 1 && q.c[0] === (spec.edges[cut!].p0[0] + spec.edges[cut!].p1[0]) / 2 && q.c[1] === (spec.edges[cut!].p0[1] + spec.edges[cut!].p1[1]) / 2); xs = i > 0 ? pts[i].s : L / 2; }
    const pieces: [string, StripPt[], number][] = split
      ? [[`${prefix} A`, pts.filter((q) => q.s <= xs + 1e-9), 0], [`${prefix} B`, pts.filter((q) => q.s >= xs - 1e-9), xs]]
      : [[prefix, pts, 0]];
    for (const [name, list, s0] of pieces) {
      const it = item(name);
      if (!it || list.length < 2) continue;
      const flat = (s: number, h: number, upper: boolean) => new THREE.Vector3(it.ox + (s - s0) - cx, -(it.oy + (spec.h - h) - cy), upper ? t : 0);
      const b = bandActor({ ...spec, win: win(name) }, list, flat, name.toLowerCase());
      stand.add(b.mesh);
      actors.push(b.act);
    }
  };

  // ---- the box's own walls fold down, then unroll
  wallActors("WALL", { edges, R, t, h: hBody, zBase: t, petal: FOLD }, model.L);
  const slits = slitLines(edges, R + 0.15, t, hBody, p.pitch, honeyLattice(p).bridge);
  stand.add(slits);
  actors.push((e) => { slits.visible = e < 0.01; });

  // ---- base, ring and dividers
  const base = plateOf("BASE");
  if (base) plateActor(base, () => at(0, 0, 0), 0.93, base.slots.filter((h) => isOpening(h, p)));
  const ring = plateOf("BASE RING");
  if (ring) plateActor(ring, () => at(0, 0, t), 0.78);
  for (const d of model.dividers ?? []) {
    const pt = model.parts.find((q): q is WallPart => q.kind === "wall" && q.name === d.name), to = flatAt(d.name);
    if (!pt || !to) continue;
    const holder = new THREE.Group(), m = slab(pt.outline, [], 0, t, d.name.toLowerCase());
    m.userData.tint = 0.9;
    holder.add(m);
    stand.add(holder);
    // The strip stands on edge: along it the line it stands on, down it the height, through it the thickness.
    const basis = d.axis === "x"
      ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0))
      : new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);
    const start = d.axis === "x" ? new THREE.Vector3(d.at + t / 2, -d.from, t + d.h) : new THREE.Vector3(d.from, -d.at + t / 2, t + d.h);
    actors.push(rigidActor(holder, (e) => ({ pos: start.clone().setZ(start.z + 6 * seg(e, FOLD[0], FOLD[1])), quat }), to, win(d.name)));
  }

  // ---- lids
  const lid = plateOf("LID");
  if (lid && (p.lid === "fixed" || p.lid === "removable")) {
    plateActor(lid, (e) => at(0, 0, top + lidRise(e), lidTilt(e)), 1.04, lid.slots.slice(p.lid === "fixed" ? edges.reduce((s, e) => s + e.tabs.length, 0) : 0));
    const lip = plateOf("LID LIP");
    if (lip) plateActor(lip, (e) => at(0, 0, top - t + lidRise(e), lidTilt(e)), 0.86);
  }
  if (lid && p.lid === "flip" && model.flip) {
    const f = model.flip, a = f.a, to = flatAt("LID");
    if (to) {
      const out = lid.pts ?? outline(lid.edges, lid.r);
      const holes = lid.slots.filter((h) => !h.every((q) => dotA(q, a) >= f.to));
      const holder = new THREE.Group();
      const rest = slab(clipHalf(out, [-a[0], -a[1]], -f.from), [], 0, t, "lid");
      rest.userData.tint = 1.04;
      const strip = slab(clipHalf(clipHalf(out, [-a[0], -a[1]], -f.from), a, f.to), [], 0.02, t, "lid hinge");
      strip.userData.tint = 0.82;
      const flap = slab(clipHalf(out, a, f.from), holes.filter((h) => h.every((q) => dotA(q, a) <= f.from)), 0, t, "lid flap");
      flap.userData.tint = 1.04;
      const pivot = new THREE.Vector3(a[0] * f.from, -(a[1] * f.from), t);
      const axis = new THREE.Vector3(-a[1], -a[0], 0).normalize();
      // the side the flap must turn to rise
      const probe = new THREE.Vector3(-a[0] * 10, a[1] * 10, 0).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(axis, 0.5));
      const sign = probe.z >= 0 ? 1 : -1;
      const hinge = new THREE.Group();
      hinge.position.copy(pivot);
      flap.position.set(-pivot.x, -pivot.y, -pivot.z);
      hinge.add(flap);
      const win0 = plateOf("WINDOW");
      const under = win0 ? windowSlab(win0.pts ?? outline(win0.edges, win0.r), 0, 0.6 * t) : null;
      if (under) { under.position.set(-pivot.x, -pivot.y, -0.7 * t - pivot.z); hinge.add(under); }
      holder.add(rest, strip, hinge);
      stand.add(holder);
      const w = win("LID"), amax = (Math.min(100, f.angle) * Math.PI) / 180;
      actors.push(rigidActor(holder, () => at(0, 0, top), to, w));
      actors.push((e) => {
        hinge.quaternion.setFromAxisAngle(axis, sign * amax * (opened(e) - seg(e, w[0], w[0] + (w[1] - w[0]) * 0.6)));
        // the window glued under the flap is a part of its own on the sheet: it leaves the flap as the lid travels
        if (under) under.visible = e <= w[0];
      });
    }
  }
  if (p.lid === "cap" && model.cap) {
    const c = model.cap, cz = top;
    const capTop = plateOf("CAP TOP");
    if (capTop) plateActor(capTop, (e) => at(0, 0, cz + lidRise(e), lidTilt(e)), 1.04, capTop.slots.slice(c.edges.reduce((s, e) => s + e.tabs.length, 0)));
    const capWall = model.parts.find((q): q is WallPart => q.kind === "wall" && q.name.startsWith("CAP WALL"));
    const L = capWall ? model.parts.filter((q): q is WallPart => q.kind === "wall" && q.name.startsWith("CAP WALL")).reduce((s, q) => s + q.w, 0) : 0;
    wallActors("CAP WALL", { edges: c.edges, R: c.R, t, h: c.hBody, zBase: cz, down: true, lift: lidRise }, L);
  }
  // steps on a lid or a cap, and a window under an open top (a flip lid's turns with its flap)
  const stepBase = top + t;
  for (const st of model.parts) {
    if (st.kind !== "plate" || !/ STEP \d$/.test(st.name)) continue;
    const i = Number(st.name.slice(-1));
    plateActor(st, (e) => at(0, 0, stepBase + (i - 1) * t + (lifts ? lidRise(e) : 0), lidTilt(e)), 1.06);
  }
  const win1 = plateOf("WINDOW");
  if (win1 && p.lid !== "flip") plateActor(win1, (e) => at(0, 0, top - 0.8 * t + (lifts ? lidRise(e) : 0), lidTilt(e)), 1);
  else if (win1 && p.lid === "flip") {
    // drawn on the flap above; on the sheet it is a part of its own
    const to = flatAt("WINDOW");
    if (to) {
      const holder = new THREE.Group();
      holder.add(windowSlab(win1.pts ?? outline(win1.edges, win1.r), 0, 0.6 * t));
      late.push(holder);
      const lw = win("LID");
      actors.push(rigidActor(holder, () => at(to.x, to.y, 0), to, [0.95, 1]));
      actors.push((e) => { const show = e > lw[0]; holder.visible = show; for (const c of holder.children) c.visible = show; });
    }
  }

  // ---- drawers slide out, then come apart
  for (const d of model.drawerPlaces ?? []) {
    const pull = (e: number) => d.d * 0.7 * opened(e) * (1 - seg(e, TIP[0], TIP[1]) * 0.4);
    const place = (e: number) => new THREE.Matrix4().compose(new THREE.Vector3(0, -(d.cy + d.h / 2), t + 1 + d.d / 2 + pull(e)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(1, 1, 1));
    const dc = buildCore({ ...p, shape: "rect", W: d.w, D: d.d, R: d.r });
    if ("error" in dc) continue;
    const L = model.parts.filter((q): q is WallPart => q.kind === "wall" && q.name.startsWith(`${d.name} WALL`)).reduce((s, q) => s + q.w, 0);
    wallActors(`${d.name} WALL`, { edges: dc.edges, R: d.r, t, h: d.h - t, zBase: t, place }, L);
    const db = plateOf(`${d.name} BASE`);
    if (db) plateActor(db, (e) => { const m = place(e), pos = new THREE.Vector3(), quat = new THREE.Quaternion(); m.decompose(pos, quat, new THREE.Vector3()); return { pos, quat }; }, 0.9);
    const fr = plateOf(`${d.name} FRONT`);
    if (fr) plateActor(fr, (e) => at(0, -d.cy, top + pull(e) + 0.5), 1.04);
  }

  // ---- the bend test strip only exists flat
  const test = model.parts.find((q): q is WallPart => q.kind === "wall" && !!q.test), tt = test && flatAt(test.name);
  if (test && tt) {
    const holder = new THREE.Group();
    holder.add(slab(test.outline, [], 0, t, "bend test"));
    late.push(holder);
    actors.push(rigidActor(holder, () => at(tt.x, tt.y, 0), tt, [0.85, 1], true));
  }

  // ---- once everything has landed, the hinge cuts are drawn on the strips, as in Lay flat
  const cuts = content ? cutOverlay(content.hinge, lay.width, lay.height, t + 0.05) : null;
  if (cuts) {
    cuts.position.set(0, 0, t + 0.05);
    late.push(cuts);
    const mat = cuts.material as THREE.MeshBasicMaterial;
    actors.push((e) => { const a = seg(e, 0.9, 1); cuts.visible = a > 0.01; mat.opacity = a; });
  }

  // ---- a cabinet or a chest of drawers stands up, and tips onto its back first
  let y0 = 0;
  const run = (e: number) => {
    for (const a of actors) a(e);
    if (upright) {
      const th = (Math.PI / 2) * (1 - seg(e, TIP[0], TIP[1]));
      stand.rotation.x = th;
      // turned about its back edge, so it stays on the floor while it tips
      stand.position.z = y0 * (1 - Math.sin(th));
    }
    inner.updateMatrixWorld(true);
  };
  run(0);
  if (upright) {
    stand.rotation.x = 0;
    stand.position.z = 0;
    inner.updateMatrixWorld(true);
    y0 = modelBox(stand).min.y;
    run(0);
  }
  const scene = finishScene(inner);
  stand.add(...late);
  run(0);
  return { ...scene, explode: (e: number) => run(clamp01(e)) };
}
