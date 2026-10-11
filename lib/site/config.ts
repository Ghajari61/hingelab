/** Public site settings. The contact address appears on the legal pages; set it before launch. */
export const SITE_NAME = "HingeLab";
export const SITE_DESCRIPTION =
  "Laser-cut generators for living-hinge and finger-joint boxes, cake toppers, key holders, wood and acrylic signs, table numbers, trophies, clocks, puzzles and QR plates. Download a layered SVG or DXF, kerf-compensated and ready for LightBurn or xTool.";
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
}
