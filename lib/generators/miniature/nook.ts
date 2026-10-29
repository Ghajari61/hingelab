/**
 * The book nook: a narrow box that stands between books on a shelf, open at the front, with a scene
 * built in layers of depth inside.
 *
 * The box is a tabbed frame (kit.ts): the two sides are its end panels; the bottom, the scene floor,
 * the ceiling and the top are flat members; the back wall is an upright member.
 * - Alley street: two facades stand along the sides, tabbed into the scene floor and the ceiling, a
 *   light compartment behind each; a far facade closes the alley at the back. Windows are cut through,
 *   and above the roofline the sky is cut out, leaving a rail along the top.
 * - Arcade or library: arched frames across the box, each smaller than the one in front (a forced
 *   perspective), with scored shelves of books either side of the arch.
 * - The light box sits between the ceiling and the top; slots in the ceiling let an LED strip light
 *   the compartments behind the facades (or the space round the arches). A cable hole is in the back.
 * - The battery bay sits under the scene floor, reached through a hatch in the back.
 * - A mirror (2 mm acrylic) can stand behind the scene, held between the back wall and a frame.
 *
 * The optics are not simulated: a mirror's effect depends on the mirror and the light, and the
 * electrical parts are the builder's (see the assembly notes).
 */
import { rect, circle } from "../geom";
import type { Contour, GenPart, Pt } from "../types";
import { clamp, clipScore, openingHoles, openingShape, r1, tabbedFrame, wallFinish, type Divider, type FlatMember, type UprightMember } from "./kit";
import { NOT_A_HOUSE, type MiniOutput } from "./house";
import { NOOK_SCENES, type MiniatureParams } from "./params";
import { traditionOf } from "./traditions";

/** A small fixed sequence for varied but repeatable rooflines. */
const vary = (i: number) => [0.82, 0.62, 0.92, 0.7, 0.86, 0.66][i % 6];

