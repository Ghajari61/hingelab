/**
 * Listing photos: a still of the 3D model at a chosen angle, on a chosen background, at a size that
 * suits Etsy or Instagram. Rendered on this device and downloaded as a PNG.
 */
import { useEffect, useRef, useState } from "react";
import { Download, X } from "lucide-react";

export type ShotDir = [number, number, number] | null;
/** Renders the model alone (no grids or labels) on a transparent background, `w` × `h` px. */
export type Shoot = (dir: ShotDir, w: number, h: number) => HTMLCanvasElement | null;

export const SHOT_ANGLES: { id: string; name: string; dir: ShotDir }[] = [
  { id: "three-quarter", name: "Three-quarter", dir: [0.95, 0.85, 1.35] },
  { id: "front", name: "Front", dir: [0, 0.18, 1] },
  { id: "low", name: "Low angle", dir: [0.7, 0.22, 1.2] },
  { id: "side", name: "Side", dir: [1, 0.25, 0.08] },
  { id: "top", name: "Top down", dir: [0, 1, 0.002] },
  { id: "view", name: "As in the 3D view", dir: null },
];

export const SHOT_SIZES: { id: string; name: string; w: number; h: number }[] = [
  { id: "sq2000", name: "Square 2000 × 2000 (Etsy)", w: 2000, h: 2000 },
  { id: "land", name: "Landscape 2000 × 1500 (Etsy)", w: 2000, h: 1500 },
  { id: "sq1080", name: "Square 1080 × 1080 (Instagram)", w: 1080, h: 1080 },
  { id: "port", name: "Portrait 1080 × 1350 (Instagram)", w: 1080, h: 1350 },
];

export type ShotBackground = "white" | "grey" | "linen" | "slate" | "wood" | "none";
export const SHOT_BACKGROUNDS: { id: ShotBackground; name: string }[] = [
  { id: "white", name: "White" },
  { id: "grey", name: "Soft grey" },
  { id: "linen", name: "Linen" },
  { id: "wood", name: "Wooden desk" },
  { id: "slate", name: "Dark slate" },
  { id: "none", name: "Transparent" },
];

/** A small deterministic random, so the wood grain is the same in every photo. */
function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function paintBackground(g: CanvasRenderingContext2D, bg: ShotBackground, w: number, h: number) {
  if (bg === "none") return;
  if (bg === "white") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, w, h); return; }
  const radial = (inner: string, outer: string) => {
    const r = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.hypot(w, h) * 0.62);
    r.addColorStop(0, inner);
    r.addColorStop(1, outer);
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  };
  if (bg === "grey") { radial("#f6f6f4", "#d9d9d5"); return; }
  if (bg === "slate") { radial("#454b55", "#1d2026"); return; }
  if (bg === "linen") {
    radial("#f5f0e8", "#e0d6c6");
    const r = rand(7);
    g.globalAlpha = 0.05;
    g.fillStyle = "#6b5a40";
    for (let y = 0; y < h; y += 3) if (r() < 0.5) g.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 3) if (r() < 0.5) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1;
    return;
  }
  // Wooden desk: a light oak top with running grain.
  const lin = g.createLinearGradient(0, 0, 0, h);
  lin.addColorStop(0, "#d9b48a");
  lin.addColorStop(1, "#bf935f");
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  const r = rand(11);
  g.lineWidth = Math.max(1, w / 900);
  for (let i = 0; i < 90; i++) {
    const y0 = r() * h, amp = 4 + r() * 18, k = 0.002 + r() * 0.004, ph = r() * 6.28;
    g.strokeStyle = r() < 0.5 ? "rgba(120, 78, 38, 0.16)" : "rgba(255, 236, 205, 0.14)";
    g.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = y0 + Math.sin(x * k + ph) * amp;
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(40,20,0,0.22)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
}

/** The model on its background. */
export function composeShot(shoot: Shoot, dir: ShotDir, bg: ShotBackground, w: number, h: number) {
  const model = shoot(dir, w, h);
  if (!model) return null;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const g = out.getContext("2d");
  if (!g) return null;
  paintBackground(g, bg, w, h);
  g.drawImage(model, 0, 0, w, h);
  return out;
}

export default function ListingPhoto({ shoot, name = "hingelab", onClose }: { shoot: Shoot; name?: string; onClose: () => void }) {
  const [angle, setAngle] = useState(SHOT_ANGLES[0].id);
  const [bg, setBg] = useState<ShotBackground>("white");
  const [size, setSize] = useState(SHOT_SIZES[0].id);
  const [busy, setBusy] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const dir = SHOT_ANGLES.find((a) => a.id === angle)!.dir;
  const sz = SHOT_SIZES.find((s) => s.id === size)!;

  useEffect(() => {
    const c = preview.current;
    if (!c) return;
    const pw = 220, ph = Math.round((pw * sz.h) / sz.w);
    const shot = composeShot(shoot, dir, bg, pw * 2, ph * 2);
    c.width = pw * 2;
    c.height = ph * 2;
    c.style.width = `${pw}px`;
    c.style.height = `${ph}px`;
    const g = c.getContext("2d");
    if (g) { g.clearRect(0, 0, c.width, c.height); if (shot) g.drawImage(shot, 0, 0); }
  }, [shoot, dir, bg, sz]);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("select")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const t = e.target as Node | null;
      if (t && t !== document.body && !box.current?.contains(t) && (t as Element).closest?.("[role=dialog]")) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);

  const download = () => {
    if (busy) return;
    setBusy(true);
    window.setTimeout(() => {
      const shot = composeShot(shoot, dir, bg, sz.w, sz.h);
      if (!shot) { setBusy(false); return; }
      shot.toBlob((blob) => {
        setBusy(false);
        if (!blob) return;
        const a = document.createElement("a");
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `${name}-${angle}-${sz.w}x${sz.h}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
      }, "image/png");
    }, 30);
  };

  return (
    <div className="v3-photo" role="dialog" aria-label="Listing photo" ref={box} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); onClose(); } }}>
      <header>Listing photo<button type="button" aria-label="Close listing photo" onClick={onClose}><X size={14} aria-hidden /></button></header>
      <canvas ref={preview} className="v3-photo-prev" aria-label="Preview of the listing photo" role="img" />
      <label>Angle
        <select value={angle} onChange={(e) => setAngle(e.target.value)}>
          {SHOT_ANGLES.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label>Background
        <select value={bg} onChange={(e) => setBg(e.target.value as ShotBackground)}>
          {SHOT_BACKGROUNDS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>Size
        <select value={size} onChange={(e) => setSize(e.target.value)}>
          {SHOT_SIZES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <button type="button" className="v3-photo-go" aria-disabled={busy} onClick={download}><Download size={14} aria-hidden />{busy ? "Rendering…" : "Download PNG"}</button>
      <p>Made on this device. The material look and display mode of the 3D view are used.</p>
    </div>
  );
}
