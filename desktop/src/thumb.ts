/**
 * A small picture of a design for the recent list, drawn from the preview SVG on this computer.
 * Cut lines are hairlines at true size, so they are drawn at a fixed pixel width to stay visible.
 */
const W = 360;
const H = 225;
const MAX = 80_000;

export function thumbSvg(svg: string): string | null {
  const open = svg.match(/<svg\b[^>]*>/);
  if (!open) return null;
  let attrs = open[0].slice(4, -1);
  if (!/\sviewBox=/.test(attrs)) {
    const w = parseFloat(attrs.match(/\swidth="([\d.]+)/)?.[1] ?? "");
    const h = parseFloat(attrs.match(/\sheight="([\d.]+)/)?.[1] ?? "");
    if (!(w > 0 && h > 0)) return null;
    attrs += ` viewBox="0 0 ${w} ${h}"`;
  }
  attrs = attrs.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/g, "");
  const style = "<style>*{vector-effect:non-scaling-stroke;stroke-width:1.1px}</style>";
  return svg.replace(open[0], `<svg${attrs} width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet">${style}`);
}

export async function designThumb(svg: string): Promise<string | null> {
  const src = thumbSvg(svg);
  if (!src) return null;
  const url = URL.createObjectURL(new Blob([src], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.getContext("2d")?.drawImage(img, 0, 0, W, H);
    const out = canvas.toDataURL("image/webp", 0.82);
    return out.startsWith("data:image/") && out.length < MAX ? out : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
