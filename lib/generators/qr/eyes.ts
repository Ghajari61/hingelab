/**
 * The three finder patterns ("eyes") of a QR code drawn in a chosen shape, like the eye frame and
 * eye ball choices of online QR designers. Scanners find a finder by the 1 : 1 : 3 : 1 : 1 run of
 * dark, light, dark, light, dark across its middle, so every shape here keeps a full-width ring one
 * module thick, a light gap one module wide and a 3-module centre on the middle row and column.
 */
import { arc, circle, reverse } from "../geom";
import type { Contour } from "../types";

export type EyeFrame = "auto" | "square" | "rounded" | "circle" | "leaf" | "cushion";
export type EyeBall = "auto" | "square" | "rounded" | "circle" | "leaf" | "diamond" | "star";

export const EYE_FRAME_NAMES: Record<EyeFrame, string> = { auto: "Match", square: "Square", rounded: "Rounded", circle: "Circle", leaf: "Leaf", cushion: "Cushion" };
export const EYE_BALL_NAMES: Record<EyeBall, string> = { auto: "Match", square: "Square", rounded: "Rounded", circle: "Circle", leaf: "Leaf", diamond: "Diamond", star: "Star" };

/** A box with its own radius at each corner: top-left, top-right, bottom-right, bottom-left (y down). */
export function cornerBox(x: number, y: number, w: number, h: number, r: [number, number, number, number]): Contour {
  const lim = Math.min(w, h) / 2;
  const [a, b, c, d] = r.map((v) => Math.max(0, Math.min(lim, v)));
  const out: Contour = [];
  const corner = (cx: number, cy: number, rr: number, a0: number, px: number, py: number) => {
    if (rr < 1e-6) out.push([px, py]);
    else out.push(...arc(cx, cy, rr, a0, a0 + Math.PI / 2));
  };
  corner(x + a, y + a, a, Math.PI, x, y);
  corner(x + w - b, y + b, b, 1.5 * Math.PI, x + w, y);
  corner(x + w - c, y + h - c, c, 0, x + w, y + h);
  corner(x + d, y + h - d, d, 0.5 * Math.PI, x, y + h);
  return out;
}

/** An outline of a box of side s in an eye shape (the frame's outer or inner edge, or the ball). */
function eyeOutline(kind: Exclude<EyeFrame | EyeBall, "auto">, x: number, y: number, s: number, m: number): Contour {
  switch (kind) {
    case "square": return cornerBox(x, y, s, s, [0, 0, 0, 0]);
    case "rounded": { const r = Math.min(s * 0.32, 2 * m); return cornerBox(x, y, s, s, [r, r, r, r]); }
    case "circle": return circle(x + s / 2, y + s / 2, s / 2);
    case "leaf": { const r = s * 0.48; return cornerBox(x, y, s, s, [r, 0, r, 0]); }
    case "cushion": { const r = s * 0.5; return cornerBox(x, y, s, s, [r * 0.25, r, r * 0.25, r]); }
    case "diamond": {
      const cx = x + s / 2, cy = y + s / 2, R = s * 0.55;
      return [[cx, cy - R], [cx + R, cy], [cx, cy + R], [cx - R, cy]];
    }
    case "star": {
      const cx = x + s / 2, cy = y + s / 2, out: Contour = [];
      for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 8, R = i % 2 ? s * 0.4 : s * 0.56; out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
      return out;
    }
  }
}

/**
 * One finder at module (r, c), module size m, grid top-left (ox, oy): the ring (outer and a reversed
 * inner contour, for a nonzero union) and the ball.
 */
export function eyeContours(r: number, c: number, m: number, frame: Exclude<EyeFrame, "auto">, ball: Exclude<EyeBall, "auto">, ox = 0, oy = 0): Contour[] {
  const x = ox + c * m, y = oy + r * m;
  // the inner edge of a frame follows its outer edge, one module in
  return [
    eyeOutline(frame, x, y, 7 * m, m),
    reverse(eyeOutline(frame, x + m, y + m, 5 * m, m * 0.7)),
    eyeOutline(ball, x + 2 * m, y + 2 * m, 3 * m, m * 0.5),
  ];
}

/**
 * Eye centres that scan reliably in each frame. Detectors also measure each eye along its diagonals,
 * where the 1 : 1 : 3 : 1 : 1 rhythm holds only when the centre's shape suits the frame's (a round
 * centre in a square frame is too short corner to corner). Found by decoding every pair at several
 * payloads, styles and resolutions; the other pairs failed some of them.
 */
export const EYE_SAFE: Record<Exclude<EyeFrame, "auto">, Exclude<EyeBall, "auto">[]> = {
  square: ["square", "rounded"],
  rounded: ["square", "rounded", "circle", "leaf", "star"],
  circle: ["rounded", "circle", "leaf", "star"],
  leaf: ["rounded", "circle", "leaf", "diamond", "star"],
  cushion: ["square", "rounded"],
};

/** "Match" resolved for a module style: square codes keep square eyes, soft styles rounded ones. */
export function resolveEyes(style: string, frame: EyeFrame, ball: EyeBall): { frame: Exclude<EyeFrame, "auto">; ball: Exclude<EyeBall, "auto"> } {
  const soft = style !== "square";
  return {
    frame: frame === "auto" ? (soft ? "rounded" : "square") : frame,
    ball: ball === "auto" ? (style === "dots" ? "circle" : soft ? "rounded" : "square") : ball,
  };
}
