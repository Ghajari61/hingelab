/**
 * The HingeLab start-up reveal, in three.js: the extruded title ("Hinge" in brushed champagne gold,
 * "Lab" in graphite with gold edges) among laser-cut pieces: a finger-jointed walnut box that
 * assembles from an exploded view, a bronze mandala panel, a technical drawing that draws itself,
 * a few precision joints and a fine gold laser beam. Transparent background; one timeline:
 *
 *   0.0–0.6  introduction: particles and drawing lines appear, the title rises out of depth
 *   0.6–1.8  assembly: panels slide in, the fingers interlock, outlines turn into wood
 *   1.8–2.6  reveal: a soft gold light sweeps across the title, everything settles
 *   2.6–3.0  exit: fade and scale down (only once the app is ready; until then a quiet idle)
 *
 * If the app is ready early the timeline runs faster to the exit instead of being cut.
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { TITLE, type TitleShape } from "./title.generated";

export interface SplashScene {
  /** The app is ready: finish the reveal (faster if early) and exit. */
  ready(): void;
  /** Stops and frees every GPU resource and listener. */
  dispose(): void;
}

export interface SplashOptions {
  /** Called when the exit begins (the app can show itself underneath). */
  onExitStart?: () => void;
  /** Called when the exit has finished. */
  onDone?: () => void;
  /** Called once the hold state starts (the app is still starting after the reveal). */
  onHold?: () => void;
  /** Reduced motion: no movement, a short cross-fade of the finished composition. */
  still?: boolean;
}

const PH = { intro: 0.6, assembly: 1.8, reveal: 2.6, end: 3.0 };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** A soft settle with a hint of overshoot. */
const easeBack = (x: number) => { const c = 1.25; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

/** Walnut: a dark warm base with wavy lighter and darker grain lines, drawn on a canvas (no download). */
function woodTexture(base: string, light: string, dark: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y0 = rnd() * 256, amp = 2 + rnd() * 6, f = 0.01 + rnd() * 0.03;
    g.strokeStyle = rnd() > 0.5 ? light : dark;
    g.globalAlpha = 0.15 + rnd() * 0.25;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    for (let x = 0; x <= 256; x += 4) g.lineTo(x, y0 + Math.sin(x * f + i) * amp);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A round soft dot for particles and the laser's glow. */
function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,244,214,1)"); gr.addColorStop(0.35, "rgba(240,205,140,.55)"); gr.addColorStop(1, "rgba(240,205,140,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const toShape = (s: TitleShape) => {
  const sh = new THREE.Shape(s.outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of s.holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return sh;
};

/**
 * A finger-jointed wall S wide and S tall, thickness t: tabs on its side edges where `even` says
 * (front and back take the even segments, the sides the odd ones, so the corners interlock).
 */
function fingerWall(S: number, t: number, n: number, even: boolean): THREE.Shape {
  const s = S / n, pts: THREE.Vector2[] = [];
  const out = (i: number) => (i % 2 === 0) === even;
  for (let i = 0; i < n; i++) { const x = out(i) ? S / 2 : S / 2 - t; pts.push(new THREE.Vector2(x, -S / 2 + i * s), new THREE.Vector2(x, -S / 2 + (i + 1) * s)); }
  for (let i = n - 1; i >= 0; i--) { const x = out(i) ? -S / 2 : -(S / 2 - t); pts.push(new THREE.Vector2(x, -S / 2 + (i + 1) * s), new THREE.Vector2(x, -S / 2 + i * s)); }
  return new THREE.Shape(pts);
}

/** A mandala panel: a scalloped disc with petal, dot and ring openings. */
function mandalaShape(R: number): THREE.Shape {
  const pts: THREE.Vector2[] = [];
  const lobes = 16;
  for (let i = 0; i <= 256; i++) { const a = (i / 256) * Math.PI * 2, r = R * (0.94 + 0.06 * Math.cos(a * lobes)); pts.push(new THREE.Vector2(r * Math.cos(a), r * Math.sin(a))); }
  const sh = new THREE.Shape(pts);
  const circle = (x: number, y: number, r: number) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); return p; };
  sh.holes.push(circle(0, 0, R * 0.12));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2, p = new THREE.Path();
    p.absellipse(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38, R * 0.16, R * 0.07, 0, Math.PI * 2, true, a);
    sh.holes.push(p);
  }
  for (let k = 0; k < 16; k++) { const a = ((k + 0.5) / 16) * Math.PI * 2; sh.holes.push(circle(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.05)); }
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2, p = new THREE.Path();
    p.absellipse(Math.cos(a) * R * 0.52, Math.sin(a) * R * 0.52, R * 0.08, R * 0.04, 0, Math.PI * 2, true, a);
    sh.holes.push(p);
  }
  return sh;
}

