"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshData, SliceResult } from "@/lib/parametric";
import { deviationObject, disposeTree, modelObject, partsObject, planesObject } from "./scene";

export type ViewToggles = { model: boolean; planes: boolean; parts: boolean };

const SELECT_COLOR = 0x3b8ff0;

/**
 * three.js view of the source model, the slicing planes and the assembled parts. `explode` (mm)
 * pushes the parts apart along their plane normals; clicking a part reports its id.
 */
export default function Viewport3D({ mesh, result, T, show, explode = 0, heat = false, selected = [], onSelect, className = "pdbg-view" }: {
  mesh: MeshData | null;
  result: SliceResult | null;
  T: number;
  show: ViewToggles;
  explode?: number;
  /** Show the deviation samples as a heat map. */
  heat?: boolean;
  selected?: string[];
  onSelect?: (id: string | null) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; render: () => void } | null>(null);
  const layers = useRef<{ model?: THREE.Object3D; planes?: THREE.Object3D; parts?: THREE.Object3D; heat?: THREE.Object3D }>({});
  const framed = useRef("");
  const hl = useRef<THREE.MeshStandardMaterial | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x1b1e23);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(-1, 1.5, 2);
    scene.add(sun);
    const wall = new THREE.GridHelper(600, 30, 0x3a4048, 0x2a2f36);
    wall.rotation.x = Math.PI / 2;
    scene.add(wall);
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 20000);
    camera.position.set(-260, 120, 420);
    const controls = new OrbitControls(camera, renderer.domElement);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    hl.current = new THREE.MeshStandardMaterial({ color: SELECT_COLOR, roughness: 0.6, emissive: 0x0c2a55 });

    // A click (no drag) picks the nearest part under the pointer.
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
      down = null;
      const parts = layers.current.parts;
      if (!parts?.visible || !onSelectRef.current) return;
      const r = renderer.domElement.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(parts.children.filter(c => (c as THREE.Mesh).isMesh), false)[0];
      onSelectRef.current((hit?.object.userData.partId as string | undefined) ?? null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(el);
    ctx.current = { renderer, scene, camera, controls, render };
    return () => {
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const o of Object.values(layers.current)) if (o) disposeTree(o);
      layers.current = {};
      hl.current?.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      ctx.current = null;
    };
  }, []);

  const swap = (k: "model" | "planes" | "parts" | "heat", o: THREE.Object3D | undefined) => {
    const c = ctx.current;
    if (!c) return;
    const old = layers.current[k];
    if (old) { c.scene.remove(old); disposeTree(old); }
    layers.current[k] = o;
    if (o) { o.visible = k === "heat" ? heat : show[k]; c.scene.add(o); }
  };

  useEffect(() => {
    swap("heat", result ? deviationObject(result) : undefined);
    ctx.current?.render();
  }, [result]);

  useEffect(() => {
    if (layers.current.heat) layers.current.heat.visible = heat;
    ctx.current?.render();
  }, [heat]);

  useEffect(() => {
    swap("model", mesh ? modelObject(mesh) : undefined);
    ctx.current?.render();
  }, [mesh]);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    swap("planes", result ? planesObject(result) : undefined);
    if (result) {
      const { min, max } = result.bounds;
      const key = [...min, ...max].map(v => Math.round(v)).join(",");
      if (key !== framed.current) {
        framed.current = key;
        const centre = new THREE.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, Math.max(0, (min[2] + max[2]) / 2));
        const r = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
        c.controls.target.copy(centre);
        c.camera.position.copy(centre).add(new THREE.Vector3(-0.9, 0.45, 1.5).normalize().multiplyScalar(r * 3.2));
        c.controls.update();
      }
    }
    c.render();
  }, [result]);

  useEffect(() => {
    swap("parts", result ? partsObject(result, T, explode) : undefined);
    paintSelection();
    ctx.current?.render();
  }, [result, T, explode]);

  const paintSelection = () => {
    const parts = layers.current.parts;
    if (!parts || !hl.current) return;
    const set = new Set(selected);
    for (const o of parts.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      m.userData.base ??= m.material;
      m.material = set.has(m.userData.partId as string) ? hl.current : (m.userData.base as THREE.Material);
    }
  };

  useEffect(() => {
    paintSelection();
    ctx.current?.render();
  }, [selected]);

  useEffect(() => {
    for (const k of ["model", "planes", "parts"] as const) if (layers.current[k]) layers.current[k]!.visible = show[k];
    ctx.current?.render();
  }, [show]);

  return <div ref={host} className={className} data-testid="parametric-view" />;
}
