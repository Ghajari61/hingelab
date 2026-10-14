/**
 * Pointer handling for the CorelDRAW-style tools. The 3-Point Rectangle, Ellipse and Curve drag a base
 * line, then follow the pointer until the next click sets the third point; Crop drags a box, then a
 * click inside it (or Enter) crops. Smart Drawing recognises a freehand stroke when it ends.
 */
import type { StoreApi } from "zustand";
import { TOOL_INFO } from "@/lib/studio/commands";
import { newId } from "@/lib/studio/doc";
import { recognise, threePointCurve, threePointEllipse, threePointRect, type PlacedShape } from "@/lib/studio/drawTools";
import { normBox, pathD, shapePaths, transformSubpaths } from "@/lib/studio/geom";
import { addNode, isEditable } from "@/lib/studio/scene";
import { cropToBox } from "@/lib/studio/toolOps";
import type { PathNode, SceneNode, Subpath, Vec } from "@/lib/studio/types";
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
