/**
 * Pointer handling for the CorelDRAW-style tools. The 3-Point Rectangle, Ellipse and Curve drag a base
 * line, then follow the pointer until the next click sets the third point; Crop drags a box, then a
 * click inside it (or Enter) crops. Smart Drawing recognises a freehand stroke when it ends.
 */
import type { StoreApi } from "zustand";
import { TOOL_INFO } from "@/lib/studio/commands";
import { newId } from "@/lib/studio/doc";
import { bSpline, recognise, threePointCurve, threePointEllipse, threePointRect, type PlacedShape } from "@/lib/studio/drawTools";
import { normBox, pathD, shapePaths, transformSubpaths } from "@/lib/studio/geom";
import { addNode, isEditable } from "@/lib/studio/scene";
import { cropToBox } from "@/lib/studio/toolOps";
import { addDimensionOf, DIMENSION_NAMES, dimensionDrawing, offsetThrough, segmentAt } from "@/lib/studio/dimension";
import type { DimensionKind, PathNode, SceneNode, Subpath, Vec } from "@/lib/studio/types";
import type { EditorState } from "../store";
import type { ToolPointer, ToolSession } from "./brushTools";

type Api = StoreApi<EditorState>;

export interface DrawCtx {
  /** Snaps a document point to the grid, nodes and guides (when snapping is on). */
  snap: (p: Vec) => Vec;
  /** mm per screen pixel. */
  px: number;
  /** Degrees for Ctrl+Shift constraints (Preferences). */
  snapAngle: number;
  /** mm: the pencil's smoothing at this zoom, for strokes Smart Drawing leaves freehand. */
  smooth: number;
  toast: (m: string) => void;
}

const dist = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);

/** Shift: 45° steps; Ctrl+Shift: the snap angle. */
function constrain(from: Vec, to: Vec, e: ToolPointer, snapAngle: number): Vec {
  if (!e.shift) return to;
  const step = ((e.ctrl ? snapAngle : 45) * Math.PI) / 180;
  const a = Math.round(Math.atan2(to.y - from.y, to.x - from.x) / step) * step, len = dist(from, to);
  return { x: from.x + len * Math.cos(a), y: from.y + len * Math.sin(a) };
}

const placedD = (p: PlacedShape) => pathD(transformSubpaths(shapePaths(p.shape), p.transform));

export type ThreePointTool = "rect3" | "ellipse3" | "curve3";

export function startThreePoint(api: Api, e: ToolPointer, ctx: DrawCtx, tool: ThreePointTool): ToolSession {
  const a = ctx.snap(e.p);
  let b = a;
  return {
    move: (q) => { b = constrain(a, ctx.snap(q.p), q, ctx.snapAngle); },
    up: (q) => {
      b = constrain(a, ctx.snap(q.p), q, ctx.snapAngle);
      if (dist(a, b) < 3 * ctx.px) {
        ctx.toast(tool === "curve3" ? "Drag from the start to the end, then move to bend the curve and click." : "Drag one side first, then move to set the size and click.");
        return;
      }
      return thirdPoint(api, a, b, ctx, tool);
    },
    outline: () => pathD([{ closed: false, nodes: [a, b] }]),
  };
}

function thirdPoint(api: Api, a: Vec, b: Vec, ctx: DrawCtx, tool: ThreePointTool): ToolSession {
  const defaults = api.getState().shapeDefaults;
  let c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  /** A click right on the base line gives a square (rectangle) or a circle (ellipse). */
  const third = (): Vec => {
    if (tool === "curve3") return c;
    const len = dist(a, b), nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const h = (c.x - a.x) * nx + (c.y - a.y) * ny;
    if (Math.abs(h) >= 2 * ctx.px) return c;
    const k = tool === "rect3" ? len : len / 2;
    return { x: b.x + nx * k, y: b.y + ny * k };
  };
  const build = (): { placed?: PlacedShape; sub?: Subpath } | null => {
    if (tool === "curve3") return { sub: threePointCurve(a, b, c) };
    const placed = tool === "rect3" ? threePointRect(a, b, third(), defaults.rect) : threePointEllipse(a, b, third(), defaults.ellipse);
    return placed ? { placed } : null;
  };
  return {
    move: (q) => { c = ctx.snap(q.p); },
    up: (q) => {
      c = ctx.snap(q.p);
      const r = build();
      if (!r) return;
      const s = api.getState();
      const node: SceneNode = r.placed
        ? { id: newId(), type: "shape", transform: r.placed.transform, layer: s.currentLayer, shape: r.placed.shape }
        : { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths: [r.sub!] };
      s.edit(TOOL_INFO[tool].label, (d) => addNode(d, node), { select: [node.id] });
    },
    outline: () => {
      const r = build();
      return r ? (r.placed ? placedD(r.placed) : pathD([r.sub!])) : null;
    },
  };
}

