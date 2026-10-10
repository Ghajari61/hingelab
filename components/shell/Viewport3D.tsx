"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { Box, Maximize } from "lucide-react";
import { applyLook, type LookId } from "@/lib/three/looks";
import type { Scene3D } from "@/lib/three/flat";

type ViewName = "persp" | "top" | "front" | "side" | "back" | "left";
const DIRS: Record<ViewName, [number, number, number]> = {
  persp: [0.95, 0.85, 1.35],
  top: [0, 1, 0.0008],
  front: [0, 0.0008, 1],
  side: [1, 0.0008, 0],
  back: [0, 0.0008, -1],
  left: [-1, 0.0008, 0],
};

const FACES: { name: string; view: ViewName | null; pos: [number, number, number]; rot: [number, number, number] }[] = [
  { name: "Front", view: "front", pos: [0, 0, 1], rot: [0, 0, 0] },
  { name: "Back", view: "back", pos: [0, 0, -1], rot: [0, Math.PI, 0] },
  { name: "Right", view: "side", pos: [1, 0, 0], rot: [0, Math.PI / 2, 0] },
  { name: "Left", view: "left", pos: [-1, 0, 0], rot: [0, -Math.PI / 2, 0] },
  { name: "Top", view: "top", pos: [0, 1, 0], rot: [-Math.PI / 2, 0, 0] },
  { name: "Bottom", view: null, pos: [0, -1, 0], rot: [Math.PI / 2, 0, 0] },
];
const CUBE = 54;

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

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  sun: THREE.DirectionalLight;
  ground: THREE.Mesh;
  grid: THREE.GridHelper | null;
  render: () => void;
  anim: number;
}

/**
 * The shared 3D stage: perspective camera over a ground plane, orbit (drag), pan (right-drag or
 * Shift) and zoom (wheel), soft shadows and room lighting, material looks and a view cube.
 * It renders only when something changes. The scene is owned here once passed in: the previous
 * one is disposed when a new one arrives.
 */
