/**
 * The 3D workspace, laid out like a 3D modelling program: Top, Front and Left orthographic views
 * and a Perspective view, or one of them maximized. One WebGL canvas draws every view; each view
 * has its own camera and mouse controls. Renders only when something changes.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Home } from "lucide-react";
import type { D3Model } from "../../../lib/desktop/types";
import { applyLook, lookOf } from "../../../lib/three/looks";
import { dimLines, dimSVG, modelBox } from "../../../lib/three/dims";
import type { Shade3D as Shade, Units } from "../local";
import { buildModel, type Model3D } from "../scene3d";
import type { CanvasHandle } from "./Canvas";

export type PaneId = "top" | "front" | "left" | "persp";

interface PaneDef { id: PaneId; label: string; key: string; dir: [number, number, number]; up: [number, number, number]; ortho: boolean; layer: number }

/** In the 3D programs' order: Top, Front, Left, Perspective. Each view sees its own grid layer. */
export const PANES: PaneDef[] = [
  { id: "top", label: "Top", key: "t", dir: [0, 1, 0], up: [0, 0, -1], ortho: true, layer: 1 },
  { id: "front", label: "Front", key: "f", dir: [0, 0, 1], up: [0, 1, 0], ortho: true, layer: 2 },
  { id: "left", label: "Left", key: "l", dir: [-1, 0, 0], up: [0, 1, 0], ortho: true, layer: 3 },
  { id: "persp", label: "Perspective", key: "p", dir: [0.95, 0.85, 1.35], up: [0, 1, 0], ortho: false, layer: 1 },
];

export const SHADE_NAMES: Record<Shade, string> = { shaded: "Shaded", wire: "Wireframe", edges: "Edged faces" };

const FACES: { name: string; dir: [number, number, number] | null; pos: [number, number, number]; rot: [number, number, number] }[] = [
  { name: "Front", dir: [0, 0.0008, 1], pos: [0, 0, 1], rot: [0, 0, 0] },
  { name: "Back", dir: [0, 0.0008, -1], pos: [0, 0, -1], rot: [0, Math.PI, 0] },
  { name: "Right", dir: [1, 0.0008, 0], pos: [1, 0, 0], rot: [0, Math.PI / 2, 0] },
  { name: "Left", dir: [-1, 0.0008, 0], pos: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
  { name: "Top", dir: [0, 1, 0.0008], pos: [0, 1, 0], rot: [-Math.PI / 2, 0, 0] },
  { name: "Bottom", dir: [0, -1, 0.0008], pos: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
];
const CUBE = 46;
const DIM_ROOM = 56;

const eps = (v: number) => (Math.abs(v) < 1e-10 ? 0 : v);
/** CSS matrix for an object placed in three.js world space (the CSS3DRenderer convention). */
function objectCSS(m: THREE.Matrix4) {
  const e = m.elements;
  return `matrix3d(${[e[0], e[1], e[2], e[3], -e[4], -e[5], -e[6], -e[7], e[8], e[9], e[10], e[11], e[12], e[13], e[14], e[15]].map(eps).join(",")})`;
}
/** CSS matrix for the camera's rotation only. */
function cameraCSS(m: THREE.Matrix4) {
  const e = m.elements;
  return `matrix3d(${[e[0], -e[1], e[2], e[3], e[4], -e[5], e[6], e[7], e[8], -e[9], e[10], e[11], 0, 0, 0, 1].map(eps).join(",")})`;
}

interface Pane { def: PaneDef; el: HTMLDivElement; svg: SVGSVGElement | null; cam: THREE.PerspectiveCamera | THREE.OrthographicCamera; controls: OrbitControls; half: number }

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  grids: THREE.GridHelper[];
  panes: Pane[];
  request: () => void;
}

interface Props {
  model: D3Model | null;
  material: string;
  explode: number;
  shade: Shade;
  quad: boolean;
  active: PaneId;
  onActive: (p: PaneId) => void;
  onQuad: (quad: boolean) => void;
  onShade: (s: Shade) => void;
  /** Overall dimensions on every view (hidden while exploded). */
  dims: boolean;
  units: Units;
  dim?: boolean;
  children?: React.ReactNode;
}

const materials = (m: THREE.Mesh) => ([] as THREE.Material[]).concat(m.material);

function paintShade(model: Model3D, shade: Shade) {
  for (const mesh of model.meshes) {
    for (const mat of materials(mesh)) (mat as THREE.MeshStandardMaterial).wireframe = shade === "wire";
    let edges = mesh.getObjectByName("__edges") as THREE.LineSegments | undefined;
    if (shade === "edges" && !edges) {
      edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), new THREE.LineBasicMaterial({ color: 0x1d1d1d, transparent: true, opacity: 0.55 }));
      edges.name = "__edges";
      edges.userData.keepMaterial = true;
      edges.raycast = () => {};
      mesh.add(edges);
    }
    if (edges) edges.visible = shade === "edges";
  }
}