export function startSmartDraw(api: Api, e: ToolPointer, ctx: DrawCtx): ToolSession {
  const pts: Vec[] = [e.p];
  return {
    move: (q) => { pts.push(q.p); },
    up: (q) => {
      pts.push(q.p);
      const s = api.getState();
      const r = recognise(pts, { tol: 8 * ctx.px, smooth: ctx.smooth, rect: s.shapeDefaults.rect, ellipse: s.shapeDefaults.ellipse });
      if (!r) return;
      const node: SceneNode = "placed" in r
        ? { id: newId(), type: "shape", transform: r.placed.transform, layer: s.currentLayer, shape: r.placed.shape }
        : ({ id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths: [r.sub] } satisfies PathNode);
      s.edit(`Smart Drawing: ${r.name}`, (d) => addNode(d, node), { select: [node.id] });
    },
    outline: () => pathD([{ closed: false, nodes: pts.map((p) => ({ x: p.x, y: p.y })) }]),
  };
}

export function startCrop(api: Api, e: ToolPointer, ctx: DrawCtx): ToolSession {
  const a = ctx.snap(e.p);
  let b = a;
  const rectD = () => {
    const r = normBox(a, b);
    return pathD([{ closed: true, nodes: [{ x: r.minX, y: r.minY }, { x: r.maxX, y: r.minY }, { x: r.maxX, y: r.maxY }, { x: r.minX, y: r.maxY }] }]);
  };
  return {
    move: (q) => { b = ctx.snap(q.p); },
    up: (q) => {
      b = ctx.snap(q.p);
      const box = normBox(a, b);
      if (box.maxX - box.minX < 3 * ctx.px || box.maxY - box.minY < 3 * ctx.px) { ctx.toast("Drag a rectangle around what to keep."); return; }
      const apply = () => {
        const s = api.getState();
        const ids = s.selection.filter((id) => isEditable(s.doc.root, id));
        let out: string[] = [];
        s.edit("Crop", (d) => { out = cropToBox(d, ids.length ? ids : null, box); });
        if (!out.length) ctx.toast("Everything is already inside the crop area.");
      };
      return {
        move: () => {},
        up: (c) => {
          if (c.p.x >= box.minX && c.p.x <= box.maxX && c.p.y >= box.minY && c.p.y <= box.maxY) apply();
          else ctx.toast("Crop cancelled.");
        },
        outline: rectD,
        enter: apply,
      };
    },
    outline: rectD,
  };
}

/**
 * The Dimension tool (CorelDRAW's Parallel, Horizontal/Vertical, Angular and Radius dimensions).
 * Lengths: drag between the two points, then move and click where the dimension line goes (Enter
 * keeps the line where it is). Angles: click the corner, then the first arm, then the second.
 * Radius and diameter: drag from the centre to the edge.
 */