export default function Viewport3D({ scene, look, frameKey, label, className = "", children }: {
  scene: Scene3D | null;
  look: LookId;
  /** The camera reframes when this changes (not while a slider is scrubbed). */
  frameKey: string;
  label: string;
  className?: string;
  /** HUD controls drawn over the view (explode, lay flat). */
  children?: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const cube = useRef<HTMLDivElement>(null);
  const st = useRef<Stage | null>(null);
  const shown = useRef<Scene3D | null>(null);
  const framed = useRef("");
  const [noGL, setNoGL] = useState(false);

  const syncCube = () => {
    const s = st.current, c = cube.current;
    if (!s || !c) return;
    c.style.transform = cameraCSS(s.camera.matrixWorldInverse);
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
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
    camera.position.set(300, 260, 420);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.005;
    const render = () => { renderer.render(scene, camera); syncCube(); };
    controls.addEventListener("change", render);
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    st.current = { renderer, scene, camera, controls, sun, ground, grid: null, render, anim: 0 };
    resize();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(st.current?.anim ?? 0);
      controls.dispose();
      if (shown.current) { scene.remove(shown.current.group); shown.current.dispose(); shown.current = null; }
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      st.current?.grid?.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      st.current = null;
      framed.current = "";
    };
  }, []);

  /** Bounding sphere of the shown model (or a default when empty). */
  const bounds = () => {
    const g = shown.current?.group;
    const box = g ? new THREE.Box3().setFromObject(g) : new THREE.Box3();
    if (box.isEmpty()) return { c: new THREE.Vector3(), r: 100, box };
    return { c: box.getCenter(new THREE.Vector3()), r: Math.max(10, box.getSize(new THREE.Vector3()).length() / 2), box };
  };

  const fitDistance = (r: number) => {
    const s = st.current!;
    const fov = THREE.MathUtils.degToRad(s.camera.fov / 2);
    const fovH = Math.atan(Math.tan(fov) * s.camera.aspect);
    return (r / Math.sin(Math.min(fov, fovH))) * 1.08;
  };

  /** Move the camera to look along `dir` (or keep the current direction) at the whole model. */
  const goTo = (dir: THREE.Vector3 | null, animate = true) => {
    const s = st.current;
    if (!s) return;
    const { c, r } = bounds();
    const d = (dir ?? s.camera.position.clone().sub(s.controls.target)).normalize();
    const dist = fitDistance(r);
    const toPos = c.clone().add(d.multiplyScalar(dist));
    s.camera.near = dist / 200;
    s.camera.far = dist * 20;
    s.camera.updateProjectionMatrix();
    s.controls.minDistance = r * 0.3;
    s.controls.maxDistance = dist * 6;
    cancelAnimationFrame(s.anim);
    if (!animate) {
      s.camera.position.copy(toPos);
      s.controls.target.copy(c);
      s.controls.update();
      s.render();
      return;
    }
    const fromPos = s.camera.position.clone(), fromT = s.controls.target.clone(), t0 = performance.now();
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 320), e = 1 - Math.pow(1 - k, 3);
      s.camera.position.lerpVectors(fromPos, toPos, e);
      s.controls.target.lerpVectors(fromT, c, e);
      s.controls.update();
      s.render();
      if (k < 1) s.anim = requestAnimationFrame(step);
    };
    s.anim = requestAnimationFrame(step);
  };

  /** Ground grid and shadow camera sized to the model. */
  const stageFor = () => {
    const s = st.current;
    if (!s) return;
    const { c, r } = bounds();
    const size = Math.max(200, Math.ceil((r * 6) / 100) * 100);
    s.ground.scale.set(size * 2, size * 2, 1);
    s.ground.position.set(c.x, 0, c.z);
    if (s.grid) { s.scene.remove(s.grid); s.grid.dispose(); }
    const dark = /dark/.test(document.documentElement.dataset.theme ?? "");
    const step = r > 400 ? 100 : r > 120 ? 50 : 10;
    s.grid = new THREE.GridHelper(size, Math.round(size / step), dark ? 0x4a5058 : 0xbfc3cb, dark ? 0x30353c : 0xdde0e5);
    (s.grid.material as THREE.Material).transparent = true;
    (s.grid.material as THREE.Material).opacity = 0.75;
    s.grid.position.set(c.x, 0.01, c.z);
    s.scene.add(s.grid);
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

  useEffect(() => {
    const s = st.current;
    if (!s) return;
    if (shown.current && shown.current !== scene) {
      s.scene.remove(shown.current.group);
      shown.current.dispose();
      shown.current = null;
    }
    if (scene && shown.current !== scene) {
      applyLook(scene.group, look);
      s.scene.add(scene.group);
      shown.current = scene;
    }
    if (frameKey !== framed.current && scene) {
      const first = !framed.current;
      framed.current = frameKey;
      stageFor();
      goTo(first ? new THREE.Vector3(...DIRS.persp) : null, !first);
    } else {
      s.render();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, frameKey]);

  useEffect(() => {
    if (shown.current) applyLook(shown.current.group, look);
    st.current?.render();
  }, [look]);

  // Faces of the view cube, placed once.
  useEffect(() => {
    const c = cube.current;
    if (!c) return;
    const o = new THREE.Object3D();
    c.querySelectorAll<HTMLElement>("[data-face]").forEach((el) => {
      const f = FACES.find((x) => x.name === el.dataset.face)!;
      o.position.set(...(f.pos.map((v) => (v * CUBE) / 2) as [number, number, number]));
      o.rotation.set(...f.rot);
      o.updateMatrix();
      el.style.transform = `translate(-50%, -50%) ${objectCSS(o.matrix)}`;
    });
    syncCube();
  }, []);

  const view = (v: ViewName) => goTo(new THREE.Vector3(...DIRS[v]));

  return (
    <div ref={host} id="preview3d" className={`p3d v3d ${className}`} aria-label={label}>
      {noGL ? <span className="note">3D preview needs WebGL, which this browser has turned off.</span> : null}
      <div className="vcube-wrap" aria-hidden={noGL}>
        <div className="vcube-stage">
          <div className="vcube" ref={cube}>
            {FACES.map((f) => (
              <button
                key={f.name} type="button" data-face={f.name} className="vcube-face" tabIndex={-1}
                disabled={!f.view} aria-label={f.view ? `${f.name} view` : undefined}
                onClick={() => f.view && view(f.view)}
                style={{ width: CUBE, height: CUBE }}
              >{f.name}</button>
            ))}
          </div>
        </div>
        <div className="vcube-btns" role="group" aria-label="Views">
          <button type="button" onClick={() => view("persp")} aria-label="Perspective view" title="Perspective"><Box size={14} /></button>
          <button type="button" onClick={() => view("top")} title="Top view">Top</button>
          <button type="button" onClick={() => view("front")} title="Front view">Front</button>
          <button type="button" onClick={() => view("side")} title="Side view">Side</button>
          <button type="button" onClick={() => goTo(null)} aria-label="Zoom to fit" title="Zoom to fit"><Maximize size={13} /></button>
        </div>
      </div>
      {children}
      <span className="hint3d">Drag to orbit · right-drag to pan · scroll to zoom</span>
    </div>
  );
}
