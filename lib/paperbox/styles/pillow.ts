/**
 * Pillow box: two panels and a glue flap; each end is a pair of curved creases that fold in as
 * lens-shaped flaps, bowing the body into a pillow. No dust flaps, no tucks.
 *
 * Sheet coordinates: the panels side by side across x, the box's length down y (0 to L).
 */
import { edge, glueFlap, Net } from "../geom";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, thick } from "../schema";
import type { BoxParams, Dieline, Pt } from "../types";

/** The arc from (x0, y) to (x1, y) bulging by `e` in the middle (positive: toward +y). */
function bulge(x0: number, x1: number, y: number, e: number): Pt[] {
  const c = (x1 - x0) / 2, r = (c * c + e * e) / (2 * Math.abs(e)), n = Math.max(8, Math.ceil((x1 - x0) / 1.5));
  return Array.from({ length: n + 1 }, (_, i) => {
    const x = x0 + ((x1 - x0) * i) / n, dx = x - (x0 + x1) / 2;
    return [x, y + Math.sign(e) * (Math.sqrt(Math.max(0, r * r - dx * dx)) - (r - Math.abs(e)))] as Pt;
  });
}

/**
 * The closed pillow for 3D: a top and a bottom skin, bowed across (deepest in the middle) and
 * pinched to a curved edge at each end, as small (nearly) flat quads.
 */
function pillowSurface(L: number, a: number, H: number, e: number): [number, number, number][][] {
  const nu = 12, nv = 6, out: [number, number, number][][] = [];
  const at = (i: number, j: number, side: 1 | -1): [number, number, number] => {
    const u = i / nu, v = -1 + (2 * j) / nv, xe = e * (1 - v * v);
    const z = (H / 2) * (1 - v * v) * Math.pow(Math.sin(Math.PI * u), 0.35);
    return [-xe + u * (L + 2 * xe), (v * a) / 2, H / 2 + side * z];
  };
  for (const side of [1, -1] as const) for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const p00 = at(i, j, side), p10 = at(i + 1, j, side), p01 = at(i, j + 1, side), p11 = at(i + 1, j + 1, side);
    out.push(side > 0 ? [p00, p10, p11, p01] : [p00, p01, p11, p10]);
  }
  return out;
}

export const PILLOW = registerBoxStyle({
  id: "pillow", name: "Pillow box", icon: "pill", blurb: "A soft, curved favour box that folds shut on its curved creases: for gift cards, jewellery and sweets.",
  defaultParams: { ...BASE_DEFAULTS, paper: "300", L: 120, W: 80, H: 25, glueW: 12, glueTaper: 15 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Length", kind: "length", min: 30, max: 600, step: 0.5, help: "End to end, between the curved creases." },
      { key: "W", label: "Width", kind: "length", min: 20, max: 400, step: 0.5, help: "Across the face." },
      { key: "H", label: "Thickness", kind: "length", min: 5, max: 150, step: 0.5, help: "How deep it bows in the middle." },
    ] },
    boardGroup,
    { id: "glue", title: "Glue flap", fields: [
      { key: "glueW", label: "Glue flap width", kind: "length", min: 5, max: 40, step: 0.5 },
      { key: "glueTaper", label: "Glue flap taper", kind: "number", unit: "deg", min: 0, max: 45, step: 1 },
    ] },
  ],
  build(p): Dieline {
    const t = thick(p), a = p.W + t, L = p.L, warnings: string[] = [];
    const e = Math.min(Math.max(3, p.H * 0.55), a * 0.4);
    const g = Math.min(num(p, "glueW", 12), a / 3), net = new Net(true);
    // Faces in halves: across the bowed body the 3D view folds them into a lens of the right thickness.
    const phi = Math.asin(Math.min(0.85, p.H / a));
    const ang = (2 * phi * 180) / Math.PI;
    const x0 = g;
    net.panel("front-a", "Front", x0, 0, a / 2, L, { printable: true });
    net.panel("front-b", "Front", x0 + a / 2, 0, a / 2, L, { parent: "front-a", hinge: [[x0 + a / 2, 0], [x0 + a / 2, L]], angle: ang, printable: true });
    net.panel("back-a", "Back", x0 + a, 0, a / 2, L, { parent: "front-b", hinge: [[x0 + a, 0], [x0 + a, L]], angle: 180 - ang, printable: true });
    net.panel("back-b", "Back", x0 + 1.5 * a, 0, a / 2, L, { parent: "back-a", hinge: [[x0 + 1.5 * a, 0], [x0 + 1.5 * a, L]], angle: ang, printable: true });
    net.crease([[x0 + a, 0], [x0 + a, L]]);
    net.flap("glue", "Glue flap", edge([x0, L], [x0, 0], [x0 + 1, L / 2]), glueFlap(L, g, num(p, "glueTaper", 15)), { parent: "front-a" });
    // The ends: an outward arc cut and an inward arc crease on each panel.
    for (const px of [x0, x0 + a]) {
      const top = bulge(px, px + a, 0, -e), bot = bulge(px, px + a, L, e);
      net.crease(bulge(px, px + a, 0, e));
      net.crease(bulge(px, px + a, L, -e));
      net.outline(top);
      net.outline(bot);
    }
    if (p.H > a * 0.8) warnings.push("The pillow is very thick for its width; it will not close well.");
    const part = net.build("pillow", "Pillow box", num(p, "bleed", 0));
    part.surface = pillowSurface(L, a, p.H, e);
    return {
      style: "pillow", parts: [part], outer: [a + t, p.H, L + 2 * e], inner: [p.W, p.H, L], warnings,
      assembly: [
        "Score the straight fold and both curved creases at each end; curved creases fold best scored on the inside.",
        "Glue the glue flap inside the far edge, making a flat tube.",
        "Pinch one end's curved flaps in, one over the other, until they close.",
        "Fill it and close the other end the same way.",
      ],
    };
  },
});
