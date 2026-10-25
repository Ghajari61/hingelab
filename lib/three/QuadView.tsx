/**
 * The 3D workspace, laid out like a 3D modelling program: Top, Front and Left orthographic views
 * and a Perspective view, or one of them maximized. One WebGL canvas draws every view; each view
 * has its own camera and mouse controls. Renders only when something changes. Shared by the web
 * editors and the desktop app; the model is owned here once passed in (the previous one is
 * disposed when a new one arrives).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Camera, Home } from "lucide-react";
import ListingPhoto, { type Shoot } from "./ListingPhoto";
import { applyLook, type LookId } from "./looks";
import { dimLines, dimSVG, modelBox } from "./dims";
import { GRIP_KINDS, axisDrag, dragFactors, scaleDrag, shownAxes, sizeResult, snapDrag, turnDrag, uniformDrag, type Factors, type Grip, type GripAxis, type GripKind, type GripSet, type SizeGizmo } from "./grips";

export type PaneId = "top" | "front" | "left" | "persp";
export type Shade3D = "shaded" | "edges";

interface PaneDef { id: PaneId; label: string; key: string; dir: [number, number, number]; up: [number, number, number]; ortho: boolean; layer: number }

/** In the 3D programs' order: Top, Front, Left, Perspective. Each view sees its own grid layer. */
export const PANES: PaneDef[] = [
  { id: "top", label: "Top", key: "t", dir: [0, 1, 0], up: [0, 0, -1], ortho: true, layer: 1 },
  { id: "front", label: "Front", key: "f", dir: [0, 0, 1], up: [0, 1, 0], ortho: true, layer: 2 },
  { id: "left", label: "Left", key: "l", dir: [-1, 0, 0], up: [0, 1, 0], ortho: true, layer: 3 },
  { id: "persp", label: "Perspective", key: "p", dir: [0.95, 0.85, 1.35], up: [0, 1, 0], ortho: false, layer: 1 },
];

export const SHADE_NAMES: Record<Shade3D, string> = { shaded: "Shaded", edges: "Edged faces" };

/** A model to show: its root, how to free it, and (optionally) how to pull it apart in place. */
export interface QuadModel {
  group: THREE.Object3D;
  dispose: () => void;
  /** 0 = assembled, 1 = fully exploded. Models without it are rebuilt by the caller instead. */
  explode?: (e: number) => void;
  /** Settles when late textures (pictures) have loaded, so the views draw again. */
  ready?: Promise<unknown>;
}

export interface QuadViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  /** Zoom extents in every view. */
  fit: () => void;
  /** Redraw after the model's contents changed in place; `reframe` also frames it again. */
  refresh: (reframe?: boolean) => void;
}

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

interface Pane {
  def: PaneDef; el: HTMLDivElement; svg: SVGSVGElement | null; cam: THREE.PerspectiveCamera | THREE.OrthographicCamera; controls: OrbitControls;
  /** Orthographic views: half the visible height, mm, and the model's half extents it was fitted to. */
  half: number;
  ext: { mx: number; my: number } | null;
}

/** Half the visible height that shows ±mx by ±my with DIM_ROOM px left on each side for the dimensions. */
function fitHalf(mx: number, my: number, pw: number, ph: number) {
  const room = (px: number) => (px / 2) / Math.max(px / 4, px / 2 - DIM_ROOM);
  return Math.max(my * room(ph), (mx * room(pw) * ph) / pw, 5);
}

const AXIS_VEC: Record<GripAxis, [number, number, number]> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const AXIS_COLOR: Record<GripAxis, number> = { x: 0xe5484d, y: 0x30a46c, z: 0x3e7bfa };
const HOVER_COLOR = 0xffd21f;
/** The scale gizmo, in screen pixels: axis length, and the inner and outer edges of its triangles (fractions of it). */
const GIZMO = { L: 86, r1: 0.36, r2: 0.62 };

