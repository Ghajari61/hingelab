/** Window shapes for a cut-out pattern or a box window: light, so the Hinge Box and the panels can use them. */
import { circle, regularPolygon } from "./geom";
import type { Contour } from "./types";

/** The window the pattern fills: the whole face, or a shape in its middle. */
export type PierceShape = "full" | "circle" | "heart" | "star" | "hexagon" | "diamond";
export const PIERCE_SHAPES: Record<PierceShape, string> = { full: "Whole face", circle: "Circle", heart: "Heart", star: "Star", hexagon: "Hexagon", diamond: "Diamond" };
/** A shape of the given size (its width and height at most `s`) centred on (cx, cy), y down. */
export function windowShape(shape: PierceShape, cx: number, cy: number, s: number): Contour | null {
  const r = s / 2;
  switch (shape) {
    case "circle": return circle(cx, cy, r);
    case "hexagon": return regularPolygon(6, r, 30, cx, cy);
    case "diamond": return [[cx, cy - r], [cx + r * 0.75, cy], [cx, cy + r], [cx - r * 0.75, cy]];
    case "star": {
      const pts: Contour = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI * i) / 5, R = i % 2 ? r * 0.45 : r;
        pts.push([cx + R * Math.cos(a), cy + 0.06 * r + R * Math.sin(a)]);
      }
      return pts;
    }
    case "heart": {
      // The classic heart curve (17 × 15.5 units across), its point down.
      const k = s / 34, pts: Contour = [];
      for (let i = 0; i < 96; i++) {
        const t = (2 * Math.PI * i) / 96;
        const x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        pts.push([cx + x * k, cy - (y + 2.5) * k]);
      }
      return pts;
    }
    default: return null;
  }
}

