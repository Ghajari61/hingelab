/**
 * Small pictures for the header of a QR sign, the way shop-counter and table signs mark what the
 * code is for: review stars, a menu, Wi-Fi, a camera for photos and social pages, a map pin, a
 * payment card, the contactless (tap) waves, a chat bubble, a calendar. All are plain geometry made
 * for HingeLab (no brand logos), unioned into filled regions that engrave, cut or stencil.
 */
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import { arc, bboxOf, circle, deg, rect, reverse, roundedRect, stadium } from "../geom";
import { motif } from "../motifs";
import { starPolygon } from "../shapes";
import type { Contour, Pt } from "../types";

export const BADGE_KINDS = [
  "none", "stars", "menu", "coffee", "wifi", "camera", "pin", "pay", "tap", "chat", "phone", "calendar",
  "heart", "paw", "note", "gift", "house", "leaf",
] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export const BADGE_NAMES: Record<BadgeKind, string> = {
  none: "None", stars: "Five stars", menu: "Menu", coffee: "Coffee", wifi: "Wi-Fi", camera: "Camera", pin: "Map pin",
  pay: "Payment card", tap: "Tap (contactless)", chat: "Chat", phone: "Phone", calendar: "Calendar",
  heart: "Heart", paw: "Paw", note: "Music", gift: "Gift", house: "House", leaf: "Leaf",
};

/** A ring: an outline with a reversed inner outline (nonzero union). */
const ring = (o: Contour, i: Contour): Contour[] => [o, reverse(i)];
/** A thick arc band from a0 to a1 (radians), radii r0 < r1, centre (cx, cy). */
const band = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): Contour =>
  [...arc(cx, cy, r1, a0, a1), ...arc(cx, cy, r0, a1, a0)];

/** The picture in a 100 mm frame centred on (0, 0), y down (nonzero fill). */
function unit(kind: Exclude<BadgeKind, "none" | "stars">): Contour[] {
  switch (kind) {
    case "menu": {
      // fork (four tines) and knife, side by side
      const fork: Contour[] = [stadium(-22, -12, -22, 46, 9), roundedRect(-34, -30, 24, 16, 6), ...[-34, -27.5, -21, -14.5].map((x) => rect(x, -48, 4, 24))];
      const knife: Contour[] = [stadium(22, 4, 22, 46, 9), [[17.5, 6], [17.5, -40], [22, -48], [31, -30], [31, 6]]];
      return [...fork, ...knife];
    }
    case "coffee": {
      const cup = [[-36, -14], [24, -14], [20, 30], [-32, 30]] as Contour;
      return [cup, ...ring(circle(28, 4, 14), circle(28, 4, 7)), roundedRect(-44, 32, 76, 7, 3.5),
        ...[-22, -6, 10].map((x) => stadium(x, -44, x, -24, 6))];
    }
    case "wifi": {
      const cy = 30;
      return [circle(0, cy - 2, 9), band(0, cy, 20, 32, deg(-135), deg(-45)), band(0, cy, 44, 56, deg(-135), deg(-45))];
    }
    case "camera": {
      const body = roundedRect(-48, -26, 96, 66, 12);
      return [body, roundedRect(-18, -38, 36, 16, 5), reverse(circle(0, 8, 22)), circle(0, 8, 13), reverse(circle(34, -14, 5))];
    }
    case "pin": {
      const pts: Contour = [];
      const R = 30, cy = -16;
      // a circle drawn into a point at the bottom
      const a0 = deg(150), a1 = deg(390);
      pts.push([0, 48]);
      for (const p of arc(0, cy, R, a0, a1)) pts.push(p);
      return [pts, reverse(circle(0, cy, 12))];
    }
    case "pay": {
      const card = roundedRect(-48, -32, 96, 64, 8);
      return [card, reverse(rect(-48, -18, 96, 12)), reverse(roundedRect(-38, 6, 22, 15, 3)), reverse(rect(6, 14, 30, 5))];
    }
    case "tap": {
      // contactless waves: four arcs of growing radius, leaning right
      return [0, 1, 2, 3].map((k) => band(-36, 0, 10 + k * 18, 18 + k * 18, deg(-50), deg(50)));
    }
    case "chat": {
      const b: Contour = [...roundedRect(-48, -38, 96, 64, 22)];
      const tail: Contour = [[-30, 18], [-8, 18], [-36, 46]];
      return [b, tail, ...[-24, 0, 24].map((x) => reverse(circle(x, -6, 7)))];
    }
    case "phone": {
      return [roundedRect(-26, -48, 52, 96, 10), reverse(roundedRect(-19, -36, 38, 66, 3)), circle(0, 39, 5)];
    }
    case "calendar": {
      const cs: Contour[] = [roundedRect(-44, -36, 88, 82, 9), reverse(rect(-36, -14, 72, 52))];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cs.push(rect(-31 + c * 17, -8 + r * 15, 11, 10));
      cs.push(stadium(-22, -48, -22, -28, 9), stadium(22, -48, 22, -28, 9));
      return cs;
    }
    default:
      return motif(kind, 100);
  }
}

/** The picture `size` mm tall, centred on (cx, cy): filled regions with their holes. */
export function badgeContours(kind: BadgeKind, size: number, cx = 0, cy = 0): Contour[] {
  if (kind === "none" || size <= 0) return [];
  let cs: Contour[];
  if (kind === "stars") {
    // five stars in a row, the way review signs show a rating
    cs = [0, 1, 2, 3, 4].map((i) => starPolygon(5, 50, 0.46, (i - 2) * 112, 4));
  } else cs = unit(kind);
  const shapes = unionShapes(cs, [], false, true);
  const out = shapeContours(shapes);
  const b = bboxOf(out);
  const s = size / Math.max(1e-6, b.y1 - b.y0);
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  return out.map((c) => c.map(([x, y]) => [cx + (x - mx) * s, cy + (y - my) * s] as Pt));
}

/** Width over height of a picture, to lay it out before drawing it. */
export function badgeAspect(kind: BadgeKind): number {
  if (kind === "none") return 0;
  const cs = badgeContours(kind, 100);
  const b = bboxOf(cs);
  return (b.x1 - b.x0) / Math.max(1e-6, b.y1 - b.y0);
}
