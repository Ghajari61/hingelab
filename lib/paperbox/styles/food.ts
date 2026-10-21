/**
 * One-piece lidded boxes and food packaging: a bakery (cake) box with tab-locked corners and an
 * optional lid window, a hinged-lid box and a shallow pie box (the lid on the back wall, tucked
 * into the front), a clamshell (two half-trays joined at the back, a lock tab at the front) and a
 * Chinese takeout pail (flared walls, a folding top and holes for a wire handle).
 *
 * Sheet coordinates: the base at 0..l × 0..w (the back wall above y = 0, the front below y = w).
 */
import { circle } from "@/lib/generators/geom";
import { edge, glueFlap, Net, rectFlap, tuckFlap } from "../geom";
import { lockSlot, lockTab, slitFor, type LockKind } from "../locks";
import { panelSizes } from "../paper";
import { registerBoxStyle } from "../registry";
import { BASE_DEFAULTS, boardGroup, num, sizeGroup, thick } from "../schema";
import type { BoxParams, Dieline, Face, Pt } from "../types";
import { onFace } from "./ends";

const dims = (p: BoxParams) => (p.dims === "outer" ? "outer" : "inner");
const roundRect = (f: Face, cx: number, cy: number, w: number, h: number, r: number): Pt[] => {
  const at = onFace(f), out: Pt[] = [];
  r = Math.max(0.5, Math.min(r, w / 2 - 0.1, h / 2 - 0.1));
  const corner = (x: number, y: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + (Math.PI / 2) * (i / 8); out.push(at(x + r * Math.cos(a), y + r * Math.sin(a))); } };
  corner(cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2); corner(cx + w / 2 - r, cy + h / 2 - r, 0); corner(cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2); corner(cx - w / 2 + r, cy - h / 2 + r, Math.PI);
  return out;
};

/** Base and four walls on a Net; returns the faces. Walls stand on the base's edges. */
function walls(net: Net, l: number, w: number, h: number, front = h) {
  const base = net.panel("base", "Base", 0, 0, l, w, { printable: true });
  const back = net.flap("back", "Back wall", edge([l, 0], [0, 0], [l / 2, w / 2]), rectFlap(l, h), { parent: "base", printable: true });
  const fr = net.flap("front", "Front wall", edge([0, w], [l, w], [l / 2, w / 2]), rectFlap(l, front), { parent: "base", printable: true });
  const left = net.flap("left", "Left wall", edge([0, 0], [0, w], [l / 2, w / 2]), rectFlap(w, h), { parent: "base", printable: true });
  const right = net.flap("right", "Right wall", edge([l, w], [l, 0], [l / 2, w / 2]), rectFlap(w, h), { parent: "base", printable: true });
  return { base, back, front: fr, left, right };
}

/** Glue tabs on both ends of the front and back walls, folded round the corners inside the side walls. */
function cornerTabs(net: Net, f: Face, h: number, tab: number) {
  const at = onFace(f), mid = at(f.w / 2, h / 2);
  net.flap(`${f.id}-tab-a`, "Glue tab", edge(at(0, h), at(0, 0), mid), glueFlap(h, tab, 25), { parent: f.id });
  net.flap(`${f.id}-tab-b`, "Glue tab", edge(at(f.w, 0), at(f.w, h), mid), glueFlap(h, tab, 25), { parent: f.id });
}

/** The lid on the back wall's top edge: the lid, its front tuck (or lip), and side flaps under it. */
function lidOnBack(net: Net, back: Face, l: number, w: number, t: number, front: "tuck" | "lip", depth: number) {
  const bt = onFace(back);
  const lid = net.flap("lid", "Lid", edge(bt(0, back.h), bt(l, back.h), bt(l / 2, 0)), rectFlap(l, w + t), { parent: back.id, printable: true });
  const lt = onFace(lid);
  if (front === "tuck") net.flap("lid-tuck", "Lid tuck", edge(lt(0, w + t), lt(l, w + t), lt(l / 2, 0)), tuckFlap(l, depth, 6, t + 0.4), { parent: lid.id, slit: slitFor(l) });
  else net.flap("lid-front", "Front", edge(lt(0, w + t), lt(l, w + t), lt(l / 2, 0)), rectFlap(l, depth), { parent: lid.id, printable: true });
  const sd = Math.min(depth, w * 0.45);
  net.flap("lid-side-a", "Lid flap", edge(lt(0, 0), lt(0, w + t), lt(l / 2, w / 2)), [[1, 0], [3, sd], [w + t - 3, sd], [w + t - 1, 0]], { parent: lid.id });
  net.flap("lid-side-b", "Lid flap", edge(lt(l, w + t), lt(l, 0), lt(l / 2, w / 2)), [[1, 0], [3, sd], [w + t - 3, sd], [w + t - 1, 0]], { parent: lid.id });
  return lid;
}

