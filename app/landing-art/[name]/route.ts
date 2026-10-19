import { sceneSVG } from "@/components/editor/scene3d";
import { OPS } from "@hingelab/ui/ops";
import { GALLERY, sheetFor, type Sheet } from "@/lib/site/samples";

/**
 * The landing gallery's pictures as files (`box-<n>.svg`, `sheet-<n>.svg`), built once at build
 * time: drawn into the page they were about 300 kB of its HTML, twice over with React's payload.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return GALLERY.flatMap((_, i) => [{ name: `box-${i}.svg` }, { name: `sheet-${i}.svg` }]);
}

const M = 6;
const withNs = (svg: string) => (svg.includes("xmlns=") ? svg : svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"'));

/** The cut file on a plywood sheet, in the export colours (as CutSheet draws it on the page). */
function sheetSVG({ width, height, content }: Sheet) {
  const g = (d: string[], color: string, w: number) => `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d.map((p) => `<path d="${p}" vector-effect="non-scaling-stroke"/>`).join("")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${width + 2 * M} ${height + 2 * M}">`
    + `<rect x="${-M}" y="${-M}" width="${width + 2 * M}" height="${height + 2 * M}" rx="2" fill="#DCBF8F" stroke="#B48F58" stroke-width=".6"/>`
    + g(content.slots, OPS.inner.color, 0.5) + g(content.hinge, OPS.hinge.color, 0.5) + g(content.outline, OPS.cut.color, 0.7)
    + `</svg>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const m = /^(box|sheet)-(\d+)\.svg$/.exec(name);
  const sample = m ? GALLERY[Number(m[2])] : undefined;
  const sheet = sample ? sheetFor(sample.params) : null;
  if (!m || !sheet) return new Response("Not found", { status: 404 });
  const svg = m[1] === "box" ? withNs(sceneSVG(sheet.model, sheet.params, -0.6, 0.35)) : sheetSVG(sheet);
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" } });
}
