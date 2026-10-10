import type { Sheet } from "@/lib/site/samples";

const M = 6;

/**
 * A cut file drawn on a plywood sheet in the export colors (LightBurn palette). With `trace`
 * the lines are drawn in cut order on first paint: slots, hinge, outline.
 */
export function CutSheet({ sheet, trace = false, className }: { sheet: Sheet; trace?: boolean; className?: string }) {
  const { width, height, content } = sheet;
  const len = trace ? { pathLength: 1 } : {};
  return (
    <svg
      className={`cutsheet${trace ? " trace" : ""}${className ? " " + className : ""}`}
      viewBox={`${-M} ${-M} ${width + 2 * M} ${height + 2 * M}`}
      role="img"
      aria-label={`Cut file: ${content.outline.length} parts on a ${Math.round(width)} × ${Math.round(height)} mm sheet`}
    >
      <rect className="ply" x={-M} y={-M} width={width + 2 * M} height={height + 2 * M} rx={2} />
      <g className="l-slots">{content.slots.map((d, i) => <path key={i} d={d} {...len} />)}</g>
      <g className="l-hinge">{content.hinge.map((d, i) => <path key={i} d={d} {...len} />)}</g>
      <g className="l-outline">{content.outline.map((d, i) => <path key={i} d={d} {...len} />)}</g>
    </svg>
  );
}