function glow(mesh: THREE.Mesh, on: boolean) {
  for (const mat of materials(mesh)) {
    const m = mat as THREE.MeshStandardMaterial;
    if (m.emissive) m.emissive.setHex(on ? 0x6b4300 : 0x000000);
  }
}

const View3D = forwardRef<CanvasHandle, Props>(function View3D(props, ref) {
  const { model, material, explode, shade, quad, active, onActive, onQuad, onShade, dims, units, dim, children } = props;
  const host = useRef<HTMLDivElement>(null);
  const paneEls = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({});
  const dimEls = useRef<Partial<Record<PaneId, SVGSVGElement | null>>>({});
  /** The assembled model's bounding box, for the dimensions. */
  const bbox = useRef<THREE.Box3 | null>(null);
  const showDims = useRef<Units | null>(null);
  showDims.current = dims && explode === 0 ? units : null;
  const cube = useRef<HTMLDivElement>(null);
  const st = useRef<Stage | null>(null);
  const shown = useRef<Model3D | null>(null);
  const framed = useRef("");
  const selected = useRef<THREE.Mesh | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [noGL, setNoGL] = useState(false);

  const persp = () => st.current?.panes.find((p) => p.def.id === "persp");
  const syncCube = () => {
    const p = persp(), c = cube.current;
    if (p && c) c.style.transform = cameraCSS(p.cam.matrixWorldInverse);
  };

  const frustum = (p: Pane) => {
    const w = p.el.clientWidth || 1, h = p.el.clientHeight || 1;
    if (p.cam instanceof THREE.PerspectiveCamera) p.cam.aspect = w / h;
    else Object.assign(p.cam, { left: (-p.half * w) / h, right: (p.half * w) / h, top: p.half, bottom: -p.half });
    p.cam.updateProjectionMatrix();
  };

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setNoGL(true);
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "v3-gl";
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.6;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.17 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    let frame = 0;
    const draw = () => {
      frame = 0;
      const hr = el.getBoundingClientRect();
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      renderer.shadowMap.needsUpdate = true;
      for (const p of panes) {
        const r = p.el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const x = r.left - hr.left, y = hr.height - (r.top - hr.top) - r.height;
        renderer.setViewport(x, y, r.width, r.height);
        renderer.setScissor(x, y, r.width, r.height);
        renderer.render(scene, p.cam);
        if (p.svg) p.svg.innerHTML = showDims.current && bbox.current ? dimSVG(dimLines(bbox.current, p.cam, r.width, r.height), showDims.current) : "";
      }
      syncCube();
    };
    const request = () => { if (!frame) frame = requestAnimationFrame(draw); };

    const panes: Pane[] = PANES.map((def) => {
      const pel = paneEls.current[def.id]!;
      const cam = def.ortho ? new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 20000) : new THREE.PerspectiveCamera(32, 1, 1, 20000);
      cam.up.set(...def.up);
      cam.position.set(...def.dir).multiplyScalar(400);
      cam.layers.enable(def.layer);
      const controls = new OrbitControls(cam, pel);
      controls.enableDamping = false;
      controls.screenSpacePanning = true;
      controls.zoomToCursor = true;
      if (def.ortho) {
        controls.enableRotate = false;
        controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
      } else {
        controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
      }
      controls.addEventListener("change", request);
      return { def, el: pel, svg: dimEls.current[def.id] ?? null, cam, controls, half: 100 };
    });

    const resize = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      for (const p of panes) frustum(p);
      request();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    for (const p of panes) ro.observe(p.el);
    st.current = { renderer, scene, sun, ground, grids: [], panes, request };
    resize();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frame);
      for (const p of panes) p.controls.dispose();
      if (shown.current) { scene.remove(shown.current.group); shown.current.dispose(); shown.current = null; }
      for (const g of st.current?.grids ?? []) g.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      st.current = null;
      framed.current = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bounds = () => {
    const g = shown.current?.group;
    const box = g ? new THREE.Box3().setFromObject(g) : new THREE.Box3();
    if (box.isEmpty()) box.set(new THREE.Vector3(-50, 0, -50), new THREE.Vector3(50, 50, 50));
    return { box, c: box.getCenter(new THREE.Vector3()), r: Math.max(10, box.getSize(new THREE.Vector3()).length() / 2) };
  };

  /** Zoom extents: frame the whole model, looking along `dir` (or the view's own direction). */
  const fitPane = (p: Pane, dir?: THREE.Vector3) => {
    const { box, c, r } = bounds();
    const cam = p.cam;
    const d = (dir ?? new THREE.Vector3(...p.def.dir)).normalize();
    if (cam instanceof THREE.PerspectiveCamera) {
      const fov = THREE.MathUtils.degToRad(cam.fov / 2), fovH = Math.atan(Math.tan(fov) * cam.aspect);
      const dist = (r / Math.sin(Math.min(fov, fovH))) * 1.3;
      cam.position.copy(c).addScaledVector(d, dist);
      cam.near = dist / 200;
      cam.far = dist * 20;
      p.controls.minDistance = r * 0.05;
      p.controls.maxDistance = dist * 8;
    } else {
      cam.position.copy(c).addScaledVector(d, r * 4);
      cam.near = r * 0.5;
      cam.far = r * 10;
      cam.zoom = 1;
    }
    p.controls.target.copy(c);
    cam.lookAt(c);
    cam.updateMatrixWorld();
    if (cam instanceof THREE.OrthographicCamera) {
      const inv = cam.matrixWorldInverse, cc = c.clone().applyMatrix4(inv);
      let mx = 0, my = 0;
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(inv);
        mx = Math.max(mx, Math.abs(v.x - cc.x));
        my = Math.max(my, Math.abs(v.y - cc.y));
      }
      // Leave DIM_ROOM px on each side for the dimensions (and the view label).
      const pw = p.el.clientWidth || 1, ph = p.el.clientHeight || 1;
      const room = (px: number) => (px / 2) / Math.max(px / 4, px / 2 - DIM_ROOM);
      p.half = Math.max(my * room(ph), (mx * room(pw) * ph) / pw, 5);
    }
    frustum(p);
    p.controls.update();
    st.current?.request();
  };

  /** Ground and back grids and the shadow camera, sized to the model. */
  const stageFor = () => {
    const s = st.current;
    if (!s) return;
    const { box, c, r } = bounds();
    const size = Math.max(200, Math.ceil((r * 6) / 100) * 100);
    s.ground.scale.set(size * 2, size * 2, 1);
    s.ground.position.set(c.x, 0, c.z);
    for (const g of s.grids) { s.scene.remove(g); g.dispose(); }
    const dark = document.documentElement.dataset.theme === "dark";
    const step = r > 400 ? 100 : r > 120 ? 50 : 10;
    const grid = (layer: number) => {
      const g = new THREE.GridHelper(size, Math.round(size / step), dark ? 0x6a7080 : 0x6f747d, dark ? 0x3d424d : 0xa6aab2);
      (g.material as THREE.Material).transparent = true;
      (g.material as THREE.Material).opacity = 0.85;
      g.layers.set(layer);
      return g;
    };
    const floor = grid(1);
    floor.position.set(c.x, 0.01, c.z);
    const back = grid(2);
    back.rotation.x = Math.PI / 2;
    back.position.set(c.x, 0, box.min.z - 0.5);
    const side = grid(3);
    side.rotation.z = Math.PI / 2;
    side.position.set(box.max.x + 0.5, 0, c.z);
    s.grids = [floor, back, side];
    s.scene.add(floor, back, side);
    const L = r * 2.4;
    s.sun.position.set(c.x + L * 0.45, L, c.z + L * 0.35);
    s.sun.target.position.copy(c);
    const sc = s.sun.shadow.camera;
    sc.left = sc.bottom = -r * 1.6;
    sc.right = sc.top = r * 1.6;
    sc.near = L * 0.2;
    sc.far = L * 3;
    sc.updateProjectionMatrix();
  };

  const select = (mesh: THREE.Mesh | null) => {
    if (selected.current) glow(selected.current, false);
    selected.current = mesh;
    if (mesh) glow(mesh, true);
    setPicked(mesh?.name ?? null);
    st.current?.request();
  };

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const keep = selected.current?.name;
    selected.current = null;
    if (shown.current) { s.scene.remove(shown.current.group); shown.current.dispose(); shown.current = null; }
    if (model) {
      const m = buildModel(model);
      applyLook(m.group, lookOf(material));
      paintShade(m, shade);
      m.explode(0);
      bbox.current = modelBox(m.group);
      m.explode(explode);
      s.scene.add(m.group);
      shown.current = m;
      select(keep ? m.meshes.find((x) => x.name === keep) ?? null : null);
      stageFor();
      const key = model.objects.map((o) => o.name).join("|");
      if (key !== framed.current) {
        framed.current = key;
        for (const p of s.panes) fitPane(p);
      }
    } else {
      bbox.current = null;
      setPicked(null);
    }
    s.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  useEffect(() => {
    const m = shown.current;
    if (!m) return;
    applyLook(m.group, lookOf(material));
    paintShade(m, shade);
    if (selected.current) glow(selected.current, true);
    st.current?.request();
  }, [material, shade]);

  useEffect(() => {
    shown.current?.explode(explode);
    st.current?.request();
  }, [explode]);

  // Panes change size when the layout changes; the observer redraws, this keeps the active view framed.
  useEffect(() => { st.current?.request(); }, [quad, active, dims, units]);

  // Faces of the view cube, placed once.
  useEffect(() => {
    const c = cube.current;
    if (!c) return;
    const o = new THREE.Object3D();
    c.querySelectorAll<HTMLElement>("[data-face]").forEach((f) => {
      const face = FACES.find((x) => x.name === f.dataset.face)!;
      o.position.set(...(face.pos.map((v) => (v * CUBE) / 2) as [number, number, number]));
      o.rotation.set(...face.rot);
      o.updateMatrix();
      f.style.transform = `translate(-50%, -50%) ${objectCSS(o.matrix)}`;
    });
    syncCube();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paneOf = (id: PaneId) => st.current?.panes.find((p) => p.def.id === id);
  const fitAll = () => st.current?.panes.forEach((p) => fitPane(p, p.def.ortho ? undefined : p.cam.position.clone().sub(p.controls.target)));
  const dolly = (k: number) => {
    const p = paneOf(active);
    if (!p) return;
    if (p.cam instanceof THREE.OrthographicCamera) p.cam.zoom *= k;
    else p.cam.position.sub(p.controls.target).multiplyScalar(1 / k).add(p.controls.target);
    p.cam.updateProjectionMatrix();
    p.controls.update();
    st.current?.request();
  };

  useImperativeHandle(ref, () => ({ zoomIn: () => dolly(1.25), zoomOut: () => dolly(0.8), fit: fitAll, reset: fitAll }));

  const pickAt = (id: PaneId, e: React.PointerEvent) => {
    const p = paneOf(id), m = shown.current;
    if (!p || !m) return;
    const r = p.el.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), p.cam);
    const hit = ray.intersectObjects(m.meshes.filter((x) => x.visible), false)[0];
    select(hit ? (hit.object as THREE.Mesh) : null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (e.altKey) {
      if (k === "w") { e.preventDefault(); onQuad(!quad); }
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    const view = PANES.find((p) => p.key === k);
    if (view) { e.preventDefault(); onActive(view.id); }
    else if (k === "z") { e.preventDefault(); if (e.shiftKey) fitAll(); else { const p = paneOf(active); if (p) fitPane(p, p.def.ortho ? undefined : p.cam.position.clone().sub(p.controls.target)); } }
    else if (e.key === "F3") { e.preventDefault(); onShade(shade === "wire" ? "shaded" : "wire"); }
    else if (e.key === "F4") { e.preventDefault(); onShade(shade === "edges" ? "shaded" : "edges"); }
    else if (e.key === "Escape") select(null);
  };

  return (
    <div ref={host} className={`v3${quad ? " quad" : " single"}${dim ? " dim" : ""}`} tabIndex={0} onKeyDown={onKey} aria-label="3D views of the design">
      {noGL && <span className="v3-note">The 3D view needs WebGL, which is turned off on this computer.</span>}
      <div className="v3-panes">
        {PANES.map((def) => (
          <div key={def.id} className={`v3-pane${active === def.id ? " active" : ""}`} data-pane={def.id} hidden={!quad && active !== def.id}>
            {/* The mouse controls listen here; the label and view cube sit above it. */}
            <div
              ref={(n) => { paneEls.current[def.id] = n; }}
              className="v3-hit"
              onPointerDown={(e) => {
                press.current = { x: e.clientX, y: e.clientY };
                host.current?.focus({ preventScroll: true });
                if (active !== def.id) onActive(def.id);
              }}
              onPointerUp={(e) => {
                const p = press.current;
                press.current = null;
                if (p && e.button === 0 && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) pickAt(def.id, e);
              }}
            />
            <svg ref={(n) => { dimEls.current[def.id] = n; }} className="v3-dims" aria-hidden />
            <button
              type="button" className="v3-label" title={`${def.label} view (${def.key.toUpperCase()}). Double-click or Alt+W to ${quad ? "maximize it" : "show all four views"}.`}
              onClick={() => onActive(def.id)} onDoubleClick={() => onQuad(!quad)}
            >[{def.label}] [{SHADE_NAMES[shade]}]</button>
            {def.id === "persp" && (
              <div className="v3-cube">
                <div className="vcube-stage">
                  <div className="vcube" ref={cube}>
                    {FACES.map((f) => (
                      <button
                        key={f.name} type="button" data-face={f.name} className="vcube-face" tabIndex={-1} aria-label={`${f.name} view`}
                        onClick={() => { const p = paneOf("persp"); if (p && f.dir) fitPane(p, new THREE.Vector3(...f.dir)); }}
                        style={{ width: CUBE, height: CUBE }}
                      >{f.name}</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="v3-home" title="Home view" aria-label="Home view" onClick={() => { const p = paneOf("persp"); if (p) fitPane(p); }}><Home size={13} aria-hidden /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {picked && <span className="v3-pick" role="status">Selected: <b>{picked}</b> · Esc to clear</span>}
      <span className="v3-hint">Drag to orbit · middle or right-drag to pan · wheel to zoom · click a part to select · Alt+W one or four views · Z zoom extents · F3 wireframe · F4 edges</span>
      {children}
    </div>
  );
});

export default View3D;
