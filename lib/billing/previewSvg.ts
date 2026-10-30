/**
 * The cut file made readable as a small picture: cut files draw hairline strokes (0.1 mm) that
 * vanish when the sheet is shrunk to a few hundred pixels. This keeps the drawing and its colours,
 * draws every line at a fixed screen width, and tints the parts so their shapes read at a glance.
 * The file that is downloaded is not changed.
 */
const STYLE = `<style>
path,line,polyline,polygon,circle,ellipse,rect{vector-effect:non-scaling-stroke}
g[stroke]{stroke-width:1.3px}
#outline{stroke-width:1.6px;fill:#e8d6b8;fill-opacity:.55}
#hinge,#score{stroke-width:.9px}
text{fill-opacity:1;stroke:none}
</style>`;

export function previewSvg(svg: string): string {
  const open = /<svg\b[^>]*>/.exec(svg);
  if (!open) return svg;
  // sized by the picture, not in millimetres
  const tag = open[0].replace(/\s(width|height)="[^"]*"/g, "");
  return svg.slice(0, open.index) + tag + STYLE + svg.slice(open.index + open[0].length);
}
