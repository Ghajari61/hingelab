/** The cut file for showing on screen: hairline cuts drawn 1.5 px wide at any zoom. */
export function previewSvg(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/, (m) => `${m}<style>*{vector-effect:non-scaling-stroke;stroke-width:1.5px}</style>`);
}
