import * as THREE from 'three';
import type { FlatPart } from './flat';

/** Display the actual exported operations, including vector labels and embedded engraving images.
 * Only HingeLab-generated SVGs belong here; this is not an arbitrary SVG importer. */
export function flatArtworkSVG(svg: string, parts: FlatPart[], width: number, height: number) {
  const body = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'));
  const path = (points: [number, number][]) => `M${points.map(p => p.join(' ')).join('L')}Z`;
  // Clip each solid separately: nested pieces must not XOR one another out. Mixed stock gets
  // one overlay per thickness, so markings sit on the correct surface instead of floating.
  const clip = parts.map(p => `<path clip-rule="evenodd" d="${[p.outer, ...p.holes].map(path).join(' ')}"/>`).join('');
  const scale = Math.min(8, 4096 / width, 4096 / height);
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${Math.max(2, Math.round(width * scale))}" height="${Math.max(2, Math.round(height * scale))}" viewBox="0 0 ${width} ${height}">
    <defs><clipPath id="flat-stock-clip">${clip}</clipPath></defs>
    <style>[stroke]:not([stroke="none"]){stroke:#503018} [fill]:not([fill="none"]){fill:#503018}</style>
    <g clip-path="url(#flat-stock-clip)">${body}</g></svg>`;
}

export function flatArtwork(svg: string, parts: FlatPart[], T: number, width: number, height: number) {
  const group = new THREE.Group();
  if (typeof Image === 'undefined' || width <= 0 || height <= 0) return { group, ready: Promise.resolve() };
  const stocks = new Map<number, FlatPart[]>();
  for (const p of parts) { const t = p.t ?? T; if (!stocks.has(t)) stocks.set(t, []); stocks.get(t)!.push(p); }
  const jobs = [...stocks].map(([t, stock]) => new Promise<void>(resolve => {
    const im = new Image(), texture = new THREE.Texture(im);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    mesh.position.set(width / 2, -height / 2, t + .025);
    mesh.name = 'Cut-file markings';
    mesh.userData.keepMaterial = mesh.userData.noMeasure = mesh.userData.noPick = true;
    mesh.renderOrder = 2;
    group.add(mesh);
    const url = URL.createObjectURL(new Blob([flatArtworkSVG(svg, stock, width, height)], { type: 'image/svg+xml' }));
    let disposed = false;
    const release = () => { URL.revokeObjectURL(url); resolve(); };
    texture.addEventListener('dispose', () => { disposed = true; im.onload = im.onerror = null; release(); });
    im.onload = () => { if (!disposed) texture.needsUpdate = true; release(); };
    im.onerror = release;
    im.src = url;
  }));
  return { group, ready: Promise.all(jobs) };
}
