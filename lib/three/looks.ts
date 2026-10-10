/**
 * Material looks for the 3D views: plywood, MDF, card and acrylic. Textures are drawn on a canvas
 * the first time they are needed, so this module also loads in Node (tests get plain colours).
 */
import * as THREE from "three";

export type LookId = "wood" | "mdf" | "card" | "acrylic";

export const LOOKS: Record<LookId, { name: string; color: string; roughness: number; opacity: number }> = {
  wood: { name: "Plywood", color: "#d9b07a", roughness: 0.78, opacity: 1 },
  mdf: { name: "MDF", color: "#a9845c", roughness: 0.92, opacity: 1 },
  card: { name: "Card", color: "#b9a78e", roughness: 1, opacity: 1 },
  acrylic: { name: "Acrylic", color: "#cfe6f2", roughness: 0.08, opacity: 0.55 },
};

/** The look for a material preset id (Hinge Box and Letters share the ids). */
export function lookOf(materialId: string): LookId {
  if (/^acr/.test(materialId)) return "acrylic";
  if (/^mdf/.test(materialId)) return "mdf";
  if (/^card/.test(materialId)) return "card";
  return "wood";
}

const textures = new Map<LookId, THREE.Texture | null>();

function grain(look: LookId): THREE.Texture | null {
  if (textures.has(look)) return textures.get(look)!;
  let tex: THREE.Texture | null = null;
  if (typeof document !== "undefined" && look !== "acrylic") {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 256);
      // Deterministic pseudo-random so every load looks the same.
      let seed = look === "wood" ? 7 : look === "mdf" ? 11 : 13;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      if (look === "wood") {
        // Whole waves across the tile and copies above and below keep the texture seamless.
        for (let i = 0; i < 70; i++) {
          const y = rnd() * 256, a = 0.03 + rnd() * 0.07, w = 0.6 + rnd() * 2.4, amp = 2 + rnd() * 5, f = 1 + Math.floor(rnd() * 3), ph = rnd() * Math.PI * 2;
          g.strokeStyle = `rgba(110,70,30,${a})`;
          g.lineWidth = w;
          for (const dy of [-256, 0, 256]) {
            g.beginPath();
            for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + dy + Math.sin((x / 256) * Math.PI * 2 * f + ph) * amp);
            g.stroke();
          }
        }
      } else {
        const img = g.getImageData(0, 0, 256, 256);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = 255 - Math.floor(rnd() * (look === "mdf" ? 26 : 40));
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        }
        g.putImageData(img, 0, 0);
      }
      tex = new THREE.CanvasTexture(c);
      tex.userData.shared = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      // UVs of extruded parts are in mm: one tile every 120 mm.
      tex.repeat.set(1 / 120, 1 / 120);
    }
  }
  textures.set(look, tex);
  return tex;
}

/** A material in the look. `tint` multiplies the colour (darker lids, lips); vertex colours are kept where the geometry has them. */
export function lookMaterial(look: LookId, opts: { tint?: number; vertexColors?: boolean; vertexBase?: string; textured?: boolean } = {}): THREE.Material {
  const L = LOOKS[look];
  const color = new THREE.Color(L.color).multiplyScalar(opts.tint ?? 1);
  if (opts.vertexColors) {
    // Vertex colours already carry the plain colour `vertexBase`: scale them so plain reads as the look.
    const b = new THREE.Color(opts.vertexBase ?? "#ffffff");
    color.setRGB(Math.min(2, color.r / Math.max(0.05, b.r)), Math.min(2, color.g / Math.max(0.05, b.g)), Math.min(2, color.b / Math.max(0.05, b.b)));
  }
  const map = opts.textured === false ? null : grain(look);
  if (look === "acrylic") {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: L.roughness, metalness: 0, transparent: true, opacity: L.opacity, clearcoat: 1, clearcoatRoughness: 0.1,
      vertexColors: !!opts.vertexColors, side: THREE.DoubleSide, depthWrite: false,
    });
  }
  return new THREE.MeshStandardMaterial({ color, roughness: L.roughness, metalness: 0, map, vertexColors: !!opts.vertexColors, side: THREE.DoubleSide });
}

/**
 * Give every mesh in the tree the look, keeping its tint (userData.tint) and vertex colours.
 * Meshes marked userData.keepMaterial (cut lines, overlays) are left alone.
 */
export function applyLook(root: THREE.Object3D, look: LookId) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.keepMaterial) return;
    const old = m.material as THREE.Material;
    if (old.userData.look === look) return;
    m.material = lookMaterial(look, {
      tint: m.userData.tint as number | undefined,
      vertexColors: !!m.geometry.getAttribute("color"),
      vertexBase: m.userData.vertexBase as string | undefined,
      textured: !!m.geometry.getAttribute("uv"),
    });
    m.material.userData.look = look;
    old.dispose();
    m.castShadow = look !== "acrylic";
    m.receiveShadow = true;
  });
}