const LOCKS: { v: LockKind; text: string }[] = [{ v: "tab", text: "Tab and slot" }, { v: "hook", text: "Hook lock" }];

export const BAKERY = registerBoxStyle({
  id: "bakery", name: "Bakery box", icon: "cake", blurb: "A one-piece cake box: corners that lock with tabs (no glue), a tuck lid and an optional window in it.",
  defaultParams: { ...BASE_DEFAULTS, paper: "400", L: 200, W: 200, H: 100, lock: "tab", lidWindow: true, windowSize: 60 } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, {
    id: "lid", title: "Corners and lid", fields: [
      { key: "lock", label: "Corner lock", kind: "select", options: LOCKS, help: "How the corner tabs hold without glue: a tab whose shoulders snap through a slot, or a hook that catches." },
      { key: "lidWindow", label: "Window in the lid", kind: "toggle", help: "Cut a window in the lid to show the cake (glue clear film under it)." },
      { key: "windowSize", label: "Window size", kind: "number", unit: "%", min: 20, max: 85, step: 1 },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, dims(p), t), { l, w, h } = s, net = new Net(true), warnings: string[] = [];
    const F = walls(net, l, w, h), kind: LockKind = p.lock === "hook" ? "hook" : "tab";
    // The front and back walls' end tabs fold round the corners and lock through slots in the side walls.
    const d = Math.min(w * 0.3, 40), th = h * 0.7;
    for (const f of [F.front, F.back]) {
      const at = onFace(f), mid = at(f.w / 2, h / 2);
      net.flap(`${f.id}-lock-a`, "Lock tab", edge(at(0, (h + th) / 2), at(0, (h - th) / 2), mid), lockTab(th, d, kind), { parent: f.id });
      net.flap(`${f.id}-lock-b`, "Lock tab", edge(at(f.w, (h - th) / 2), at(f.w, (h + th) / 2), mid), lockTab(th, d, kind), { parent: f.id });
    }
    for (const sd of [F.left, F.right]) {
      const at = onFace(sd);
      for (const u of [d - 4, w - d + 4]) net.hole(lockSlot(at, u, h / 2, th * 0.7, t, "v"));
    }
    const lid = lidOnBack(net, F.back, l, w, t, "tuck", Math.min(30, h * 0.4));
    if (p.lidWindow) {
      const k = Math.min(85, Math.max(20, num(p, "windowSize", 60))) / 100;
      net.hole(roundRect(lid, l / 2, (w + t) / 2, l * k, w * k, 8));
    }
    if (d < 12) warnings.push("The corner tabs are short for this box; make it wider.");
    return {
      style: "bakery", parts: [net.build("bakery", "Bakery box", num(p, "bleed", 0))], outer: s.outer, inner: s.inner, warnings,
      assembly: [
        "Crease every fold line.", p.lidWindow ? "Glue clear film inside the lid, over the window." : "Fold the walls up.",
        "Fold the front and back walls up, bend their end tabs round the corners and push each tab through its slot in the side wall.",
        "Fill the box, fold the lid's side flaps in and tuck the lid into the front.",
      ],
    };
  },
});

function lidBox(id: string, name: string, icon: string, blurb: string, defaults: Record<string, number | string | boolean>) {
  return registerBoxStyle({
    id, name, icon, blurb,
    defaultParams: { ...BASE_DEFAULTS, ...defaults } as unknown as BoxParams,
    paramSchema: [sizeGroup(), boardGroup, {
      id: "lid", title: "Lid", fields: [
        { key: "lidFront", label: "Lid front", kind: "select", options: [{ v: "tuck", text: "Tucks inside" }, { v: "lip", text: "Lip over the front" }], help: "The lid's front edge tucks into the box, or drops over the front wall as a lip." },
        { key: "lipDepth", label: "Tuck or lip depth", kind: "length", min: 5, max: 200, step: 0.5, help: "Leave it at 0 to size it to the box." },
        { key: "notch", label: "Thumb notch", kind: "toggle", help: "A half-round notch in the front wall to lift the lid." },
        { key: "lidWindow", label: "Window in the lid", kind: "toggle" },
      ],
    }],
    build(p): Dieline {
      const t = thick(p), s = panelSizes(p.L, p.W, p.H, dims(p), t), { l, w, h } = s, net = new Net(true);
      const F = walls(net, l, w, h);
      const tab = Math.min(18, w / 3, h * 1.2);
      for (const f of [F.front, F.back]) cornerTabs(net, f, h, tab);
      const front = p.lidFront === "lip" ? "lip" : "tuck", depth = num(p, "lipDepth", 0) || Math.min(front === "lip" ? h * 0.6 : 25, h * 0.8);
      const lid = lidOnBack(net, F.back, l, w, t, front, depth);
      if (p.notch) { const at = onFace(F.front); net.notch(circle(...at(l / 2, h), Math.min(14, l / 6))); }
      if (p.lidWindow) net.hole(roundRect(lid, l / 2, (w + t) / 2, l * 0.6, w * 0.6, 10));
      return {
        style: id, parts: [net.build(id, name, num(p, "bleed", 0))], outer: s.outer, inner: s.inner, warnings: [],
        assembly: [
          "Crease every fold line.",
          "Fold the four walls up and glue each corner tab inside the side wall next to it.",
          front === "lip" ? "Fill it and close the lid, its lip over the front wall." : "Fill it, fold the lid's side flaps in and tuck the lid into the front.",
        ],
      };
    },
  });
}