/** A letter facing the viewer, for the gizmo's axis ends. */
function letterTexture(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    g.font = "600 46px Segoe UI, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(20, 22, 28, 0.75)";
    g.strokeText(text, 32, 34);
    g.fillStyle = color;
    g.fillText(text, 32, 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Handle shapes in screen pixels; each view scales them to its own millimetres per pixel. */
function gripShapes() {
  const L = GIZMO.L;
  return {
    shaft: new THREE.CylinderGeometry(1.4, 1.4, 58, 8).translate(0, 29, 0),
    cone: new THREE.ConeGeometry(6, 16, 16).translate(0, 66, 0),
    arrowHit: new THREE.CylinderGeometry(10, 10, 76, 8).translate(0, 38, 0),
    ring: new THREE.TorusGeometry(64, 1.6, 8, 72),
    ringHit: new THREE.TorusGeometry(64, 8, 6, 48),
    axisLine: new THREE.CylinderGeometry(1.3, 1.3, L, 6).translate(0, L / 2, 0),
    axisEnd: new THREE.BoxGeometry(7, 7, 7).translate(0, L, 0),
    axisHit: new THREE.CylinderGeometry(9, 9, L * (1 - GIZMO.r2) + 16, 8).translate(0, (L * (1 + GIZMO.r2) + 16) / 2, 0),
    letterX: letterTexture("X", "#ff7275"),
    letterY: letterTexture("Y", "#4fd18b"),
    letterZ: letterTexture("Z", "#6f9dff"),
  };
}
type GripShapes = ReturnType<typeof gripShapes>;

/**
 * A handle placed in the overlay: `at` is where it acts (the box centre for arrows, rings and the
 * scale gizmo), `ext` the box's size along its axis. `scale`: the axes a scale handle sizes.
 */
interface Handle {
  id: string; grip?: Grip; scale?: GripAxis[]; obj: THREE.Group; hits: THREE.Mesh[]; axis: THREE.Vector3; at: THREE.Vector3; ext: number;
  /** Whether it shows in a view looking along `look`. */
  shows: (look: THREE.Vector3) => boolean;
  paint: (lit: boolean) => void;
  dispose: () => void;
}

interface Drag {
  id: string; kind: GripKind; fn: (d: number, done: boolean) => string;
  x0: number; y0: number; prev: [number, number]; ang: number;
  /** Screen pixels per mm along the axis, and the handle's centre on screen. */
  u: [number, number]; c: [number, number]; facing: boolean; d: number; text: string;
  /** Scale: the axes the handle sizes, where it was grabbed, the direction it grows towards on screen, and the last result. */
  scale?: { axes: GripAxis[]; all: boolean; gizmo: SizeGizmo; grab: [number, number]; dir: [number, number]; ext: Factors; last: ReturnType<typeof sizeResult> | null };
}

/**
 * The design (or, for a part's gizmo, the selected part) scaled on screen while a scale handle is
 * dragged: what is scaled, its own matrix and matrix mode before, its parent's world matrix, the
 * point it grows from, and the design's box before.
 */
interface Preview { obj: THREE.Object3D; base: THREE.Matrix4; auto: boolean; parent: THREE.Matrix4; anchor: THREE.Vector3; box: THREE.Box3 | null; part: boolean }

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  /** The handles, drawn over the model in every view. */
  overlay: THREE.Scene;
  shapes: GripShapes;
  hitMat: THREE.Material;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  grids: THREE.GridHelper[];
  panes: Pane[];
  request: () => void;
}

interface Props {
  model: QuadModel | null;
  /** The material look given to every mesh; null keeps the model's own materials. */
  look: LookId | null;
  /** Every view frames the model again when this changes (not while a slider is scrubbed). */
  frameKey: string;
  /** For models that explode in place. */
  explode?: number;
  /** Whether the model is at its real size (assembled or laid flat): dimensions only then. */
  measure: boolean;
  shade: Shade3D;
  quad: boolean;
  active: PaneId;
  onActive: (p: PaneId) => void;
  onQuad: (quad: boolean) => void;
  onShade: (s: Shade3D) => void;
  /** Overall dimensions on every view. */
  dims: boolean;
  units: "mm" | "in";
  /** Decimals in the dimension labels (inches get one more). */
  decimals?: 0 | 1 | 2;
  /** Greyed out while the model is out of date. */
  dim?: boolean;
  /** Clicks report the part here instead of highlighting it. */
  onPick?: (mesh: THREE.Mesh | null) => void;
  /** Which meshes a click can select (default: every named mesh not marked userData.noPick). */
  pickable?: (mesh: THREE.Mesh) => boolean;
  /** Told the name of the highlighted part whenever it changes (null: none). */
  onSelect?: (name: string | null) => void;
  /** Highlights the part with this name from outside (undefined leaves the selection to clicks). */
  selectName?: string | null;
  /** Handles for the selected part: dragging one changes the design (lib/three/grips.ts). */
  grips?: GripSet;
  id?: string;
  testId?: string;
  className?: string;
  label?: string;
  /** Start of the listing photo's file name. */
  photoName?: string;
  children?: React.ReactNode;
}

const materials = (m: THREE.Mesh) => ([] as THREE.Material[]).concat(m.material);

function meshesOf(root: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh); });
  return out;
}