export function buildNook(p: MiniatureParams): MiniOutput {
  const T = p.T, n = p.nook, trad = traditionOf(p.tradition);
  const W = Math.max(60, n.width), H = Math.max(120, n.height), D = Math.max(80, n.depth), Wc = W - 2 * T;
  const m = Math.max(3, T); // wood round slots near an edge
  const bay = n.battery ? 24 : 0, lightH = n.light ? 16 : 0;
  const zBottom = m, zFloor = n.battery ? zBottom + T + bay : zBottom;
  const zTop = H - m - T, zCeil = n.light ? zTop - lightH - T : zTop;
  const backY = m, y0 = backY + T, y1 = D;
  const flats: FlatMember[] = [];
  if (n.battery) flats.push({ id: "bottom", name: "Bottom", y0, y1, z: zBottom });
  flats.push({ id: "floor", name: "Scene floor", y0, y1, z: zFloor, holes: [] });
  if (n.light) flats.push({ id: "ceiling", name: "Ceiling", y0, y1, z: zCeil, holes: [] });
  flats.push({ id: "top", name: "Top", y0, y1, z: zTop });
  const ups: UprightMember[] = [];
  const parts: GenPart[] = [];
  const zs = zFloor + T, zc = zCeil; // the scene: floor top to ceiling underside
  const sceneH = zc - zs;
  const mirrorGap = n.mirror ? 2.4 : 0;
  const frontOf = (c: Contour, z1: number): Contour => c.map(([x, z]) => [x, z1 - z] as Pt);
  const cut = (s: Contour) => openingHoles(s, n.panes, 1.2, n.lattice);

  // ---- the back wall: cable hole in the light box, the battery hatch opening
  const backHoles: Contour[] = [];
  if (n.light) backHoles.push(circle(T + Wc - 10, zCeil + T + lightH / 2, 3.2, 0.03));
  const hatch = n.battery ? { x0: T + Wc * 0.18, x1: T + Wc * 0.82, z0: zBottom + T + 3, z1: zFloor - 3 } : null;
  if (hatch) backHoles.push(rect(hatch.x0, hatch.z0, hatch.x1 - hatch.x0, hatch.z1 - hatch.z0));
  ups.push({ id: "back", name: "Back wall", y: backY, z0: 0, z1: H, holes: backHoles.map((c) => frontOf(c, H)) });
  if (n.battery) ups.push({ id: "bay-front", name: "Battery bay front", y: D - m - T, z0: zBottom + T, z1: zFloor });

  let backFace = y0;
  if (n.mirror) {
    // a frame in front of the mirror; the mirror stands in the gap behind it
    const win = rect(T + 4, zs + 4, Wc - 8, sceneH - 8);
    ups.push({ id: "mirror-frame", name: "Mirror frame", y: y0 + mirrorGap, z0: zs, z1: zc, holes: [frontOf(win, zc)] });
    backFace = y0 + mirrorGap + T;
  }

  const dividers: Divider[] = [];
  let compartments: [number, number][] = [];
  if (n.scene === "alley") {
    const gap = clamp(Wc * 0.14, 8, 18), x0 = T + gap, x1 = T + Wc - gap - T;
    compartments = [[T + 1, x0 - 1], [x1 + T + 1, T + Wc - 1]];
    // the far facade across the end of the alley
    const farY = backFace + (n.mirror ? 0 : 2);
    const nb = clamp(Math.round(n.buildings), 1, 5), st = clamp(Math.round(n.storeys), 1, 6);
    const farW = x1 - x0 - T, rail = 5;
    {
      const roof = zs + sceneH * 0.78, holes: Contour[] = [];
      holes.push([[x0 + T + 2, roof], [x0 + T + farW / 2, roof + sceneH * 0.08], [x0 + farW - 2 + T, roof], [x0 + farW - 2 + T, zc - rail], [x0 + T + 2, zc - rail]]);
      for (let r = 0; r < st; r++) for (const t of [0.3, 0.7]) holes.push(...cut(openingShape(n.opening, x0 + T + farW * t, zs + 8 + ((roof - zs - 12) * r) / st, Math.min(12, farW * 0.22), Math.min(14, (roof - zs - 12) / st - 6))));
      const outer = rect(T, zs, Wc, sceneH);
      const lines = clipScore(wallFinish(n.wall, T, T + Wc, zs, zc), outer, holes);
      ups.push({ id: "far", name: "Far facade", y: farY, z0: zs, z1: zc, holes: holes.map((c) => frontOf(c, zc)), score: lines.map((c) => frontOf(c, zc)) });
      backFace = farY + T;
    }
    // the two facades along the alley
    for (const [side, x] of [["left", x0], ["right", x1]] as const) {
      const ya = backFace + 0.5, yb = y1, L = yb - ya, holes: Contour[] = [];
      const seg = L / nb;
      const sky: Pt[] = [[yb - 2, zc - rail], [ya + 2, zc - rail]];
      for (let b = 0; b < nb; b++) {
        const a = ya + b * seg, e = a + seg, top = Math.min(zs + sceneH * vary(b + (side === "left" ? 0 : 3)), zc - rail - 8);
        const peak = trad.kit.roof === "flat" ? 0 : Math.min(seg * 0.35, sceneH * 0.12);
        sky.push([Math.max(ya + 2, a), top], [(a + e) / 2, Math.min(top + peak, zc - rail - 4)], [Math.min(yb - 2, e), top]);
        const rows = Math.max(1, Math.min(st, Math.floor((top - zs - 6) / 22)));
        const rowH = (top - zs - 6) / rows;
        for (let r = 0; r < rows; r++) {
          const per = Math.max(1, Math.floor(seg / 24));
          for (let k = 0; k < per; k++) {
            const cy = a + (seg * (k + 0.5)) / per, ww = Math.min(11, seg / per - 7), wh = Math.min(15, rowH - 7);
            if (r === 0 && k === Math.floor(per / 2) && b % 2 === 0) holes.push(openingShape(n.opening === "round" ? "arch" : n.opening, cy, zs + 1.5, Math.min(12, seg * 0.35), Math.min(22, rowH - 3)));
            else if (ww > 3 && wh > 4) holes.push(...cut(openingShape(n.opening, cy, zs + 4 + r * rowH + (rowH - wh) * 0.5, ww, wh)));
          }
        }
      }
      // the sky: the space above the roofline, inside the rail
      const skyPts = sky.slice(0, 2).concat(sky.slice(2).sort((u, v) => u[0] - v[0]));
      holes.unshift(skyPts);
      const outline = rect(ya, zs, L, sceneH);
      const lines = clipScore(wallFinish(n.wall, ya, yb, zs, zc), outline, holes);
      dividers.push({ id: `facade-${side}`, name: `Facade (${side})`, x, outline, z0: zs, z1: zc, holes, score: lines, face: side === "left" ? "+x" : "-x" });
    }
  } else {
    // arched frames receding toward the back, each a little smaller than the one in front
    const k = clamp(Math.round(n.buildings), 2, 5);
    const span = D - 6 - backFace;
    compartments = [[T + 1, T + 7], [T + Wc - 7, T + Wc - 1]];
    for (let i = 0; i < k; i++) {
      const y = backFace + 2 + (span * i) / k, s = 0.62 + (0.38 * (i + 1)) / k;
      const aw = Wc * 0.55 * s, ah = sceneH * 0.82 * s;
      const arch = openingShape(n.opening === "rect" || n.opening === "round" ? "pointed" : n.opening, T + Wc / 2, zs + 1.5, aw, ah);
      const holes: Contour[] = [arch];
      const lines: Contour[] = [];
      // book rows either side of the arch
      const bx0 = T + 3, bx1 = T + Wc / 2 - aw / 2 - 3;
      if (bx1 - bx0 > 6) for (let z = zs + 10; z < zs + ah * 0.95; z += 13) for (const [a, b] of [[bx0, bx1], [T + Wc - (bx1 - T), T + Wc - 3]]) {
        lines.push([[a, z], [b, z]]);
        for (let x = a + 2; x < b - 1; x += 2.2 + ((x * 7) % 3) * 0.6) lines.push([[x, z], [x, z + 7 + ((x * 13) % 4)]]);
      }
      ups.push({ id: `arch${i + 1}`, name: `Arch ${i + 1}`, y, z0: zs, z1: zc, holes: holes.map((c) => frontOf(c, zc)), score: lines.map((c) => frontOf(c, zc)) });
    }
  }
  // the ceiling's light slots over the compartments
  if (n.light) {
    const ceil = flats.find((f) => f.id === "ceiling")!;
    for (const [a, b] of compartments) if (b - a > 2.5) ceil.holes!.push(rect(a, y0 + 8, b - a, Math.max(4, y1 - y0 - 20)));
  }

  parts.push(...tabbedFrame({ T, W: Wc, profile: rect(0, 0, D, H), ends: ["Left side", "Right side"], flats, uprights: ups, dividers }));
  if (hatch) parts.push({ id: "hatch", name: "Battery hatch", outer: rect(hatch.x0 - 3, 0, hatch.x1 - hatch.x0 + 6, hatch.z1 - hatch.z0 + 6), holes: [circle((hatch.x1 - hatch.x0) / 2 + hatch.x0, (hatch.z1 - hatch.z0) / 2 + 3, 3, 0.03)], place: { x: 0, y: -(hatch.z1 + 3), z: backY - T, upright: true } });

  return {
    parts,
    stats: [
      { label: "Size", value: `${r1(W)} × ${r1(D)} × ${r1(H)} mm (${r1(Wc)} mm inside)` },
      { label: "Scene", value: `${NOOK_SCENES[n.scene]}, ${r1(sceneH)} mm high` },
      { label: "Style", value: `${trad.name}${trad.fictional ? " (fictional)" : ""}` },
      ...(n.light ? [{ label: "Light box", value: `${lightH} mm under the top, slots over ${compartments.length} compartments` }] : []),
      ...(n.battery ? [{ label: "Battery bay", value: `${bay} mm under the scene floor, hatch in the back` }] : []),
    ],
    assembly: [
      "Push the bottom, floors, ceiling, top and back wall into one side, then press the other side on.",
      n.scene === "alley" ? "Stand both facades in their slots before the ceiling goes in, and the far facade between them." : "Slide the arches in from the front, the smallest at the back.",
      ...(n.mirror ? ["Stand a 2 mm acrylic mirror in the gap behind the mirror frame before the ceiling goes in. How deep it looks depends on the mirror and the light."] : []),
      ...(n.light ? ["Lay a USB or battery LED strip on the ceiling, lighting down through its slots, and lead the cable out through the hole in the back."] : []),
      ...(n.battery ? ["The battery holder goes in the bay; close the hatch with two small magnets or a strip of tape."] : []),
      ...(n.light || n.battery ? ["Use only low-voltage LED kits sold for book nooks or dollhouses, keep wiring away from hot parts and never leave lights on unattended."] : []),
    ],
    info: { size: [W, D, H], parts: parts.length, ...NOT_A_HOUSE, roomW: Wc, sceneH },
  };
}
