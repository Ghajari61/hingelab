"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { LetterModel, LetterParams } from "@/lib/letters";
import { buildLetterScene, type LetterScene } from "@/lib/letters/scene3d";

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  render: () => void;
}

/** The assembled letters in three.js: drag to orbit, scroll to zoom. Renders only when something changes. */
export default function LetterPreview3D({ model, params, explode }: { model: LetterModel | null; params: LetterParams; explode: number }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<Stage | null>(null);
  const shown = useRef<LetterScene | null>(null);
  const framed = useRef<string>("");
  const [noGL, setNoGL] = useState(false);

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
    el.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3226, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(0.6, 1, 0.8);
    scene.add(sun);
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 20000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;
    const render = () => renderer.render(scene, camera);
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
    stage.current = { renderer, scene, camera, controls, render };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      shown.current?.dispose();
      shown.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      stage.current = null;
      framed.current = "";
    };
  }, []);

  useEffect(() => {
    const st = stage.current;
    if (!st) return;
    if (shown.current) {
      st.scene.remove(shown.current.group);
      shown.current.dispose();
      shown.current = null;
    }
    if (model) {
      const sc = buildLetterScene(model, params, explode);
      st.scene.add(sc.group);
      shown.current = sc;
      // reframe when the text, mode or size changes, not while the lid is lifted or a setting is scrubbed
      const key = `${params.text}|${params.mode}|${params.fontId}|${Math.round(params.size)}`;
      if (key !== framed.current) {
        framed.current = key;
        const r = Math.hypot(...sc.size) / 2 || 100;
        const dist = r / Math.sin(THREE.MathUtils.degToRad(st.camera.fov / 2)) * 0.9;
        st.camera.position.set(0, dist * 0.55, dist * 0.84);
        st.camera.near = dist / 100;
        st.camera.far = dist * 10;
        st.camera.updateProjectionMatrix();
        st.controls.target.set(0, sc.size[1] / 2, 0);
        st.controls.update();
      }
    }
    st.render();
  }, [model, params, explode]);

  return (
    <div ref={host} id="preview3d" className="p3d" aria-label="Assembled letters preview, drag to rotate">
      {noGL ? <span className="note">3D preview needs WebGL, which this browser has turned off.</span> : null}
      <span className="hint3d">Drag to rotate · scroll to zoom</span>
    </div>
  );
}
