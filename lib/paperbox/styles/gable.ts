/**
 * Gable box: a tube with a snap-lock bottom and a pitched top. The front and back each rise into a
 * roof panel that leans in to meet at the ridge, then a handle panel with a hand hole; the sides
 * rise into gable ends, their gussets folding in under the roofs along diagonal creases.
 */
import { edge, glueFlap, rectFlap } from "../geom";
import { registerBoxStyle } from "../registry";
import { boardGroup, num, sizeGroup } from "../schema";
import type { BoxParams, Dieline, Face, Pt } from "../types";
import { dustFields, onFace, snapLockBottom, stadium } from "./ends";
import { glueFields, tube, TUBE_DEFAULTS } from "./tuck";

export const GABLE = registerBoxStyle({
  id: "gable", name: "Gable box (handle)", icon: "house", blurb: "A carry box with a pitched top and a handle: for cakes, party favours and take-away.",
  defaultParams: { ...TUBE_DEFAULTS, paper: "400", L: 100, W: 70, H: 90, roofLen: 0, handleH: 35, handleW: 0, dustDepth: 0, dustR: 3 } as BoxParams,
  paramSchema: [sizeGroup("Wall height"), boardGroup, { id: "glue", title: "Glue flap", fields: glueFields }, {
    id: "roof", title: "Roof and handle", fields: [
      { key: "roofLen", label: "Roof slope", kind: "length", min: 0, max: 400, step: 0.5, help: "Each roof panel's length up the slope; leave it at 0 for a pitch that suits the width." },
      { key: "handleH", label: "Handle height", kind: "length", min: 15, max: 120, step: 0.5 },
      { key: "handleW", label: "Hand hole width", kind: "length", min: 0, max: 200, step: 0.5, help: "Leave it at 0 to size it to the box." },
    ],
  }, { id: "dust", title: "Bottom flaps", fields: dustFields }],
  build(p): Dieline {
    const T = tube(p, true), { net, l, w, t } = T;
    const gh = Math.max(num(p, "roofLen", 0) || w * 0.72, w / 2 + 3), hh = num(p, "handleH", 35);
    const beta = (Math.asin(Math.min(0.98, (w / 2 - t) / gh)) * 180) / Math.PI;
    const rise = Math.sqrt(Math.max(1, gh * gh - (w / 2) ** 2));
    const holeW = num(p, "handleW", 0) || Math.min(l * 0.55, 95), holeH = Math.min(24, hh * 0.5);
    for (const f of [T.front, T.back]) {
      const roof = net.flap(`roof-${f.id}`, "Roof", T.top(f), rectFlap(l, gh), { parent: f.id, angle: beta, printable: true });
      const handle = net.flap(`handle-${f.id}`, "Handle", edge(roof.poly[1], roof.poly[2], roof.origin), rectFlap(l, hh), { parent: roof.id, angle: -beta, printable: true });
      net.hole(stadium(handle, l / 2, hh * 0.5, Math.min(holeW, l - 10), holeH));
    }
    for (const s of [T.sideA, T.sideB]) {
      const e = T.top(s);
      const end = net.flap(`gable-${s.id}`, "Gable end", e, [[0, 0], [w / 2, rise], [w, 0]], { parent: s.id, angle: 0, fold: false, printable: true });
      net.flap(`gusset-${s.id}-a`, "Gable flap", e, [[0, 0], [0, gh], [w / 2, gh], [w / 2, rise]], { parent: s.id, angle: 0, fold: false });
      net.flap(`gusset-${s.id}-b`, "Gable flap", e, [[w / 2, rise], [w / 2, gh], [w, gh], [w, 0]], { parent: s.id, angle: 0, fold: false });
      const at = onFace(end);
      net.crease([at(0, 0), at(w / 2, rise)]);
      net.crease([at(w, 0), at(w / 2, rise)]);
      net.crease([at(w / 2, rise), at(w / 2, gh)]);
    }
    // The roof folds against the gussets at the panel joins.
    const joins = [T.sideA.origin[0], T.front.origin[0], T.sideB.origin[0]];
    for (const x of joins) net.crease([[x, 0], [x, -gh]]);
    // A glue flap up the back roof's free edge, glued to the last gusset.
    const back: Face = T.back, bx = p.gluePos === "right" ? back.origin[0] + l : back.origin[0];
    const re = p.gluePos === "right" ? edge([bx, -gh], [bx, 0], [bx - 1, -gh / 2]) : edge([bx, 0], [bx, -gh], [bx + 1, -gh / 2]);
    net.flap("roof-glue", "Glue flap", re, glueFlap(gh, Math.min(num(p, "glueW", 15), w / 3), num(p, "glueTaper", 15)), { parent: `roof-${back.id}` });
    snapLockBottom(T, p);
    if (holeH + 8 > hh) T.warnings.push("The handle is short for its hand hole; make it taller.");
    const top: Pt = [0, rise + hh];
    return {
      style: "gable", parts: [net.build("gable", "Gable box", num(p, "bleed", 0))], outer: [T.outer[0], T.outer[1], T.outer[2] + top[1]], inner: T.inner, warnings: T.warnings,
      assembly: [
        "Crease every fold line, including the diagonals in the gable ends.",
        "Glue the glue flaps inside the last side panel and its gusset, making a tube.",
        "Bottom: fold the side flaps in, then the back flap, then the front flap, and push its tongue into the back flap's notch.",
        "Fill the box. Push the gable ends' gussets in along their diagonals while bringing the roofs together, and stand the handles up back to back.",
      ],
    };
  },
});
