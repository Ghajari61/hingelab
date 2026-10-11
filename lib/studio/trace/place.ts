/**
 * Puts a trace result on the page where its image is: pixel coordinates map onto the image's
 * w × h box (centred on its origin, like the image node) and the image's own transform.
 */
import { newId } from "../doc";
import { locate } from "../scene";
import type { Anchor, Document, GroupNode, PathNode, Subpath, Vec } from "../types";
import type { TraceResult } from "./index";

/** Pixel → image-local mm for a w × h image node traced at width × height pixels. */
export function pixelToLocal(r: Pick<TraceResult, "width" | "height">, w: number, h: number): (p: Vec) => Vec {
  const sx = w / r.width, sy = h / r.height;
  return (p) => ({ x: -w / 2 + p.x * sx, y: -h / 2 + p.y * sy });
}

export function mapSubpaths(subs: Subpath[], f: (p: Vec) => Vec): Subpath[] {
  return subs.map((s) => ({
    closed: s.closed,
    nodes: s.nodes.map((n): Anchor => {
      const p = f(n);
      return { x: p.x, y: p.y, ...(n.i ? { i: f(n.i) } : {}), ...(n.o ? { o: f(n.o) } : {}), ...(n.k ? { k: n.k } : {}) };
    }),
  }));
}

/** Cut layer for traced output: lines go on the current layer; areas to engrave on it if it fills, else on the first fill layer. */
export function traceLayer(d: Document, current: number, engrave: boolean): number {
  if (!engrave || d.cutLayers[current]?.mode === "fill") return current;
  const k = d.cutLayers.findIndex((l) => l.mode === "fill");
  return k >= 0 ? k : current;
}

/**
 * Adds the trace just above the image (same parent, same transform): one path per layer, grouped as
 * "Trace" when there are several. Returns the new object's id, or null when there is nothing to add.
 */
export function placeTrace(d: Document, imageId: string, r: TraceResult, layer: number, ids: () => string = newId): string | null {
  const l = locate(d.root, imageId);
  if (!l || l.node.type !== "image") return null;
  const img = l.node, f = pixelToLocal(r, img.w, img.h);
  const layers = r.layers.filter((x) => x.subpaths.length);
  if (!layers.length) return null;
  const paths: PathNode[] = layers.map((x) => ({ id: ids(), type: "path", name: x.name, layer, transform: [1, 0, 0, 1, 0, 0], subpaths: mapSubpaths(x.subpaths, f) }));
  let node: PathNode | GroupNode;
  if (paths.length === 1) node = { ...paths[0], name: r.lines ? "Centre-line trace" : "Trace", transform: [...img.transform] };
  else node = { id: ids(), type: "group", name: "Trace", layer, transform: [...img.transform], children: paths };
  l.parent.children.splice(l.index + 1, 0, node);
  return node.id;
}
