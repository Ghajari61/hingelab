/**
 * Mailer box (roll end, front tuck): a base with double walls that roll over and lock with tabs into
 * slots in the base, a lid hinged on the back wall with a front tuck and side ears, and dust flaps
 * on the front and back walls that end up sandwiched inside the rolled side walls. No glue.
 *
 * Sheet coordinates: the base at 0..l × 0..w (y down: the back at y = 0, the front at y = w).
 */
import { dustFlap, edge, Net, tuckFlap } from "../geom";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, Pt } from "../types";

/** Tab centres along a length: one, or two at the quarters. */
const tabsAt = (a: number, b: number) => (b - a < 90 ? [(a + b) / 2] : [a + (b - a) / 4, a + (3 * (b - a)) / 4]);

export const MAILER = registerBoxStyle({
  id: "mailer", name: "Mailer box", icon: "mail", blurb: "A sturdy shipping and gift box: rolled double walls, a front tuck lid and dust flaps, no glue.",
  defaultParams: { ...BASE_DEFAULTS, paper: "eflute", L: 200, W: 150, H: 50, tuckR: 8, slitLock: false, dustR: 3 } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, {
    id: "tuck", title: "Lid and flaps", fields: [
      { key: "tuckR", label: "Tuck corner radius", kind: "length", min: 0, max: 40, step: 0.5 },
      { key: "slitLock", label: "Slit locks", kind: "toggle", help: "Short cuts at the ends of the tuck's fold, so the lid clicks shut." },
      { key: "dustR", label: "Dust flap radius", kind: "length", min: 0, max: 30, step: 0.5 },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), { l, w, h, inner, outer } = panelSizes(p.L, p.W, p.H, p.dims === "outer" ? "outer" : "inner", t);
    const net = new Net(), warnings: string[] = [];
    const ih = h - t, sF = 2 * t + 0.5, sB = t + 0.5, td = Math.max(3, 3 * t), tw = Math.min(20, Math.max(8, l / 6));
    const wl = w + t; // the lid covers the side walls' rolled tops
    net.panel("base", "Base", 0, 0, l, w);
    net.panel("front", "Front wall", 0, w, l, h, { parent: "base", hinge: [[0, w], [l, w]], angle: 90, printable: true });
    net.panel("back", "Back wall", 0, -h, l, h, { parent: "base", hinge: [[0, 0], [l, 0]], angle: 90, printable: true });
    net.panel("lid", "Lid", 0, -h - wl, l, wl, { parent: "back", hinge: [[0, -h], [l, -h]], angle: 90, printable: true });
    net.crease([[0, w], [l, w]]); net.crease([[0, 0], [l, 0]]); net.crease([[0, -h], [l, -h]]);
    net.panel("left", "Left wall", -h, 0, h, w, { parent: "base", hinge: [[0, 0], [0, w]], angle: 90, printable: true });
    net.panel("right", "Right wall", l, 0, h, w, { parent: "base", hinge: [[l, 0], [l, w]], angle: 90, printable: true });
    net.crease([[0, 0], [0, w]]); net.crease([[l, 0], [l, w]]);
    // A rolled inner wall stands one thickness inside its outer wall: its mid-plane 1.5 t in from the fold.
    const slot = (x0: number, x1: number, y0: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

    // Rolled front wall: an inner wall folds down inside the outer one; its tabs lock into the base.
    const fy = w + h + ih;
    net.flap("front-in", "Front inner wall", edge([0, w + h], [l, w + h], [l / 2, w]), tuckFlap(l, ih, 0, sF), { parent: "front", angle: 180 });
    for (const x of tabsAt(sF, l - sF)) {
      net.flap("front-tab", "Lock tab", edge([x - tw / 2, fy], [x + tw / 2, fy], [x, fy - 1]), [[0, 0], [0.6, td], [tw - 0.6, td], [tw, 0]], { parent: "front-in", angle: 0, fold: false });
      net.hole(slot(x - tw / 2 - 0.3, x + tw / 2 + 0.3, w - 2 * t - 0.3, w - t + 0.3));
    }
    // Rolled side walls, inset to clear the double front and the back; tabs into the base.
    const sideIn = (id: string, x0: number, dir: -1 | 1) => {
      const ex = x0 + dir * h, a: Pt = dir < 0 ? [ex, w] : [ex, 0], b: Pt = dir < 0 ? [ex, 0] : [ex, w];
      const [s0, s1] = dir < 0 ? [sF, sB] : [sB, sF];
      net.flap(`${id}-in`, "Inner side wall", edge(a, b, [x0, w / 2]), [[s0, 0], [s0, ih], [w - s1, ih], [w - s1, 0]], { parent: id, angle: 180 });
      const fx = ex + dir * ih;
      for (const y of tabsAt(sB + 2, w - sF - 2)) {
        net.flap(`${id}-tab`, "Lock tab", edge([fx, y + dir * tw / 2], [fx, y - dir * tw / 2], [fx - dir, y]), [[0, 0], [0.6, td], [tw - 0.6, td], [tw, 0]], { parent: `${id}-in`, angle: 0, fold: false });
        const cx = x0 === 0 ? 1.5 * t : l - 1.5 * t;
        net.hole(slot(cx - t / 2 - 0.3, cx + t / 2 + 0.3, y - tw / 2 - 0.3, y + tw / 2 + 0.3));
      }
    };
    sideIn("left", 0, -1);
    sideIn("right", l, 1);

    // Dust flaps on the front and back walls' ends, folded in against the side walls.
    const dd = Math.min(w / 2 - 2 * t - 1, w * 0.45), dr = num(p, "dustR", 3);
    for (const [id, y0, y1] of [["front", w, w + h], ["back", -h, 0]] as const) {
      net.flap(`${id}-dust-l`, "Dust flap", edge([0, y1], [0, y0], [1, (y0 + y1) / 2]), dustFlap(h, dd, Math.min(dd * 0.4, h * 0.3), dr, t + 0.5), { parent: id });
      net.flap(`${id}-dust-r`, "Dust flap", edge([l, y0], [l, y1], [l - 1, (y0 + y1) / 2]), dustFlap(h, dd, Math.min(dd * 0.4, h * 0.3), dr, t + 0.5), { parent: id });
    }
    // Lid: front tuck inside the front wall, ears inside the side walls.
    const ly = -h - wl;
    net.flap("tuck", "Front tuck", edge([0, ly], [l, ly], [l / 2, ly + 1]), tuckFlap(l, h - 2 * t, num(p, "tuckR", 8), sF), { parent: "lid", slit: p.slitLock ? Math.min(6, l / 8) : 0 });
    const ear = Math.min(h - 2 * t, wl * 0.6);
    net.flap("ear-l", "Lid ear", edge([0, -h], [0, ly], [1, -h - wl / 2]), dustFlap(wl, ear, Math.min(ear * 0.5, wl * 0.3), dr, t + 0.5), { parent: "lid" });
    net.flap("ear-r", "Lid ear", edge([l, ly], [l, -h], [l - 1, -h - wl / 2]), dustFlap(wl, ear, Math.min(ear * 0.5, wl * 0.3), dr, t + 0.5), { parent: "lid" });
    if (dd < 5) warnings.push("The box is too narrow for useful dust flaps; make it wider.");
    if (h < 4 * t + 6) warnings.push("The walls are low for this board; the rolled walls and tabs need more height.");
    return {
      style: "mailer", parts: [net.build("mailer", "Mailer box", num(p, "bleed", 0))], outer: [outer[0], outer[1] + t, outer[2]], inner, warnings,
      assembly: [
        "Crease every fold line, and push out the slots in the base.",
        "Fold the front and back walls up, and their dust flaps in against the sides.",
        "Fold each side wall up, roll its inner wall over the dust flaps and push its tabs into the slots in the base.",
        "Roll the front wall's inner wall down inside it and lock its tabs into the base.",
        "Close the lid: tuck the ears inside the side walls and the front tuck inside the front wall.",
      ],
    };
  },
});