/** A dovetail joint: the tail board and the pin board, apart. */
function dovetailPieces(w: number, h: number): THREE.Shape[] {
  const tail = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h), new THREE.Vector2(w * 0.35, h), new THREE.Vector2(w * 0.45, h + w * 0.4), new THREE.Vector2(-w * 0.45, h + w * 0.4), new THREE.Vector2(-w * 0.35, h), new THREE.Vector2(-w / 2, h)]);
  const pin = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(-w * 0.45, 0), new THREE.Vector2(-w * 0.35, w * 0.4), new THREE.Vector2(w * 0.35, w * 0.4), new THREE.Vector2(w * 0.45, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(w / 2, h * 0.6), new THREE.Vector2(-w / 2, h * 0.6)]);
  return [tail, pin];
}

interface Fader { mats: THREE.Material[]; set(o: number): void }
function fader(...objs: THREE.Object3D[]): Fader {
  const mats: THREE.Material[] = [];
  for (const o of objs) o.traverse((x) => {
    const m = (x as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    for (const mm of m ? (Array.isArray(m) ? m : [m]) : []) if (!mats.includes(mm)) { mm.transparent = true; mats.push(mm); }
  });
  const base = mats.map((m) => (m as THREE.MeshStandardMaterial).opacity ?? 1);
  return { mats, set: (o) => mats.forEach((m, i) => { (m as THREE.MeshStandardMaterial).opacity = base[i] * o; m.visible = o > 0.003; }) };
}

export function createSplashScene(canvas: HTMLCanvasElement, opts: SplashOptions = {}): SplashScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04).texture;
  scene.environment = env;
  room.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); });

  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
  const disposables: { dispose(): void }[] = [renderer, pmrem, env];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ---- light
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x1b2340, 0.35));
  const key = new THREE.DirectionalLight(0xffe7c2, 2.4);
  key.position.set(-18, 34, 95);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 40, bottom: -40, near: 10, far: 200 });
  key.shadow.radius = 6;
  key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x5a72b8, 0.6);
  rim.position.set(45, -15, -40);
  scene.add(rim);
  const sweep = new THREE.PointLight(0xfff0cf, 0, 46, 1.6);
  scene.add(sweep);

  // an invisible wall behind everything that only shows the shadows (depth on a transparent window)
  const shadowWall = new THREE.Mesh(track(new THREE.PlaneGeometry(260, 160)), track(new THREE.ShadowMaterial({ opacity: 0.075 })));
  shadowWall.position.z = -30;
  shadowWall.receiveShadow = true;
  scene.add(shadowWall);

  // ---- materials
  const walnutTex = track(woodTexture("#5a3620", "#8a5a35", "#2e1a0e"));
  walnutTex.repeat.set(0.08, 0.08);
  const gold = track(new THREE.MeshStandardMaterial({ color: 0xe2c286, metalness: 1, roughness: 0.27, envMapIntensity: 1.25 }));
  const goldEdge = track(new THREE.MeshStandardMaterial({ color: 0xd8b26e, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 }));
  const graphite = track(new THREE.MeshStandardMaterial({ color: 0x2b2e34, metalness: 0.8, roughness: 0.34, envMapIntensity: 1.1 }));
  const bronze = track(new THREE.MeshStandardMaterial({ color: 0xa8743f, metalness: 0.92, roughness: 0.36 }));
  const bronzeEdge = track(new THREE.MeshStandardMaterial({ color: 0xc89a5e, metalness: 0.85, roughness: 0.3 }));
  const walnut = track(new THREE.MeshStandardMaterial({ map: walnutTex, color: 0xffffff, metalness: 0, roughness: 0.58 }));
  const endGrain = track(new THREE.MeshStandardMaterial({ color: 0xc9a36b, metalness: 0, roughness: 0.75 }));
  const cadBlue = track(new THREE.LineBasicMaterial({ color: 0x5f7fd9, transparent: true, opacity: 0.85 }));
  const cadGold = track(new THREE.LineBasicMaterial({ color: 0xe6c88c, transparent: true, opacity: 0.95 }));

  // ---- the title: "Hinge" gold; "Lab" graphite faces with gold bevels and sides
  const extrude = { depth: 2.2, bevelEnabled: true, bevelThickness: 0.38, bevelSize: 0.26, bevelSegments: 3, curveSegments: 6 };
  const title = new THREE.Group();
  const hingeGeo = track(new THREE.ExtrudeGeometry(TITLE.hinge.map(toShape), extrude));
  const labGeo = track(new THREE.ExtrudeGeometry(TITLE.lab.map(toShape), extrude));
  const hingeMesh = new THREE.Mesh(hingeGeo, [gold, goldEdge]);
  const labMesh = new THREE.Mesh(labGeo, [graphite, goldEdge]);
  for (const m of [hingeMesh, labMesh]) { m.position.z = -1.1; title.add(m); }
  scene.add(title);
  const titleFade = fader(title);

  // ---- the box: walls with interlocking fingers, a bottom and a lid
  const S = 12, T = 1;
  const box = new THREE.Group();
  box.position.set(-39, 16, -9);
  box.rotation.set(0.42, 0.62, 0);
  box.scale.setScalar(0.85);
  const wallGeoA = track(new THREE.ExtrudeGeometry(fingerWall(S, T, 5, true), { depth: T, bevelEnabled: false }));
  const wallGeoB = track(new THREE.ExtrudeGeometry(fingerWall(S, T, 5, false), { depth: T, bevelEnabled: false }));
  wallGeoA.translate(0, 0, -T / 2); wallGeoB.translate(0, 0, -T / 2);
  const plateGeo = track(new THREE.BoxGeometry(S - 2 * T, T, S - 2 * T));
  const lidGeo = track(new THREE.BoxGeometry(S + 0.6, T, S + 0.6));
  const pieceMat = [walnut, endGrain];
  interface Piece { obj: THREE.Object3D; home: THREE.Vector3; homeRot: THREE.Euler; from: THREE.Vector3; fromRot: THREE.Euler; delay: number; lines: THREE.LineSegments; solid: THREE.Mesh }
  const pieces: Piece[] = [];
  const addPiece = (geo: THREE.BufferGeometry, mats: THREE.Material | THREE.Material[], pos: THREE.Vector3, rot: THREE.Euler, dir: THREE.Vector3, delay: number) => {
    const g = new THREE.Group();
    const solid = new THREE.Mesh(geo, Array.isArray(mats) ? mats.map((m) => m.clone()) : mats.clone());
    for (const m of Array.isArray(solid.material) ? solid.material : [solid.material]) track(m);
    solid.castShadow = true;
    const lines = new THREE.LineSegments(track(new THREE.EdgesGeometry(geo, 25)), track(cadGold.clone()));
    g.add(solid, lines);
    g.position.copy(pos); g.rotation.copy(rot);
    box.add(g);
    const from = pos.clone().addScaledVector(dir, 6);
    const fromRot = new THREE.Euler(rot.x + dir.y * 0.5, rot.y + dir.x * 0.6, rot.z + dir.z * 0.4);
    pieces.push({ obj: g, home: pos.clone(), homeRot: rot.clone(), from, fromRot, delay, lines, solid });
  };
  const h = S / 2 - T / 2;
  addPiece(plateGeo, pieceMat, new THREE.Vector3(0, -S / 2 + T / 2, 0), new THREE.Euler(), new THREE.Vector3(0, -1, 0), 0);
  addPiece(wallGeoA, pieceMat, new THREE.Vector3(0, 0, h), new THREE.Euler(), new THREE.Vector3(0, 0, 1), 0.08);
  addPiece(wallGeoA, pieceMat, new THREE.Vector3(0, 0, -h), new THREE.Euler(), new THREE.Vector3(0, 0, -1), 0.16);
  addPiece(wallGeoB, pieceMat, new THREE.Vector3(h, 0, 0), new THREE.Euler(0, Math.PI / 2, 0), new THREE.Vector3(1, 0, 0), 0.24);
  addPiece(wallGeoB, pieceMat, new THREE.Vector3(-h, 0, 0), new THREE.Euler(0, Math.PI / 2, 0), new THREE.Vector3(-1, 0, 0), 0.32);
  addPiece(lidGeo, pieceMat, new THREE.Vector3(0, S / 2 + T / 2 + 0.05, 0), new THREE.Euler(), new THREE.Vector3(0, 1.1, 0), 0.44);
  scene.add(box);

  // ---- the mandala panel: bronze, a slow turn into view
  const mandala = new THREE.Group();
  const mGeo = track(new THREE.ExtrudeGeometry(mandalaShape(8.5), { depth: 0.9, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2, curveSegments: 10 }));
  mGeo.translate(0, 0, -0.45);
  const mMesh = new THREE.Mesh(mGeo, [bronze, bronzeEdge]);
  mMesh.castShadow = true;
  mandala.add(mMesh);
  mandala.position.set(36, 15.5, -12);
  scene.add(mandala);
  const mandalaFade = fader(mandala);

  // ---- the technical drawing: a wall's outline with dimension lines, drawing itself in
  const cad = new THREE.Group();
  const seg: number[] = [];
  const wall = fingerWall(14, 1.2, 5, true).getPoints();
  for (let i = 0; i < wall.length; i++) { const a = wall[i], b = wall[(i + 1) % wall.length]; seg.push(a.x, a.y, 0, b.x, b.y, 0); }
  const dim = (x0: number, y0: number, x1: number, y1: number, off: number, vertical: boolean) => {
    const [ox, oy] = vertical ? [off, 0] : [0, off];
    seg.push(x0 + ox, y0 + oy, 0, x1 + ox, y1 + oy, 0, x0, y0, 0, x0 + ox * 1.15, y0 + oy * 1.15, 0, x1, y1, 0, x1 + ox * 1.15, y1 + oy * 1.15, 0);
    // arrow heads
    const ax = vertical ? 0 : 0.5, ay = vertical ? 0.5 : 0;
    seg.push(x0 + ox, y0 + oy, 0, x0 + ox + ax + (vertical ? 0.3 : 0), y0 + oy + ay + (vertical ? 0 : 0.3), 0, x1 + ox, y1 + oy, 0, x1 + ox - ax - (vertical ? 0.3 : 0), y1 + oy - ay - (vertical ? 0 : 0.3), 0);
  };
  dim(-7, -7, 7, -7, -2.2, false);
  dim(7, -7, 7, 7, 2.6, true);
  // a centre mark and a hole circle
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2, b = ((i + 1) / 24) * Math.PI * 2; seg.push(Math.cos(a) * 2, Math.sin(a) * 2, 0, Math.cos(b) * 2, Math.sin(b) * 2, 0); }
  seg.push(-3, 0, 0, 3, 0, 0, 0, -3, 0, 0, 3, 0);
  const cadGeo = track(new THREE.BufferGeometry());
  cadGeo.setAttribute("position", new THREE.Float32BufferAttribute(seg, 3));
  const cadLines = new THREE.LineSegments(cadGeo, cadBlue);
  cad.add(cadLines);
  // a faint grid under the drawing
  const grid = new THREE.GridHelper(26, 13, 0x3a4f8f, 0x2a3a6a);
  grid.rotation.x = Math.PI / 2;
  (grid.material as THREE.Material).transparent = true;
  track(grid.geometry); track(grid.material as THREE.Material);
  cad.add(grid);
  cad.position.set(0, -17.5, -22);
  cad.rotation.set(-0.5, 0, 0.04);
  scene.add(cad);
  const cadSegCount = seg.length / 6;

  // ---- joints: a dovetail pair and a finger corner, small and precise
  const joints = new THREE.Group();
  const [tail, pin] = dovetailPieces(4, 3);
  const jg = (s: THREE.Shape) => { const g = track(new THREE.ExtrudeGeometry(s, { depth: 0.8, bevelEnabled: false })); g.translate(0, 0, -0.4); return g; };
  const tailM = new THREE.Mesh(jg(tail), pieceMat), pinM = new THREE.Mesh(jg(pin), pieceMat);
  tailM.position.set(-44, -10.5, -4); tailM.rotation.set(0.3, 0.5, -0.2);
  pinM.position.set(-40.5, -15, -6); pinM.rotation.set(0.25, 0.4, 0.15);
  const corner = new THREE.Mesh(track(new THREE.ExtrudeGeometry(fingerWall(5, 0.8, 5, true), { depth: 0.8, bevelEnabled: false })), pieceMat);
  corner.position.set(43, -11.5, -5); corner.rotation.set(0.35, -0.6, 0.12);
  const corner2 = new THREE.Mesh(track(new THREE.ExtrudeGeometry(fingerWall(5, 0.8, 5, false), { depth: 0.8, bevelEnabled: false })), pieceMat);
  corner2.position.set(40, -15.5, -8); corner2.rotation.set(0.3, 0.9, -0.1);
  for (const m of [tailM, pinM, corner, corner2]) { m.castShadow = true; joints.add(m); }
  scene.add(joints);
  const jointsFade = fader(joints);
  const jointsHome = joints.children.map((c) => c.position.clone());

  // ---- the laser: a fine gold beam onto the mandala, a glow where it cuts, a few sparks
  const dot = track(dotTexture());
  const beamGeo = track(new THREE.CylinderGeometry(0.07, 0.07, 1, 8, 1, true));
  const beamMat = track(new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const beam = new THREE.Mesh(beamGeo, beamMat);
  scene.add(beam);
  const glowMat = track(new THREE.SpriteMaterial({ map: dot, color: 0xffe3a6, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(3.2);
  scene.add(glow);

  // ---- particles: fine gold dust drifting up
  const N = 170;
  const pPos = new Float32Array(N * 3), pSeed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * 110; pPos[i * 3 + 1] = (Math.random() - 0.5) * 60; pPos[i * 3 + 2] = -24 + Math.random() * 30;
    pSeed[i] = Math.random();
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = track(new THREE.PointsMaterial({ map: dot, size: 0.9, sizeAttenuation: true, color: 0xf2d39a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const points = new THREE.Points(pGeo, pMat);
  scene.add(points);
  const pBase = pPos.slice();

  // ---- size: keep the title about 70 % of the width on any window shape
  const root = new THREE.Group();
  scene.add(root);
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the composition spans about 104 × 56 units; fit both
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, 0, Math.max(56 / 2 / tan, 104 / 2 / (tan * camera.aspect)) + 4);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // ---- timeline
  let raf = 0, last = performance.now(), t = opts.still ? PH.reveal : 0, speed = 1;
  let isReady = false, exiting = false, exitAt = 0, held = false, done = false;
  const EXIT = 0.4;

  function pose(time: number, idle: number) {
    // 1. introduction
    const intro = easeOut(span(time, 0, PH.intro + 0.35));
    titleFade.set(intro);
    title.position.z = -10 * (1 - intro);
    title.scale.set(1, 1, 0.25 + 0.75 * intro);
    title.rotation.x = 0.18 * (1 - intro) + Math.sin(idle * 0.6) * 0.012;
    title.rotation.y = Math.sin(idle * 0.45) * 0.03;
    key.intensity = 0.6 + 1.8 * intro;
    pMat.opacity = 0.75 * easeOut(span(time, 0, PH.intro));
    // drawing lines draw themselves, then stay faint
    cadGeo.setDrawRange(0, Math.ceil(cadSegCount * easeOut(span(time, 0.05, 1.1))) * 2);
    cadBlue.opacity = 0.85 - 0.45 * span(time, 1.6, 2.4);
    (grid.material as THREE.LineBasicMaterial).opacity = 0.22 * easeOut(span(time, 0.1, 0.8)) - 0.1 * span(time, 1.6, 2.4);

    // 2. assembly: pieces slide in one after another; outlines turn into wood
    for (const p of pieces) {
      const k = easeBack(span(time, PH.intro + p.delay, PH.intro + p.delay + 0.75));
      p.obj.position.lerpVectors(p.from, p.home, k);
      p.obj.rotation.set(p.fromRot.x + (p.homeRot.x - p.fromRot.x) * k, p.fromRot.y + (p.homeRot.y - p.fromRot.y) * k, p.fromRot.z + (p.homeRot.z - p.fromRot.z) * k);
      const solid = easeInOut(span(time, PH.intro + p.delay + 0.25, PH.intro + p.delay + 0.95));
      for (const m of Array.isArray(p.solid.material) ? p.solid.material : [p.solid.material]) { m.opacity = solid; m.visible = solid > 0.01; }
      (p.lines.material as THREE.LineBasicMaterial).opacity = 0.95 * easeOut(span(time, 0.1, 0.5)) * (1 - 0.85 * solid);
    }
    box.rotation.y = 0.62 + 0.25 * easeOut(span(time, 0.6, 2.6)) + Math.sin(idle * 0.5) * 0.04;
    box.position.y = 16 + Math.sin(idle * 0.9) * 0.35;

    const mIn = easeOut(span(time, PH.intro, PH.assembly));
    mandalaFade.set(mIn);
    mandala.rotation.set(-0.15 + 0.3 * (1 - mIn), -0.55 - 0.9 * (1 - mIn) + Math.sin(idle * 0.4) * 0.05, 0.25 * (1 - mIn) + idle * 0.05);
    mandala.position.y = 15.5 + Math.sin(idle * 0.8 + 1) * 0.35;

    const jIn = easeOut(span(time, 0.9, 2.0));
    jointsFade.set(jIn);
    joints.children.forEach((c, i) => { c.position.copy(jointsHome[i]); c.position.y += (1 - jIn) * -4 + Math.sin(idle * 0.9 + i) * 0.25; });

    // the laser cuts across the mandala during the assembly
    const beamOn = span(time, 0.8, 0.95) * (1 - span(time, 1.6, 1.8));
    const target = new THREE.Vector3(36 + Math.cos(time * 4) * 3.2, 15.5 + Math.sin(time * 4) * 3.2, -11.4);
    const top = new THREE.Vector3(target.x - 4, 34, target.z + 6);
    beam.position.copy(top).add(target).multiplyScalar(0.5);
    beam.scale.set(1, top.distanceTo(target), 1);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(target).normalize());
    beamMat.opacity = 0.75 * beamOn;
    glow.position.copy(target);
    glowMat.opacity = beamOn * (0.75 + 0.25 * Math.sin(time * 40));

    // 3. reveal: a soft light sweeps across the title
    const sw = span(time, PH.assembly, PH.reveal);
    const hold = held ? (idle % 3.2) / 3.2 : 0;
    const s = held ? hold : sw;
    sweep.position.set(-46 + 92 * easeInOut(s), 3, 13);
    sweep.intensity = (held ? 160 : 320) * Math.sin(Math.PI * s);

    // particles drift up and wrap
    const pos = pGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < N; i++) {
      const y = pBase[i * 3 + 1] + idle * (1.2 + pSeed[i] * 1.6);
      pos.array[i * 3 + 1] = ((y + 30) % 60 + 60) % 60 - 30;
      pos.array[i * 3] = pBase[i * 3] + Math.sin(idle * 0.7 + pSeed[i] * 9) * 0.6;
    }
    pos.needsUpdate = true;
  }

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!Number.isNaN(fixedT)) t = fixedT;
    else if (!opts.still) t += dt * speed;
    const idle = (now - start) / 1000;
    if (!exiting && Number.isNaN(fixedT)) {
      if (t >= PH.reveal) {
        t = PH.reveal;
        if (isReady) { exiting = true; exitAt = now; opts.onExitStart?.(); }
        else if (!held) { held = true; opts.onHold?.(); }
      }
    }
    pose(t, opts.still ? 0 : idle);
    if (debug) (window as unknown as { __hlSplash?: object }).__hlSplash = { t, held, exiting, wall: (now - start) / 1000 };
    if (exiting) {
      const e = easeInOut(clamp01((now - exitAt) / 1000 / EXIT));
      const k = 1 - 0.08 * e;
      scene.scale.setScalar(k);
      canvas.style.opacity = String(1 - e);
      if (e >= 1 && !done) { done = true; renderer.render(scene, camera); opts.onDone?.(); return; }
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  const start = performance.now();
  const debug = typeof location !== "undefined" && location.search.includes("splash-debug");
  // splash-t=<seconds> freezes the timeline there (to inspect a frame)
  const fixedT = debug ? Number(new URLSearchParams(location.search).get("splash-t") ?? NaN) : NaN;
  raf = requestAnimationFrame(frame);

  return {
    ready() {
      if (isReady) return;
      isReady = true;
      // early: run the rest of the reveal a little faster rather than cutting it
      if (t < PH.reveal) speed = t < PH.intro ? 1.7 : 1.4;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
        for (const mm of mats) mm.dispose();
      });
      for (const d of disposables) d.dispose();
      renderer.forceContextLoss();
    },
  };
}

/** WebGL is there and works (a fresh context can be made). */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") ?? c.getContext("webgl");
    const ok = !!g;
    (g as WebGLRenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
    return ok;
  } catch { return false; }
}