export function startDimension(api: Api, e: ToolPointer, ctx: DrawCtx): ToolSession {
  const mode = api.getState().dimensionMode as DimensionKind | "segment";
  const kind: DimensionKind = mode === "segment" ? "linear" : mode;
  const a = ctx.snap(e.p);
  const place = (pts: Vec[], offset: number) => {
    const s = api.getState();
    const id = newId();
    s.edit(DIMENSION_NAMES[kind], (d) => { addDimensionOf(d, kind, pts, offset, () => id); }, { select: [id] });
  };
  const preview = (pts: Vec[], offset: number) => {
    const g = dimensionDrawing({ kind, points: pts, offset });
    return g ? pathD([...g.lines, ...g.arrows]) : pathD([{ closed: false, nodes: pts }]);
  };
  const placing = (p0: Vec, p1: Vec): ToolSession => {
    let off = 8;
    return {
      move: (r) => { off = offsetThrough(kind, p0, p1, ctx.snap(r.p)); },
      up: (r) => { off = offsetThrough(kind, p0, p1, ctx.snap(r.p)); place([p0, p1], off); },
      enter: () => place([p0, p1], off),
      outline: () => preview([p0, p1], off),
    };
  };
  if (mode === "segment") {
    // click a segment: it is measured node to node, then the click places the line
    const seg = segmentAt(api.getState().doc, e.p, 6 * ctx.px);
    return {
      move: () => {},
      up: () => { if (!seg) { ctx.toast("Click on a segment of a path or shape."); return; } return placing(seg[0], seg[1]); },
      outline: () => (seg ? pathD([{ closed: false, nodes: seg }]) : null),
    };
  }
  if (kind === "callout") {
    // the arrow's tip here; the bend and the end follow
    const end = (b: Vec): ToolSession => {
      let c = b;
      return {
        move: (q) => { c = ctx.snap(q.p); },
        up: (q) => { c = ctx.snap(q.p); place(dist(b, c) < 3 * ctx.px ? [a, b] : [a, b, c], 0); },
        enter: () => place([a, b], 0),
        outline: () => preview([a, b, c], 0),
      };
    };
    let b = a;
    return {
      move: (q) => { b = ctx.snap(q.p); },
      up: (q) => { b = ctx.snap(q.p); if (dist(a, b) < 3 * ctx.px) { let p = a; return { move: (r) => { p = ctx.snap(r.p); }, up: (r) => { p = ctx.snap(r.p); return dist(a, p) < 3 * ctx.px ? undefined : end(p); }, outline: () => preview([a, p], 0) }; } return end(b); },
      outline: () => preview([a, b], 0),
    };
  }
  if (kind === "angular") {
    // the corner is this click; the arms follow
    const arm = (b: Vec): ToolSession => {
      let c = b;
      return {
        move: (q) => { c = ctx.snap(q.p); },
        up: (q) => {
          c = ctx.snap(q.p);
          if (dist(c, a) < 3 * ctx.px || dist(c, b) < 3 * ctx.px) { ctx.toast("Click the end of the second arm."); return arm(b); }
          place([a, b, c], 0);
        },
        outline: () => preview([a, b, c], 0),
      };
    };
    let b = a;
    return {
      move: (q) => { b = ctx.snap(q.p); },
      up: (q) => {
        b = ctx.snap(q.p);
        if (dist(a, b) >= 3 * ctx.px) return arm(b);
        // a click: wait for the first arm's click
        let p = a;
        return {
          move: (r) => { p = ctx.snap(r.p); },
          up: (r) => { p = ctx.snap(r.p); if (dist(a, p) < 3 * ctx.px) { ctx.toast("Click the end of the first arm."); return; } return arm(p); },
          outline: () => pathD([{ closed: false, nodes: [a, p] }]),
        };
      },
      outline: () => pathD([{ closed: false, nodes: [a, b] }]),
    };
  }
  let b = a;
  return {
    move: (q) => { b = constrain(a, ctx.snap(q.p), q, ctx.snapAngle); },
    up: (q) => {
      b = constrain(a, ctx.snap(q.p), q, ctx.snapAngle);
      if (dist(a, b) < 3 * ctx.px) { ctx.toast(kind === "radius" || kind === "diameter" ? "Drag from the centre to the edge." : "Drag from one point to the other, then click where the dimension line goes."); return; }
      if (kind === "radius" || kind === "diameter") { place([a, b], 0); return; }
      // the click that places the dimension line
      let off = 8 * Math.sign(offsetThrough(kind, a, b, { x: (a.x + b.x) / 2 - (b.y - a.y), y: (a.y + b.y) / 2 + (b.x - a.x) })) || 8;
      return {
        move: (r) => { off = offsetThrough(kind, a, b, ctx.snap(r.p)); },
        up: (r) => { off = offsetThrough(kind, a, b, ctx.snap(r.p)); place([a, b], off); },
        enter: () => place([a, b], off),
        outline: () => preview([a, b], off),
      };
    },
    outline: () => preview([a, b], kind === "radius" || kind === "diameter" ? 0 : 0.0001),
  };
}

/** The Spline tool: each click adds a control point; double-click or Enter finishes, a click on the first point closes. */
export function startSpline(api: Api, e: ToolPointer, ctx: DrawCtx): ToolSession {
  const pts: Vec[] = [ctx.snap(e.p)];
  let hover = pts[0], last = { t: e.t, p: e.p };
  const finish = (closed: boolean) => {
    const ctrl = pts;
    if (ctrl.length < (closed ? 3 : 2)) { ctx.toast("Click at least two points (three to close)."); return; }
    const s = api.getState();
    const node: SceneNode = { id: newId(), type: "path", transform: [1, 0, 0, 1, 0, 0], layer: s.currentLayer, subpaths: [bSpline(ctrl, closed)] };
    s.edit(TOOL_INFO.spline.label, (d) => addNode(d, node), { select: [node.id] });
  };
  const waiting = (): ToolSession => ({
    move: (q) => { hover = ctx.snap(q.p); },
    up: (q) => {
      const p = ctx.snap(q.p);
      // a double-click finishes; a click on the first point closes
      if (q.t - last.t < 350 && dist(q.p, last.p) < 4 * ctx.px) { finish(false); return; }
      last = { t: q.t, p: q.p };
      if (pts.length >= 3 && dist(p, pts[0]) < 6 * ctx.px) { finish(true); return; }
      pts.push(p);
      return waiting();
    },
    enter: () => finish(false),
    outline: () => pathD([bSpline([...pts, hover], false), { closed: false, nodes: [...pts, hover] }]),
  });
  return { move: (q) => { hover = ctx.snap(q.p); }, up: () => waiting(), outline: () => pathD([{ closed: false, nodes: [...pts, hover] }]) };
}
