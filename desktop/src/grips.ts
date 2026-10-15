/**
 * The 3D handles in the Windows app: the same mappings as the website's editors, writing the
 * settings through the workspace's changes (built on the server like any other edit).
 */
import type { DProduct } from "../../lib/desktop/types";
import type { GenBase } from "../../lib/generators/types";
import { specGrips } from "../../lib/generators/grips3d";
import type { Params } from "../../lib/hinge";
import { hingeGrips } from "../../lib/hinge3d/grips";
import type { GripSet } from "../../lib/three/grips";
import type { Units } from "./local";

export function desktopGrips(
  product: DProduct, params: Record<string, unknown>,
  change: (key: string, value: unknown, immediate: boolean) => void, changeMany: (values: Record<string, unknown>) => void, units: Units,
): GripSet | undefined {
  if (product.id === "hinge") return hingeGrips(params as unknown as Params, changeMany, units);
  const write = (values: Record<string, number>, done: boolean) => {
    const keys = Object.keys(values);
    if (keys.length === 1) change(keys[0], values[keys[0]], done);
    else changeMany(values);
  };
  return specGrips(product.id, product.sections, params as unknown as GenBase, write, units) ?? undefined;
}