export const HINGED_LID = lidBox("hinged-lid", "Hinged-lid box", "archive", "A glued tray with its lid joined to the back wall, tucked or lipped at the front: gifts, tea, stationery.", { paper: "400", L: 160, W: 110, H: 60, lidFront: "tuck", lipDepth: 0, notch: false, lidWindow: false });
export const PIE = lidBox("pie", "Pie box", "pizza", "A shallow box with a hinged lid, a window and a thumb notch: pies, tarts, cookies.", { paper: "400", L: 230, W: 230, H: 50, lidFront: "lip", lipDepth: 0, notch: true, lidWindow: true });

export const CLAMSHELL = registerBoxStyle({
  id: "clamshell", name: "Clamshell (burger) box", icon: "sandwich", blurb: "Two half-trays joined at the back that close like a shell, with a lock tab at the front: burgers, sandwiches, pastries.",
  defaultParams: { ...BASE_DEFAULTS, paper: "400", L: 120, W: 120, H: 80, lock: "tab" } as BoxParams,
  paramSchema: [sizeGroup("Closed height"), boardGroup, { id: "lock", title: "Lock", fields: [{ key: "lock", label: "Front lock", kind: "select", options: LOCKS }] }],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, dims(p), t), { l, w } = s, h = s.h / 2, net = new Net(true);
    const F = walls(net, l, w, h), tab = Math.min(15, w / 3, h * 1.2);
    for (const f of [F.front, F.back]) cornerTabs(net, f, h, tab);
    // The lid: its back wall on top of the base's (flat across their crease when shut), its top, front and sides.
    const bt = onFace(F.back);
    const lb = net.flap("lid-back", "Back", edge(bt(0, h), bt(l, h), bt(l / 2, 0)), rectFlap(l, h), { parent: F.back.id, angle: 0, printable: true });
    const lbt = onFace(lb);
    const top = net.flap("lid-top", "Top", edge(lbt(0, h), lbt(l, h), lbt(l / 2, 0)), rectFlap(l, w), { parent: lb.id, printable: true });
    const tt = onFace(top);
    const lf = net.flap("lid-front", "Front", edge(tt(0, w), tt(l, w), tt(l / 2, 0)), rectFlap(l, h), { parent: top.id, printable: true });
    for (const [id, a, b] of [["lid-left", tt(0, 0), tt(0, w)], ["lid-right", tt(l, w), tt(l, 0)]] as [string, Pt, Pt][]) {
      const side = net.flap(id, "Side", edge(a, b, tt(l / 2, w / 2)), rectFlap(w, h), { parent: top.id, printable: true });
      const at = onFace(side), mid = at(w / 2, h / 2);
      net.flap(`${id}-tab-a`, "Glue tab", edge(at(0, h), at(0, 0), mid), glueFlap(h, tab, 25), { parent: side.id });
      net.flap(`${id}-tab-b`, "Glue tab", edge(at(w, 0), at(w, h), mid), glueFlap(h, tab, 25), { parent: side.id });
    }
    // A lock tab down from the lid's front, through a slot in the base's front wall.
    const kind: LockKind = p.lock === "hook" ? "hook" : "tab", tw = Math.min(40, l * 0.35), td = Math.min(h * 0.7, 25);
    const ft = onFace(lf);
    net.flap("lock", "Lock tab", edge(ft(l / 2 - tw / 2, h), ft(l / 2 + tw / 2, h), ft(l / 2, 0)), lockTab(tw, td, kind), { parent: lf.id, angle: 0 });
    const fw = onFace(F.front);
    net.hole(lockSlot(fw, l / 2, h - td * 0.6, tw * 0.75, t, "u"));
    return {
      style: "clamshell", parts: [net.build("clamshell", "Clamshell box", num(p, "bleed", 0))], outer: [s.outer[0], s.outer[1], s.inner[2] + 2 * t], inner: s.inner, warnings: [],
      assembly: [
        "Crease every fold line.", "Fold up the base's walls and the lid's walls; glue each corner tab inside the wall next to it.",
        "Fill the base, close the lid over it and push the front lock tab into its slot.",
      ],
    };
  },
});

