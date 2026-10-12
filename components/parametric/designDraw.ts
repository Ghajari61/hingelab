import type { PreviewData } from "@/lib/parametric/designPreview";

const WOOD = [201, 163, 106];
const LIGHT = (() => { const v = [-0.55, 0.6, 1]; const l = Math.hypot(...v); return v.map((c) => c / l); })();

/** Draws a generator preview: a hill-shaded height map with the cut lines on top, or the fins of a clock. */
export function drawPreview(canvas: HTMLCanvasElement, data: PreviewData | null, dark: boolean) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!data) return;
  const pad = 10;
  const [ew, eh] = data.kind === "field" ? [data.w, data.h] : [2 * data.extent, 2 * data.extent];
  const k = Math.min((W - 2 * pad) / ew, (H - 2 * pad) / eh);
  const ox = (W - ew * k) / 2, oy = (H - eh * k) / 2;
  const x0 = data.kind === "field" ? data.x0 : -data.extent, y0 = data.kind === "field" ? data.y0 : -data.extent;
  const px = (x: number) => ox + (x - x0) * k, py = (y: number) => oy + eh * k - (y - y0) * k;
  const ink = dark ? "rgba(255, 240, 220, .42)" : "rgba(60, 40, 15, .5)";

  if (data.kind === "field") {
    const { nx, ny, z, lo, hi, levels } = data;
    const stride = nx + 1, dx = data.w / nx, dy = data.h / ny;
    const at = (i: number, j: number) => {
      const v = z[Math.min(ny, Math.max(0, j)) * stride + Math.min(nx, Math.max(0, i))];
      return levels && Number.isFinite(v) ? Math.floor((v - lo) / levels) * levels + lo : v;
    };
    const img = new ImageData(stride, ny + 1);
    const exaggerate = Math.max(1, Math.min(4, (0.12 * Math.max(data.w, data.h)) / Math.max(1e-6, hi - lo)));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const v = at(i, j);
      const o = ((ny - j) * stride + i) * 4;
      if (!Number.isFinite(v)) continue;
      const l = at(i - 1, j), r = at(i + 1, j), b = at(i, j - 1), t = at(i, j + 1);
      const gx = ((Number.isFinite(r) ? r : v) - (Number.isFinite(l) ? l : v)) / (2 * dx) * exaggerate;
      const gy = ((Number.isFinite(t) ? t : v) - (Number.isFinite(b) ? b : v)) / (2 * dy) * exaggerate;
      const nl = Math.hypot(gx, gy, 1);
      const shade = Math.max(0, (-gx * LIGHT[0] - gy * LIGHT[1] + LIGHT[2]) / nl);
      const h = (v - lo) / Math.max(1e-6, hi - lo);
      const f = 0.35 + 0.75 * shade * (0.75 + 0.25 * h);
      img.data[o] = Math.min(255, WOOD[0] * f);
      img.data[o + 1] = Math.min(255, WOOD[1] * f);
      img.data[o + 2] = Math.min(255, WOOD[2] * f);
      img.data[o + 3] = 255;
    }
    const off = document.createElement("canvas");
    off.width = stride; off.height = ny + 1;
    off.getContext("2d")!.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(off, ox, oy, ew * k, eh * k);
  } else if (data.outline) {
    g.setLineDash([4, 4]);
    g.strokeStyle = ink;
    g.lineWidth = 1;
    g.beginPath();
    data.outline.forEach(([x, y], i) => (i ? g.lineTo(px(x), py(y)) : g.moveTo(px(x), py(y))));
    g.closePath();
    g.stroke();
    g.setLineDash([]);
  }

  g.lineCap = "round";
  if (data.kind === "lines") {
    g.strokeStyle = `rgb(${WOOD.join(",")})`;
    g.lineWidth = Math.max(1.5, Math.min(4, k * 3));
  } else {
    g.strokeStyle = ink;
    g.lineWidth = 1;
  }
  g.beginPath();
  for (const [a, b, c, d] of data.segs) { g.moveTo(px(a), py(b)); g.lineTo(px(c), py(d)); }
  g.stroke();
}
