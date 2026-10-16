/**
 * The 3D handles in the Windows app: the same mappings as the website's editors, writing the
 * settings through the workspace's changes (built on the server like any other edit).
 */
import { artGrips } from "../../lib/desktop/artGrips";
import type { DProduct } from "../../lib/desktop/types";
import type { GenBase } from "../../lib/generators/types";
import { itemGrips, specGrips } from "../../lib/generators/grips3d";
import type { Params } from "../../lib/hinge";
import { hingeGrips } from "../../lib/hinge3d/grips";
import { ratioSetting, type GripSet } from "../../lib/three/grips";
import type { Units } from "./local";

/**
 * Handles for the selected object `selected`: a text, motif, number or picture sizes its own
 * setting; any other part gets the design's handles, or scales the whole design (`scaleBy`, done on
 * the server) when the design has none of its own.
 */
export function desktopGrips(
  product: DProduct, params: Record<string, unknown>,
  change: (key: string, value: unknown, immediate: boolean) => void, changeMany: (values: Record<string, unknown>) => void, units: Units,
  selected: string | null = null, scaleBy?: (s: number) => void,
): GripSet | undefined {
  if (product.id === "hinge") return hingeGrips(params as unknown as Params, changeMany, units);
  if (product.id === "art") return artGrips(params, change, units);
  const write = (values: Record<string, number>, done: boolean) => {
    const keys = Object.keys(values);
    if (keys.length === 1) change(keys[0], values[keys[0]], done);
    else changeMany(values);
  };
  const p = params as unknown as GenBase;
  const item = itemGrips(product.id, product.sections, p, selected, (values) => write(values, true), units);
  if (item) return item;
  const own = specGrips(product.id, product.sections, p, write, units);
  if (own) return own;
  if (!product.scale || !scaleBy) return undefined;
  return {
    size: {
      settings: [ratioSetting("scale", ["x", "y", "z"], { v0: 1, min: 0.2, max: 5, step: 0.001 }, (s) => `Scale ${Math.round(s * 100)}%`)],
      write: ({ scale }) => { if (scale && scale !== 1) scaleBy(scale); },
      uniform: true,
      thin: 4 * (typeof p.T === "number" ? p.T : 3),
    },
  };
}