export const TAKEOUT = registerBoxStyle({
  id: "takeout", name: "Takeout box (oyster pail)", icon: "soup", blurb: "The Chinese takeout pail: walls flaring out from a small base, a folding top, and holes for a wire handle.",
  defaultParams: { ...BASE_DEFAULTS, paper: "400", L: 80, W: 65, H: 90, flare: 10, handle: true } as BoxParams,
  paramSchema: [sizeGroup(), boardGroup, {
    id: "shape", title: "Flare and handle", fields: [
      { key: "flare", label: "Wall flare", kind: "number", unit: "deg", min: 0, max: 25, step: 0.5, help: "How far the walls lean out from upright." },
      { key: "handle", label: "Handle holes", kind: "toggle", help: "Two holes in the side walls for a wire or string handle." },
    ],
  }],
  build(p): Dieline {
    const t = thick(p), s = panelSizes(p.L, p.W, p.H, dims(p), t), { l, w } = s, net = new Net(true), warnings: string[] = [];
    const phi = (Math.min(25, Math.max(0, num(p, "flare", 10))) * Math.PI) / 180, sh = s.h / Math.cos(phi), d = sh * Math.sin(phi);
    const ang = 90 - (phi * 180) / Math.PI;
    net.panel("base", "Bottom", 0, 0, l, w, { printable: true });
    const wall = (id: string, name: string, a: Pt, b: Pt, len: number) => net.flap(id, name, edge(a, b, [l / 2, w / 2]), [[0, 0], [-d, sh], [len + d, sh], [len, 0]], { parent: "base", angle: ang, printable: true });
    const back = wall("back", "Back", [l, 0], [0, 0], l), front = wall("front", "Front", [0, w], [l, w], l);
    const left = wall("left", "Side", [0, 0], [0, w], w), right = wall("right", "Side", [l, w], [l, 0], w);
    // Glue tabs up the front and back walls' slanted edges, inside the side walls.
    const tab = Math.min(14, w / 3), slant = Math.hypot(d, sh), tabAng = 90;
    for (const f of [front, back]) {
      const at = onFace(f), mid = at(l / 2, sh / 2);
      net.flap(`${f.id}-tab-a`, "Glue tab", edge(at(-d, sh), at(0, 0), mid), glueFlap(slant, tab, 28), { parent: f.id, angle: tabAng });
      net.flap(`${f.id}-tab-b`, "Glue tab", edge(at(l, 0), at(l + d, sh), mid), glueFlap(slant, tab, 28), { parent: f.id, angle: tabAng });
    }
    // The top: the front and back flaps meet in the middle, the side flaps fold under them.
    const topAng = 90 + (phi * 180) / Math.PI, W2 = w + 2 * d, L2 = l + 2 * d;
    for (const f of [front, back]) {
      const at = onFace(f);
      net.flap(`top-${f.id}`, "Top", edge(at(-d, sh), at(l + d, sh), at(l / 2, 0)), tuckFlap(L2, W2 / 2, 8, 1), { parent: f.id, angle: topAng, printable: true });
    }
    for (const f of [left, right]) {
      const at = onFace(f);
      net.flap(`top-${f.id}`, "Dust flap", edge(at(-d, sh), at(w + d, sh), at(w / 2, 0)), [[2, 0], [W2 * 0.3, L2 * 0.3], [W2 * 0.7, L2 * 0.3], [W2 - 2, 0]], { parent: f.id, angle: topAng });
      if (p.handle) for (const u of [w * 0.2, w * 0.8]) net.hole(circle(...at(u, sh - 10), 2));
    }
    if (d > l / 3) warnings.push("The walls flare a lot for this base; the top will be much larger than the bottom.");
    return {
      style: "takeout", parts: [net.build("takeout", "Takeout box", num(p, "bleed", 0))], outer: [l + 2 * d + t, w + 2 * d + t, s.inner[2] + t], inner: s.inner, warnings,
      assembly: [
        "Crease every fold line.", "Fold the four walls up and glue the front and back walls' tabs inside the side walls.",
        "Fill it, fold the side flaps in, then the front and back flaps over them, tucked together.",
        ...(p.handle ? ["Thread a wire or string handle through the holes in the side walls."] : []),
      ],
    };
  },
});
