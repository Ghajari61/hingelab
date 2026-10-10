/**
 * Button icons drawn from each shape's own formula. The picker ships the precomputed table in
 * shapeIcons.generated.ts (npm run build:shape-icons) so the editor never loads mathjs for them.
 * A test fails if the table falls out of date.
 */
import { compileFormula } from "./source/formula";
import { SHAPES, SHAPE_SYMBOLS, SHAPE_TARGETS, pickShape, shapeExpression, type ShapeId, type ShapeTargetId } from "./shapes";

/** A 24 × 16 icon path drawn from the shape's own formula. */
export function shapeIconPath(shape: ShapeId, polar: boolean): string {
  const target: ShapeTargetId = polar ? "outline" : "finLength";
  const t = SHAPE_TARGETS[target];
  const s = pickShape(target, shape, polar ? { ...t.defaults, base: 10, amp: 0.45 } : { ...t.defaults, base: 0, amp: 1 });
  const f = compileFormula(shapeExpression(target, s), SHAPE_SYMBOLS[target]);
  const pts: [number, number][] = [];
  if (polar) {
    for (let i = 0; i < 96; i++) { const phi = (2 * Math.PI * i) / 96, r = f({ phi }); pts.push([r * Math.cos(phi), -r * Math.sin(phi)]); }
  } else {
    for (let i = 0; i <= 64; i++) { const t = i / 64; pts.push([t, -(shape === "constant" ? 0.5 : f({ t }))]); }
  }
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const sx = polar ? 14 / Math.max(x1 - x0, y1 - y0, 1e-9) : 20 / Math.max(x1 - x0, 1e-9);
  const flat = y1 - y0 < 1e-9;
  const sy = polar ? sx : flat ? 0 : 12 / (y1 - y0);
  const ox = polar ? 12 - ((x0 + x1) / 2) * sx : 2 - x0 * sx;
  const oy = polar ? 8 - ((y0 + y1) / 2) * sy : flat ? 8 : 14 - y1 * sy;
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${(x * sx + ox).toFixed(2)} ${(y * sy + oy).toFixed(2)}`).join("");
  return polar ? `${d}Z` : d;
}

/** Every icon keyed `${shape}:${polar}`. */
export function allShapeIcons(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { id } of SHAPES) for (const polar of [false, true]) out[`${id}:${polar}`] = shapeIconPath(id, polar);
  return out;
}
