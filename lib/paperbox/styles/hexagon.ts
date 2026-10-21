/**
 * Hexagon box: six panels and a glue flap round a hexagonal prism, closed at each end by a
 * hexagonal lid with a tuck, over two small dust flaps. The top lid hangs on the front panel, the
 * bottom lid on the panel opposite.
 *
 * Sheet coordinates: the panels side by side across x, the body from y = 0 to y = h.
 */
import { dustFlap, edge, glueFlap, Net, tuckFlap } from "../geom";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, thick } from "../schema";
import type { BoxParams, Dieline, Face, Pt } from "../types";

export const HEXAGON = registerBoxStyle({
  id: "hexagon", name: "Hexagon box", icon: "hexagon", blurb: "A six-sided gift box with hexagonal tuck lids: for candles, tea, cosmetics and favours.",
  defaultParams: { ...BASE_DEFAULTS, paper: "350", L: 40, W: 40, H: 100, glueW: 12, glueTaper: 15, tuckLen: 0, tuckR: 5, dustR: 2 } as BoxParams,
  paramSchema: [
    { id: "size", title: "Size", fields: [
      { key: "L", label: "Side", kind: "length", min: 10, max: 300, step: 0.5, help: "Each of the six sides, inside." },
      { key: "H", label: "Height", kind: "length", min: 10, max: 600, step: 0.5 },
    ] },
    boardGroup,
    { id: "glue", title: "Glue flap", fields: [
      { key: "glueW", label: "Glue flap width", kind: "length", min: 5, max: 40, step: 0.5 },
      { key: "glueTaper", label: "Glue flap taper", kind: "number", unit: "deg", min: 0, max: 45, step: 1 },
    ] },
    { id: "tuck", title: "Lids", fields: [
      { key: "tuckLen", label: "Tuck length", kind: "length", min: 0, max: 100, step: 0.5, help: "Leave it at 0 to size it to the box." },
      { key: "tuckR", label: "Tuck corner radius", kind: "length", min: 0, max: 30, step: 0.5 },
      { key: "dustR", label: "Dust flap radius", kind: "length", min: 0, max: 20, step: 0.5 },
    ] },
  ],
  build(p): Dieline {
    const t = thick(p), s = p.L + t / Math.sqrt(3), h = p.H + t, k = (Math.sqrt(3) / 2) * s;
    const net = new Net(true), warnings: string[] = [], g = Math.min(num(p, "glueW", 12), s - 1);
    const names = ["Front", "Side", "Side", "Back", "Side", "Side"];
    const panels: Face[] = [];
    for (let i = 0; i < 6; i++) {
      const x = g + i * s;
      panels.push(net.panel(`p${i}`, names[i], x, 0, s, h, { printable: true, ...(i ? { parent: `p${i - 1}`, hinge: [[x, 0], [x, h]] as [Pt, Pt], angle: 60 } : {}) }));
      if (i) net.crease([[x, 0], [x, h]]);
    }
    net.flap("glue", "Glue flap", edge([g, h], [g, 0], [g + 1, h / 2]), glueFlap(h, g, num(p, "glueTaper", 15)), { parent: "p0" });
    const hex: Pt[] = [[0, 0], [-s / 2, k], [0, 2 * k], [s, 2 * k], [1.5 * s, k], [s, 0]];
    const tl = num(p, "tuckLen", 0) || Math.min(Math.max(10, s * 0.6), 25);
    const end = (lidOn: number, dust: number[], which: "top" | "bottom") => {
      const f = panels[lidOn], x0 = f.origin[0];
      const e = which === "top" ? edge([x0, 0], [x0 + s, 0], [x0 + s / 2, 1]) : edge([x0 + s, h], [x0, h], [x0 + s / 2, h - 1]);
      const lid = net.flap(`lid-${which}`, which === "top" ? "Top" : "Bottom", e, hex, { parent: f.id, printable: true });
      net.flap(`tuck-${which}`, which === "top" ? "Top tuck" : "Bottom tuck", edge(lid.poly[2], lid.poly[3], lid.poly[0]), tuckFlap(s, tl, num(p, "tuckR", 5), Math.min(s / 5, t + 0.4)), { parent: lid.id });
      for (const i of dust) {
        const d = panels[i], dx = d.origin[0];
        const de = which === "top" ? edge([dx, 0], [dx + s, 0], [dx + s / 2, 1]) : edge([dx + s, h], [dx, h], [dx + s / 2, h - 1]);
        const dd = Math.min(k * 0.8, s * 0.5);
        net.flap(`dust-${which}-${i}`, "Dust flap", de, dustFlap(s, dd, Math.min(dd * 0.55, s * 0.3), num(p, "dustR", 2)), { parent: d.id });
      }
    };
    end(0, [2, 4], "top");
    end(3, [1, 5], "bottom");
    if (tl > h * 0.8) warnings.push("The tucks are long for this height; they will meet inside.");
    const across = 2 * s + t;
    return {
      style: "hexagon", parts: [net.build("hexagon", "Hexagon box", num(p, "bleed", 0))], outer: [across, 2 * k + t, h + t], inner: [2 * p.L, Math.sqrt(3) * p.L, p.H], warnings,
      assembly: [
        "Crease every fold line.",
        "Glue the glue flap inside the last panel, making a six-sided tube.",
        "Bottom: fold the two dust flaps in, then the hexagonal lid, and tuck it in.",
        "Fill it, then close the top the same way.",
      ],
    };
  },
});
