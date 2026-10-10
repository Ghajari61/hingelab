import { r3 } from "@/lib/hinge";
import type { View } from "@/hooks/useCanvasView";
import type { Units } from "./format";

/** Tick marks that follow pan and zoom. Returns the SVG markup the prototype injected. */
export function rulerSvg(len: number, horiz: boolean, view: View, units: Units) {
  const u = units === "in" ? 25.4 : 1;
  const pxPerUnit = view.z * u;
  const steps = units === "in" ? [0.0625, 0.125, 0.25, 0.5, 1, 2, 5, 10] : [1, 2, 5, 10, 20, 50, 100, 200, 500];
  const step = steps.find(s => s * pxPerUnit >= 50) || steps[steps.length - 1];
  const minor = step / (units === "in" ? 4 : 5);
  let d = "", txt = "";
  const off = horiz ? view.tx : view.ty;
  const start = Math.floor((-off / pxPerUnit) / minor) * minor;
  const end = (len - off) / pxPerUnit;
  for (let v = start; v <= end; v += minor) {
    const pos = r3(off + v * pxPerUnit);
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6;
    const tl = major ? 20 : 6;
    d += horiz ? `M${pos},20V${20 - tl}` : `M20,${pos}H${20 - tl}`;
    if (major) {
      const lbl = units === "in" ? r3(v) : Math.round(v);
      txt += horiz
        ? `<text x="${pos + 3}" y="9" font-size="9">${lbl}</text>`
        : `<text x="9" y="${pos + 3}" font-size="9" transform="rotate(-90 9 ${pos + 3})">${lbl}</text>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}" stroke="#5A5A5A" stroke-width="1" fill="none" shape-rendering="crispEdges"/><g fill="#8A8A8A" font-family="Source Code Pro, monospace">${txt}</g></svg>`;
}
