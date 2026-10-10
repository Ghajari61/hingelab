import Module, { type ManifoldToplevel } from "manifold-3d";

let cached: Promise<ManifoldToplevel> | null = null;

/** manifold-3d for the export route, loaded once per server instance from node_modules. */
export function serverManifold(): Promise<ManifoldToplevel> {
  cached ??= Module().then((w) => { w.setup(); return w; });
  cached.catch(() => { cached = null; });
  return cached;
}
