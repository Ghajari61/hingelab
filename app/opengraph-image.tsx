import { ImageResponse } from "next/og";
import { heroParams, sheetFor } from "@/lib/site/samples";

export const alt = "HingeLab: living-hinge boxes, ready for your laser";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** A real cut file from the engine, drawn on plywood, with the product name. */
function sheetDataURL(): { url: string; ratio: number } {
  const sheet = sheetFor(heroParams("rect", 140, 70))!;
  const M = 6, W = sheet.width + 2 * M, H = sheet.height + 2 * M;
  const layer = (paths: string[], color: string, w: number) =>
    `<g fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${paths.map((d) => `<path d="${d}"/>`).join("")}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${W} ${H}">`
    + `<rect x="${-M}" y="${-M}" width="${W}" height="${H}" rx="2" fill="#DCBF8F"/>`
    + layer(sheet.content.slots, "#00B400", 0.9)
    + layer(sheet.content.hinge, "#0000FF", 0.6)
    + layer(sheet.content.outline, "#FF0000", 1.1)
    + `</svg>`;
  return { url: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`, ratio: W / H };
}

const LOGO = `data:image/svg+xml;base64,${Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#3B8FF0"/><path d="M15 16v32M23.5 16v12.5M23.5 35.5V48M32 16v32M40.5 16v12.5M40.5 35.5V48M49 16v32" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round"/></svg>`,
).toString("base64")}`;

export default function OpengraphImage() {
  const { url, ratio } = sheetDataURL();
  const imgH = Math.min(270, 1080 / ratio);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#161616", padding: 60, color: "#E3E3E3" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34, fontWeight: 700 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={52} height={52} alt="" />
          HingeLab
        </div>
        <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.08, marginTop: 28, letterSpacing: -1.2, maxWidth: 1000 }}>
          Living-hinge boxes, ready for your laser
        </div>
        <div style={{ display: "flex", marginTop: "auto" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} width={Math.round(imgH * ratio)} height={Math.round(imgH)} alt="" />
        </div>
      </div>
    ),
    size,
  );
}