function paintShade(root: THREE.Object3D, shade: Shade3D) {
  for (const mesh of meshesOf(root)) {
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

const QuadView = forwardRef<QuadViewHandle, Props>(function QuadView(props, ref) {
  const { model, look, frameKey, explode = 0, measure, shade, quad, active, onActive, onQuad, onShade, dims, units, dim, onPick, pickable, onSelect, selectName, grips, id, testId, className = "", label = "3D views of the design", photoName, children } = props;
  const [gripKind, setGripKind] = useState<GripKind>("size");
  const kinds = GRIP_KINDS.filter((k) => (k.kind === "size" ? !!grips?.size?.settings.length : grips?.grips?.some((g) => g.kind === k.kind)));
  const kind = kinds.some((k) => k.kind === gripKind) ? gripKind : kinds[0]?.kind;
  const gripList = useRef<Grip[]>([]);
  gripList.current = kind === "size" ? [] : grips?.grips?.filter((g) => g.kind === kind) ?? [];
  const sizer = useRef<SizeGizmo | null>(null);
  sizer.current = kind === "size" ? grips?.size ?? null : null;
  const handles = useRef<Handle[]>([]);
  const hoverId = useRef<string | null>(null);
  const drag = useRef<Drag | null>(null);
  const preview = useRef<Preview | null>(null);
  /** The axes the scale gizmo shows (its axes less those the box is too thin along). */
  const gizmoAxes = useRef<GripAxis[]>([]);
  /** Until then a new frame key does not reframe: the design was resized by a drag. */
  const holdUntil = useRef(0);
  const tip = useRef<HTMLSpanElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const told = useRef<string | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const paneEls = useRef<Partial<Record<PaneId, HTMLDivElement | null>>>({});
  const dimEls = useRef<Partial<Record<PaneId, SVGSVGElement | null>>>({});
  /** The assembled model's bounding box, for the dimensions and the grids. */
  const bbox = useRef<THREE.Box3 | null>(null);
  const showDims = useRef<"mm" | "in" | null>(null);
  showDims.current = dims && measure ? units : null;
  const decimals = useRef(1);
  decimals.current = props.decimals ?? 1;
  const live = useRef({ explode, measure, look, shade });
  live.current = { explode, measure, look, shade };
  const cube = useRef<HTMLDivElement>(null);
  const st = useRef<Stage | null>(null);
  const shown = useRef<QuadModel | null>(null);
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
    else {
      // A fitted view stays fitted when its pane changes size (layout, window, toolbar).
      if (p.ext && p.el.clientWidth && p.el.clientHeight) p.half = fitHalf(p.ext.mx, p.ext.my, w, h);
      Object.assign(p.cam, { left: (-p.half * w) / h, right: (p.half * w) / h, top: p.half, bottom: -p.half });
    }
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
    renderer.shadowMap.type = THREE.PCFShadowMap;
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
        if (fitHandles(p, r.height)) {
          renderer.autoClear = false;
          renderer.clearDepth();
          renderer.render(overlay, p.cam);
          renderer.autoClear = true;
        }
        if (p.svg) p.svg.innerHTML = showDims.current && bbox.current ? dimSVG(dimLines(bbox.current, p.cam, r.width, r.height), showDims.current, decimals.current) : "";
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
      return { def, el: pel, svg: dimEls.current[def.id] ?? null, cam, controls, half: 100, ext: null };
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
    const overlay = new THREE.Scene();
    const shapes = gripShapes();
    const hitMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    // Capture on the pane: a press on a handle never reaches the mouse controls.
    const offs: (() => void)[] = [];
    for (const p of panes) {
      const on = <K extends keyof HTMLElementEventMap>(type: K, f: (e: HTMLElementEventMap[K]) => void, capture: boolean) => {
        p.el.addEventListener(type, f, capture);
        offs.push(() => p.el.removeEventListener(type, f, capture));
      };
      on("pointerdown", (e) => gripEvents.current.down(p, e), true);
      on("pointermove", (e) => gripEvents.current.move(p, e), false);
      on("pointerup", (e) => gripEvents.current.up(p, e, false), true);
      on("pointercancel", (e) => gripEvents.current.up(p, e, true), true);
    }
    st.current = { renderer, scene, overlay, shapes, hitMat, sun, ground, grids: [], panes, request };
    resize();
    return () => {
      ro.disconnect();
      for (const off of offs) off();
      for (const k of handles.current) k.dispose();
      handles.current = [];
      for (const g of Object.values(shapes)) g.dispose();
      hitMat.dispose();
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
    const box = bbox.current && !bbox.current.isEmpty() ? bbox.current.clone() : g ? new THREE.Box3().setFromObject(g) : new THREE.Box3();
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
      p.ext = { mx, my };
      p.half = fitHalf(mx, my, p.el.clientWidth || 1, p.el.clientHeight || 1);
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
    // Models stand on y = 0; ones centred on the origin (wall pieces) stand on their lowest point.
    const y0 = box.min.y < -0.5 ? box.min.y : 0;
    const size = Math.max(200, Math.ceil((r * 6) / 100) * 100);
    s.ground.scale.set(size * 2, size * 2, 1);
    s.ground.position.set(c.x, y0, c.z);
    for (const g of s.grids) { s.scene.remove(g); g.dispose(); }
    const dark = /dark/.test(document.documentElement.dataset.theme ?? "");
    const step = r > 400 ? 100 : r > 120 ? 50 : 10;
    const grid = (layer: number) => {
      const g = new THREE.GridHelper(size, Math.round(size / step), dark ? 0x6a7080 : 0x6f747d, dark ? 0x3d424d : 0xa6aab2);
      (g.material as THREE.Material).transparent = true;
      (g.material as THREE.Material).opacity = 0.85;
      g.layers.set(layer);
      return g;
    };
    const floor = grid(1);
    floor.position.set(c.x, y0 + 0.01, c.z);
    const back = grid(2);
    back.rotation.x = Math.PI / 2;
    back.position.set(c.x, y0, box.min.z - 0.5);
    const side = grid(3);
    side.rotation.z = Math.PI / 2;
    side.position.set(box.max.x + 0.5, y0, c.z);
    s.grids = [floor, back, side];
    s.scene.add(floor, back, side);
    const L = r * 2.4;
    s.sun.position.set(c.x + L * 0.45, y0 + L, c.z + L * 0.35);
    s.sun.target.position.copy(c);
    const sc = s.sun.shadow.camera;
    sc.left = sc.bottom = -r * 1.6;
    sc.right = sc.top = r * 1.6;
    sc.near = L * 0.2;
    sc.far = L * 3;
    sc.updateProjectionMatrix();
  };

  /** The assembled model's box (models that explode in place are measured closed). */
  const measureBox = () => {
    const m = shown.current;
    if (!m) return null;
    m.group.updateMatrixWorld(true);
    if (!m.explode) return modelBox(m.group);
    m.explode(0);
    m.group.updateMatrixWorld(true);
    const box = modelBox(m.group);
    m.explode(live.current.explode);
    return box;
  };

  const select = (mesh: THREE.Mesh | null) => {
    if (onPick) { onPick(mesh); return; }
    if (selected.current) glow(selected.current, false);
    selected.current = mesh;
    if (mesh) glow(mesh, true);
    setPicked(mesh ? mesh.name || "Part" : null);
    const name = mesh?.name || null;
    if (name !== told.current) { told.current = name; onSelectRef.current?.(name); }
    st.current?.request();
  };

  /**
   * The design drawn grown by `f` about the middle of its base while a scale handle is dragged, or
   * for a part's gizmo the selected part alone about its middle (null: its own size again).
   */
  const previewScale = (f: Factors | null) => {
    const m = shown.current, g = m?.group;
    if (!f) { endPreview(); return; }
    if (!g) return;
    let pv = preview.current;
    if (!pv) {
      const part = sizer.current?.part ? selected.current : null;
      const obj = part ?? g;
      if (obj.matrixAutoUpdate) obj.updateMatrix();
      g.updateMatrixWorld(true);
      const b = part ? new THREE.Box3().setFromObject(part) : modelBox(g);
      if (b.isEmpty()) return;
      const anchor = part ? b.getCenter(new THREE.Vector3()) : new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2);
      pv = { obj, base: obj.matrix.clone(), auto: obj.matrixAutoUpdate, parent: obj.parent?.matrixWorld.clone() ?? new THREE.Matrix4(), anchor, box: bbox.current?.clone() ?? null, part: !!part };
      preview.current = pv;
      obj.matrixAutoUpdate = false;
    }
    const a = pv.anchor;
    const about = new THREE.Matrix4().makeTranslation(a.x, a.y, a.z)
      .multiply(new THREE.Matrix4().makeScale(f.x, f.y, f.z))
      .multiply(new THREE.Matrix4().makeTranslation(-a.x, -a.y, -a.z));
    pv.obj.matrix.copy(pv.parent.clone().invert().multiply(about).multiply(pv.parent)).multiply(pv.base);
    pv.obj.matrixWorldNeedsUpdate = true;
    g.updateMatrixWorld(true);
    if (pv.box && !pv.part) bbox.current = pv.box.clone().applyMatrix4(about);
    st.current?.request();
  };

  /** Back to the design's (or the part's) own size after a scale preview. */
  const endPreview = () => {
    const pv = preview.current;
    preview.current = null;
    if (!pv) return;
    pv.obj.matrix.copy(pv.base);
    pv.obj.matrixAutoUpdate = pv.auto;
    pv.obj.matrixWorldNeedsUpdate = true;
    pv.obj.updateMatrixWorld(true);
    if (!pv.part) bbox.current = pv.box;
    st.current?.request();
  };

  /** After the model or its contents changed: look, display mode, box, grids and framing. */
  const settle = (reframe: boolean) => {
    const s = st.current, m = shown.current;
    if (!s || !m) return;
    if (live.current.look) applyLook(m.group, live.current.look);
    paintShade(m.group, live.current.shade);
    if (m.explode || live.current.measure || reframe) bbox.current = measureBox();
    if (reframe || live.current.measure || m.explode) stageFor();
    if (reframe) for (const p of s.panes) fitPane(p);
    s.request();
  };

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    const scaled = !!preview.current;
    if (shown.current !== model) endPreview();
    if (shown.current && shown.current !== model) {
      s.scene.remove(shown.current.group);
      shown.current.dispose();
      shown.current = null;
    }
    const keep = selected.current?.name;
    selected.current = null;
    if (model) {
      if (shown.current !== model) {
        model.explode?.(explode);
        s.scene.add(model.group);
        shown.current = model;
        model.ready?.then(() => { if (shown.current === model) st.current?.request(); });
      }
      const held = !!drag.current || scaled || performance.now() < holdUntil.current;
      const reframe = !!frameKey && frameKey !== framed.current && !held;
      if (reframe || held) framed.current = frameKey;
      settle(reframe);
      if (!onPick) select(keep ? meshesOf(model.group).find((x) => x.name === keep) ?? null : null);
    } else {
      bbox.current = null;
      setPicked(null);
      s.request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, frameKey]);

  useEffect(() => {
    const m = shown.current;
    if (selectName === undefined || onPick || !m) return;
    if ((selected.current?.name ?? null) === selectName) return;
    select(selectName ? meshesOf(m.group).find((x) => x.name === selectName) ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectName, model]);

  useEffect(() => {
    const m = shown.current;
    if (!m) return;
    if (look) applyLook(m.group, look);
    paintShade(m.group, shade);
    if (selected.current) glow(selected.current, true);
    st.current?.request();
  }, [look, shade]);

  useEffect(() => {
    const m = shown.current;
    if (m?.explode) m.explode(explode);
    st.current?.request();
  }, [explode]);

  // Panes change size when the layout changes; the observer redraws, this keeps the dimensions current.
  useEffect(() => { st.current?.request(); }, [quad, active, dims, units, measure]);

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

  useImperativeHandle(ref, () => ({ zoomIn: () => dolly(1.25), zoomOut: () => dolly(0.8), fit: fitAll, refresh: (reframe = false) => { endPreview(); settle(reframe); } }));

  /** The model alone (no grids, dimensions or selection glow), framed along `dir`, into a w × h canvas. */
  const shoot = useCallback<Shoot>((dir, w, h) => {
    const s = st.current, m = shown.current, p = persp();
    if (!s || !m || !p) return null;
    const { renderer, scene } = s;
    let box = modelBox(m.group);
    if (box.isEmpty()) box = bounds().box;
    const c = box.getCenter(new THREE.Vector3()), r = Math.max(10, box.getSize(new THREE.Vector3()).length() / 2);
    const cam = new THREE.PerspectiveCamera(30, w / h, 1, 20000);
    const d = (dir ? new THREE.Vector3(...dir) : p.cam.position.clone().sub(p.controls.target)).normalize();
    const fov = THREE.MathUtils.degToRad(15), fovH = Math.atan(Math.tan(fov) * cam.aspect);
    const dist = (r / Math.sin(Math.min(fov, fovH))) * 1.08;
    cam.position.copy(c).addScaledVector(d, dist);
    cam.near = dist / 200;
    cam.far = dist * 20;
    cam.lookAt(c);
    cam.updateProjectionMatrix();
    const was = renderer.getSize(new THREE.Vector2()), ratio = renderer.getPixelRatio();
    const sel = selected.current;
    if (sel) glow(sel, false);
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    try {
      renderer.setPixelRatio(1);
      renderer.setSize(w, h, false);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.clear();
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, cam);
      out.getContext("2d")?.drawImage(renderer.domElement, 0, 0, w, h);
    } finally {
      if (sel) glow(sel, true);
      renderer.setPixelRatio(ratio);
      renderer.setSize(was.x, was.y, false);
      s.request();
    }
    return out;
     
  }, []);
  const [photo, setPhoto] = useState(false);
  const closePhoto = useCallback(() => { setPhoto(false); host.current?.focus({ preventScroll: true }); }, []);

  /** Sizes the handles to this view's millimetres per pixel and hides the ones seen end-on; false when there are none. */
  const fitHandles = (p: Pane, h: number) => {
    if (!handles.current.length || !st.current) return false;
    const look = p.cam.getWorldDirection(new THREE.Vector3());
    const tan = p.cam instanceof THREE.PerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(p.cam.fov / 2)) : 0;
    for (const k of handles.current) {
      const mmPx = p.cam instanceof THREE.OrthographicCamera
        ? (p.cam.top - p.cam.bottom) / p.cam.zoom / Math.max(1, h)
        : (2 * Math.max(1, look.dot(k.at.clone().sub(p.cam.position))) * tan) / Math.max(1, h);
      k.obj.scale.setScalar(mmPx);
      k.obj.visible = k.shows(look);
    }
    st.current.overlay.updateMatrixWorld(true);
    return true;
  };

  const paintHandles = () => {
    const lit = drag.current?.id ?? hoverId.current;
    for (const k of handles.current) k.paint(k.id === lit);
  };

  /** An arrow or a ring for a move or turn grip, on the selected part's box or the whole design's. */
  const gripHandle = (g: Grip, box: THREE.Box3): Handle => {
    const { shapes, hitMat } = st.current!;
    const axis = new THREE.Vector3(...AXIS_VEC[g.axis]);
    const mat = new THREE.MeshBasicMaterial({ color: AXIS_COLOR[g.axis], transparent: true, opacity: 0.95 });
    const obj = new THREE.Group();
    let hit: THREE.Mesh;
    if (g.kind === "move") {
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      hit = new THREE.Mesh(shapes.arrowHit, hitMat);
      obj.add(new THREE.Mesh(shapes.shaft, mat), new THREE.Mesh(shapes.cone, mat), hit);
    } else {
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
      hit = new THREE.Mesh(shapes.ringHit, hitMat);
      obj.add(new THREE.Mesh(shapes.ring, mat), hit);
    }
    const at = box.getCenter(new THREE.Vector3());
    obj.position.copy(at);
    return {
      id: g.id, grip: g, obj, hits: [hit], axis, at, ext: box.getSize(new THREE.Vector3())[g.axis],
      shows: (look) => { const along = Math.abs(axis.dot(look)); return g.kind === "turn" ? along > 0.25 : along < 0.95; },
      paint: (lit) => mat.color.setHex(lit ? HOVER_COLOR : AXIS_COLOR[g.axis]),
      dispose: () => mat.dispose(),
    };
  };

  /**
   * The scale gizmo at the design's centre, as in 3D programs: an axis handle per axis, a strip
   * between each two axes for that plane, and the middle triangle for all of them.
   */
  const scaleHandles = (gizmo: SizeGizmo, box: THREE.Box3): Handle[] => {
    const { shapes, hitMat } = st.current!;
    const axes = shownAxes(gizmo, box.getSize(new THREE.Vector3()));
    gizmoAxes.current = axes;
    const at = box.getCenter(new THREE.Vector3());
    const unit = (a: GripAxis) => new THREE.Vector3(...AXIS_VEC[a]);
    const { L, r1, r2 } = GIZMO;
    const out: Handle[] = [];
    const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
    const own = <T extends THREE.Material>(x: T): T => { mats.push(x); return x; };
    const ownGeo = <T extends THREE.BufferGeometry>(x: T): T => { geos.push(x); return x; };
    const fill = () => own(new THREE.MeshBasicMaterial({ color: HOVER_COLOR, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
    const tri = (pts: THREE.Vector3[]) => ownGeo(new THREE.BufferGeometry().setFromPoints(pts));
    const place = (h: Omit<Handle, "at" | "ext" | "axis"> & { axis?: THREE.Vector3 }) => {
      h.obj.position.copy(at);
      out.push({ axis: new THREE.Vector3(), ...h, at, ext: 0 });
    };
    for (const a of axes) {
      const axis = unit(a), mat = own(new THREE.MeshBasicMaterial({ color: AXIS_COLOR[a], transparent: true, opacity: 0.95 }));
      const obj = new THREE.Group(), stick = new THREE.Group();
      stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      const hit = new THREE.Mesh(shapes.axisHit, hitMat);
      stick.add(new THREE.Mesh(shapes.axisLine, mat), new THREE.Mesh(shapes.axisEnd, mat), hit);
      const label = new THREE.Sprite(own(new THREE.SpriteMaterial({ map: a === "x" ? shapes.letterX : a === "y" ? shapes.letterY : shapes.letterZ, depthTest: false, transparent: true })));
      label.scale.set(15, 15, 1);
      label.position.copy(axis).multiplyScalar(L + 14);
      obj.add(stick, label);
      place({
        id: `scale-${a}`, scale: [a], obj, hits: [hit], axis,
        shows: (look) => Math.abs(axis.dot(look)) < 0.95,
        paint: (lit) => mat.color.setHex(lit ? HOVER_COLOR : AXIS_COLOR[a]),
        dispose: () => {},
      });
    }
    for (let i = 0; i < axes.length; i++) for (let j = i + 1; j < axes.length; j++) {
      const a = axes[i], b = axes[j], ea = unit(a), eb = unit(b), n = ea.clone().cross(eb);
      const quad = [ea.clone().multiplyScalar(L * r1), ea.clone().multiplyScalar(L * r2), eb.clone().multiplyScalar(L * r2), eb.clone().multiplyScalar(L * r1)];
      const area = tri([quad[0], quad[1], quad[2], quad[0], quad[2], quad[3]]);
      const shade = fill();
      const mid = (p: THREE.Vector3, q: THREE.Vector3) => p.clone().add(q).multiplyScalar(0.5);
      const edges = ownGeo(new THREE.BufferGeometry().setFromPoints([quad[1], mid(quad[1], quad[2]), mid(quad[1], quad[2]), quad[2], quad[0], mid(quad[0], quad[3]), mid(quad[0], quad[3]), quad[3]]));
      const ca = new THREE.Color(AXIS_COLOR[a]), cb = new THREE.Color(AXIS_COLOR[b]);
      const cols = [ca, ca, cb, cb, ca, ca, cb, cb].flatMap((c) => [c.r, c.g, c.b]);
      edges.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
      const lineMat = own(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
      const lines = new THREE.LineSegments(edges, lineMat);
      const face = new THREE.Mesh(area, shade), hit = new THREE.Mesh(area, hitMat);
      const obj = new THREE.Group();
      obj.add(face, lines, hit);
      place({
        id: `scale-${a}${b}`, scale: [a, b], obj, hits: [hit],
        shows: (look) => Math.abs(n.dot(look)) > 0.2,
        paint: (lit) => { face.visible = lit; lineMat.vertexColors = !lit; lineMat.color.setHex(lit ? HOVER_COLOR : 0xffffff); lineMat.needsUpdate = true; },
        dispose: () => {},
      });
    }
    if (axes.length >= 2) {
      const corners = axes.length === 3 ? axes.map((a) => unit(a).multiplyScalar(L * r1)) : [new THREE.Vector3(), ...axes.map((a) => unit(a).multiplyScalar(L * r1))];
      const area = tri(corners), shade = fill();
      const face = new THREE.Mesh(area, shade), hit = new THREE.Mesh(area, hitMat);
      const obj = new THREE.Group();
      obj.add(face, hit);
      const n = new THREE.Vector3().subVectors(corners[1], corners[0]).cross(new THREE.Vector3().subVectors(corners[2], corners[0])).normalize();
      place({
        id: "scale-all", scale: axes, obj, hits: [hit],
        shows: (look) => Math.abs(n.dot(look)) > 0.08,
        paint: (lit) => { face.visible = lit; },
        dispose: () => {},
      });
    }
    if (out.length) out[0].dispose = () => { for (const g of geos) g.dispose(); for (const m of mats) m.dispose(); };
    return out;
  };

  /** The handles for the current grips or scale gizmo, on the selected part's box or the whole design's. */
  const placeHandles = () => {
    const s = st.current;
    if (!s) return;
    for (const k of handles.current) { s.overlay.remove(k.obj); k.dispose(); }
    handles.current = [];
    const m = shown.current, list = gripList.current, gizmo = sizer.current;
    if (m && (list.length || gizmo)) {
      if (!preview.current) m.group.updateMatrixWorld(true);
      const whole = preview.current?.box?.clone() ?? modelBox(m.group);
      const part = selected.current ? new THREE.Box3().setFromObject(selected.current) : null;
      if (!whole.isEmpty()) {
        if (gizmo) handles.current.push(...scaleHandles(gizmo, gizmo.part && part && !part.isEmpty() ? part : whole));
        for (const g of list) handles.current.push(gripHandle(g, g.part && part && !part.isEmpty() ? part : whole));
        for (const k of handles.current) s.overlay.add(k.obj);
      }
    }
    paintHandles();
    s.request();
  };

  const handleAt = (p: Pane, x: number, y: number) => {
    if (!handles.current.length) return null;
    const r = p.el.getBoundingClientRect();
    fitHandles(p, r.height);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), p.cam);
    const vis = handles.current.filter((k) => k.obj.visible);
    const hits = ray.intersectObjects(vis.flatMap((k) => k.hits), false);
    if (!hits.length) return null;
    // Axis handles win over the strips and the middle they cross.
    const of = (o: THREE.Object3D) => vis.find((k) => k.hits.includes(o as THREE.Mesh)) ?? null;
    const near = hits.map((h) => of(h.object)).filter((k): k is Handle => !!k);
    return near.find((k) => k.scale?.length === 1) ?? near[0] ?? null;
  };

  const showTip = (x: number, y: number, text: string | null) => {
    const t = tip.current, h = host.current;
    if (!t || !h) return;
    t.hidden = text == null;
    if (text == null) return;
    const r = h.getBoundingClientRect();
    t.textContent = text;
    t.style.left = `${x - r.left + 14}px`;
    t.style.top = `${y - r.top + 12}px`;
  };

  const endDrag = (cancel: boolean) => {
    const g = drag.current;
    if (!g) return;
    drag.current = null;
    holdUntil.current = performance.now() + 1500;
    if (g.scale) {
      const values = g.scale.last?.values ?? {};
      if (cancel || !Object.keys(values).length) endPreview();
      else {
        // The design stays drawn at its new size until the rebuilt one arrives.
        const pv = preview.current;
        g.scale.gizmo.write(values);
        window.setTimeout(() => { if (pv && preview.current === pv) endPreview(); }, 8000);
      }
    } else g.fn(cancel ? 0 : g.d, true);
    showTip(0, 0, null);
    paintHandles();
    st.current?.request();
  };

  const gripEvents = useRef({ down: (_p: Pane, _e: PointerEvent) => {}, move: (_p: Pane, _e: PointerEvent) => {}, up: (_p: Pane, _e: PointerEvent, _cancel: boolean) => {} });
  gripEvents.current = {
    down: (p, e) => {
      if (e.button !== 0 || drag.current) return;
      const k = handleAt(p, e.clientX, e.clientY);
      if (!k) return;
      const gizmo = sizer.current, m = shown.current;
      // A resize still being rebuilt: the next one waits for it.
      if (k.scale && (!gizmo || !m || preview.current)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      const r = p.el.getBoundingClientRect();
      const toScreen = (v: THREE.Vector3): [number, number] => {
        const q = v.clone().project(p.cam);
        return [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height];
      };
      const L = Math.max(1e-3, k.obj.scale.x * 100);
      const a = toScreen(k.at), b = toScreen(k.at.clone().addScaledVector(k.axis, L));
      const toViewer = p.cam instanceof THREE.OrthographicCamera ? p.cam.getWorldDirection(new THREE.Vector3()).negate() : p.cam.position.clone().sub(k.at);
      const base = { x0: e.clientX, y0: e.clientY, prev: [e.clientX, e.clientY] as [number, number], ang: 0, c: a, facing: k.axis.dot(toViewer) > 0, d: 0, text: "" };
      if (k.scale && gizmo && m) {
        const part = gizmo.part ? selected.current : null;
        const size = (part ? new THREE.Box3().setFromObject(part) : modelBox(m.group)).getSize(new THREE.Vector3());
        const grab: [number, number] = [e.clientX, e.clientY];
        const away = k.scale.length === 1 ? [b[0] - a[0], b[1] - a[1]] : [grab[0] - a[0], grab[1] - a[1]];
        const n = Math.hypot(away[0], away[1]) || 1;
        drag.current = {
          ...base, id: k.id, kind: "size", fn: () => "", u: [0, 0],
          scale: { axes: gizmo.uniform ? gizmoAxes.current : k.scale, all: k.id === "scale-all", gizmo, grab, dir: [away[0] / n, away[1] / n], ext: { x: size.x, y: size.y, z: size.z }, last: null },
        };
      } else if (k.grip) {
        drag.current = { ...base, id: k.id, kind: k.grip.kind, fn: k.grip.start(k.ext), u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
      } else return;
      try { p.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
      p.el.style.cursor = "grabbing";
      host.current?.focus({ preventScroll: true });
      if (active !== p.def.id) onActive(p.def.id);
      paintHandles();
      st.current?.request();
    },
    move: (p, e) => {
      const g = drag.current;
      if (!g) {
        if (e.buttons || !handles.current.length) return;
        const k = handleAt(p, e.clientX, e.clientY);
        const id = k?.id ?? null;
        p.el.style.cursor = k ? "grab" : "";
        p.el.dataset.grip = id ?? "";
        if (id !== hoverId.current) { hoverId.current = id; paintHandles(); st.current?.request(); }
        return;
      }
      if (g.scale) {
        const s = g.scale;
        const f = s.all ? uniformDrag(e.clientY - g.y0) : scaleDrag(g.c, s.dir, s.grab, [e.clientX, e.clientY]);
        const res = sizeResult(s.gizmo, s.ext, dragFactors(s.axes, f, e.shiftKey));
        s.last = res;
        previewScale(res.f);
        showTip(e.clientX, e.clientY, res.text);
        return;
      }
      let raw: number;
      if (g.kind === "turn") {
        g.ang += turnDrag(g.c, g.prev, [e.clientX, e.clientY], g.facing);
        g.prev = [e.clientX, e.clientY];
        raw = g.ang;
      } else raw = axisDrag(e.clientX - g.x0, e.clientY - g.y0, g.u);
      const d = snapDrag(g.kind, raw, e.shiftKey);
      if (d !== g.d || !g.text) { g.d = d; g.text = g.fn(d, false); }
      showTip(e.clientX, e.clientY, g.text);
    },
    up: (p, e, cancel) => {
      if (!drag.current) return;
      e.stopImmediatePropagation();
      try { p.el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      p.el.style.cursor = "";
      endDrag(cancel);
    },
  };

  // The handles follow the grips, the model (rebuilt while dragging) and the selection.
  useEffect(() => {
    placeHandles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grips, kind, model, picked, explode]);

  const pickAt = (id: PaneId, e: React.PointerEvent) => {
    const p = paneOf(id), m = shown.current;
    if (!p || !m) return;
    const r = p.el.getBoundingClientRect();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), p.cam);
    const can = pickable ?? ((x: THREE.Mesh) => !!x.name && !x.userData.noPick);
    const targets = meshesOf(m.group).filter((x) => can(x) && x.visible && x.parent?.visible !== false);
    const hit = ray.intersectObjects(targets, false)[0];
    select(hit ? (hit.object as THREE.Mesh) : null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.altKey) {
      if (k === "w") { done(); onQuad(!quad); }
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (e.key === "Escape" && drag.current) { done(); endDrag(true); return; }
    const view = PANES.find((p) => p.key === k);
    const handleKind = kinds.find((x) => x.key === k);
    if (handleKind) { done(); setGripKind(handleKind.kind); }
    else if (view) { done(); onActive(view.id); }
    else if (k === "z") { done(); if (e.shiftKey) fitAll(); else { const p = paneOf(active); if (p) fitPane(p, p.def.ortho ? undefined : p.cam.position.clone().sub(p.controls.target)); } }
    else if (e.key === "F4") { done(); onShade(shade === "edges" ? "shaded" : "edges"); }
    else if (e.key === "Escape" && (selected.current || onPick)) { done(); select(null); }
  };

  return (
    <div ref={host} id={id} data-testid={testId} className={`v3${quad ? " quad" : " single"}${dim ? " dim" : ""}${className ? ` ${className}` : ""}`} tabIndex={0} onKeyDown={onKey} aria-label={label}>
      {noGL && <span className="v3-note">The 3D view needs WebGL, which is turned off here.</span>}
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
                <button type="button" className="v3-home" title="Listing photo: a PNG of the model for Etsy or Instagram" aria-label="Listing photo" aria-expanded={photo} disabled={!model || noGL} onClick={() => setPhoto((o) => !o)}><Camera size={13} aria-hidden /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      {photo && model && <ListingPhoto shoot={shoot} name={photoName} onClose={closePhoto} />}
      {picked && <span className="v3-pick" role="status">Selected: <b>{picked}</b> · Esc to clear</span>}
      {kinds.length > 0 && (
        <span className="v3-seg v3-grips" role="group" aria-label="Handles" data-testid="v3-grips">
          {kinds.map((k) => (
            <button key={k.kind} type="button" aria-pressed={k.kind === kind} title={k.kind === "size"
              ? `Scale (${k.key.toUpperCase()}): drag an axis to size along it, a strip between two axes for both, the middle for all · Shift keeps the proportions · Esc cancels`
              : `${k.label} handles (${k.key.toUpperCase()}): drag them in any view · Shift snaps · Esc cancels`} onClick={() => setGripKind(k.kind)}>{k.label}</button>
          ))}
        </span>
      )}
      <span ref={tip} className="v3-tip" hidden data-testid="v3-tip" />
      <span className="v3-hint">Drag to orbit · middle or right-drag to pan · wheel to zoom · click a part to select, then drag its handles (Shift keeps proportions) · Alt+W one or four views · Z zoom extents · F4 edges</span>
      {children}
    </div>
  );
});

export default QuadView;
