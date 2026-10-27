/**
 * What a Pop-up is assembled with besides its cut parts, for the 3D view: three cords threaded
 * through the cord holes of every ring (centre first on pendants) and gathered at a hanging ring,
 * a knot under each ring at its measured height, a lamp socket with its shade ring and an LED bulb,
 * an LED tealight in its opening, or the vase a sleeve stands round. Drawn only, never cut.
 */
import type { Hardware3D } from "../types";
import type { PopupParams } from "./params";

export interface CordHole { ring: number; x: number; y: number; z: number; cord: number }

/** Socket bodies by lampholder size: body radius and length, mm (E14 is slimmer than E27). */
const SOCKETS = { E14: { r: 14, h: 38, bulb: 22 }, E27: { r: 20, h: 45, bulb: 30 }, custom: { r: 20, h: 45, bulb: 30 } } as const;

export function popupHardware(p: PopupParams, g: { rings: { radius: number; height: number }[]; radius: number; suspension: { positions: CordHole[] } | null }, dx = 0, floor = 0): Hardware3D[] {
  const T = p.T, hw: Hardware3D[] = [];
  const at = (x: number, y: number, z: number): [number, number, number] => [x + dx, y, z];
  const top = Math.max(...g.rings.map((r) => r.height)) + T;
  const centre = g.rings[g.rings.length - 1];
  const pendant = p.mode === "hanging";
  // Pendants hang from just above the centre; bowls and baskets from well above the rim, like a plant hanger.
  const socket = p.extras.socket !== "none" ? SOCKETS[p.extras.socket].h + 25 : 0;
  const gather = at(0, 0, top + (pendant ? Math.max(45, g.radius * 0.4) + socket : Math.max(80, g.radius * 0.9)));
  if (g.suspension) {
    const d = Math.max(1, p.support.cordDiameter * 0.8);
    for (let cord = 0; cord < 3; cord++) {
      const holes = g.suspension.positions.filter((q) => q.cord === cord).sort((a, b) => b.z - a.z);
      if (!holes.length) continue;
      const pts: [number, number, number][] = [gather, ...holes.map((q) => at(q.x, q.y, q.z + T / 2))];
      const last = holes[holes.length - 1];
      pts.push(at(last.x, last.y, last.z - 12));
      hw.push({ kind: "cord", pts, d });
      for (const q of holes) hw.push({ kind: "knot", at: at(q.x, q.y, q.z - d * 1.1), d: d * 2.6 });
    }
    hw.push({ kind: "ring", at: [gather[0], gather[1], gather[2] + 6], r: 7, d: 1.6 });
  }
  if (p.extras.socket !== "none") {
    const s = SOCKETS[p.extras.socket], z = centre.height + T;
    // The shade ring clamps the centre disc; the body stands above it, the bulb hangs below.
    hw.push({ kind: "cylinder", at: at(0, 0, centre.height - 2), r: (p.extras.socket === "E14" ? 28 : p.extras.socket === "E27" ? 40 : p.extras.socketDiameter) / 2 + 5, h: 2, color: "#d8d8d8", metal: true });
    hw.push({ kind: "cylinder", at: at(0, 0, z), r: s.r, h: s.h, color: "#f2f0ea" });
    hw.push({ kind: "bulb", at: at(0, 0, centre.height - s.bulb - 6), r: s.bulb });
    if (pendant || g.suspension) hw.push({ kind: "cord", pts: [at(0, 0, z + s.h), [gather[0], gather[1], Math.max(gather[2], z + s.h + 20)]], d: 6 });
  }
  if (p.extras.tealight) {
    // An LED tealight sits in its opening on the supports under the centre disc.
    hw.push({ kind: "cylinder", at: at(0, 0, centre.height - 1), r: p.extras.tealightDiameter / 2 - 0.5, h: 16, color: "#f4efe6" });
  }
  if (p.mode === "sleeve") {
    // The vase the sleeve stands round, on the table through the opening.
    hw.push({ kind: "cylinder", at: at(0, 0, floor), r: p.extras.sleeveDiameter / 2 - 1, h: top - floor + 40, color: "#cfe3ea", glass: true });
  }
  return hw;
}
