/**
 * Leather Studio's checks: laser safety first (it decides whether a laser file may be made), then
 * the pattern's own geometry: matched seams, holes clear of edges and of each other, fittings clear
 * of stitching and edges, and decoration that leaves the leather strong enough.
 */
import type { Issue } from "@/lib/issues";
import { distToContour } from "../geom";
import type { LeatherOutput } from "./build";
import { leatherOf } from "./materials";
import { PRODUCTS, type LeatherParams } from "./params";

const PRODUCT_NAME = (p: LeatherParams) => PRODUCTS[p.product].name.toLowerCase();

type I = Issue<LeatherParams>;

export function checkLeather(p: LeatherParams, out: LeatherOutput): I[] {
  const issues: I[] = [];
  const info = out.info;
  const leather = leatherOf(p.leather);

  // ---- laser safety: never assumed; PVC and unknown leatherette are never laser cut
  if (p.stitch.mode !== "manual" && (leather.laser === "blocked" || !p.verified)) {
    const blocked = leather.laser === "blocked";
    issues.push({
      code: "LASER_BLOCKED", level: "error",
      message: blocked
        ? `${leather.name} must not be laser cut: it may contain PVC, which gives off chlorine compounds. Make the hand-cutting template instead.`
        : `No laser file until you confirm the material: ${leather.name} needs its composition and the maker's guidance for laser processing, and a laser with extraction, filtration and someone watching it. ${leather.laser === "not-approved" ? "It is not approved for the laser by default." : ""}`.trim(),
      fixes: [
        { id: "manual", label: "Make the hand-cutting template", safe: true, apply: (q) => ({ ...q, stitch: { ...q.stitch, mode: "manual" } }) },
        ...(blocked ? [] : [{ id: "verified", label: "I have checked the composition and the laser guidance", safe: false, apply: (q: LeatherParams) => ({ ...q, verified: true }) }]),
      ],
    });
  }
  if (!info || out.error) return issues;
  if (p.stitch.mode === "manual") issues.push({ code: "HAND_TEMPLATE", level: "info", message: "This is a hand-cutting template: print it at 100 %, cut the outlines with a knife and punch the stitch holes at the marks.", fixes: [] });

  const e = p.stitch.edge;
  // ---- seams: both sides of a seam get the same holes; a length difference shows as uneven spacing
  const bad = info.seams.filter((s) => s.lengths.length > 1 && s.lengths.some((L) => Math.abs(L - s.lengths[0]) > Math.max(1.5, s.lengths[0] * 0.015)));
  if (bad.length) {
    const s = bad[0], d = Math.max(...s.lengths) - Math.min(...s.lengths);
    issues.push({ code: "SEAM_MISMATCH", level: "warn", message: `${bad.length} seam${bad.length > 1 ? "s have" : " has"} sides of different lengths (${s.label}: ${d.toFixed(1)} mm); the holes still match one for one, but the spacing differs between the sides and the leather will need easing.`, fixes: [], partIds: [...new Set(bad.flatMap((q) => q.parts))] });
  }

  const byId = new Map(out.parts.map((q) => [q.id, q]));
  const near: string[] = [], clash: string[] = [], hwEdge: string[] = [], hwStitch: string[] = [];
  for (const [id, hs] of Object.entries(info.holes)) {
    const part = byId.get(id);
    if (!part) continue;
    const stitches = hs.filter((h) => !h.what.endsWith(" mount"));
    // too near the edge
    if (stitches.some((h) => distToContour(h.pt, part.outer) < Math.max(h.r + 0.8, e * 0.5))) near.push(id);
    // too near each other (a bridge under 0.8 mm tears)
    const sorted = [...hs].sort((a, b) => a.pt[0] - b.pt[0]);
    let hit = false;
    for (let i = 0; i < sorted.length && !hit; i++) for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (b.pt[0] - a.pt[0] > a.r + b.r + 12) break;
      if (a.what.endsWith(" mount") && b.what.endsWith(" mount")) continue;
      if (Math.hypot(a.pt[0] - b.pt[0], a.pt[1] - b.pt[1]) < a.r + b.r + 0.8) { hit = true; break; }
    }
    if (hit) clash.push(id);
    // fittings: their caps clear of the edge and of the stitching
    for (const f of info.fittings[id] ?? []) {
      if (["rivet", "snap", "magnet", "chicago", "grommet", "eyelet"].includes(f.kind) && distToContour(f.pt, part.outer) < f.r * 0.9) hwEdge.push(id);
      if (stitches.some((h) => Math.hypot(h.pt[0] - f.pt[0], h.pt[1] - f.pt[1]) < f.r + h.r * 0.5)) hwStitch.push(id);
    }
  }
  const uniq = (a: string[]) => [...new Set(a)];
  const names = (ids: string[]) => uniq(ids).slice(0, 3).map((id) => byId.get(id)?.name ?? id).join(", ") + (uniq(ids).length > 3 ? " and others" : "");
  if (near.length) issues.push({ code: "HOLES_NEAR_EDGE", level: "warn", message: `Stitch holes come closer than half the edge distance to the edge on ${names(near)}; they may tear out.`, fixes: [{ id: "edge", label: "Edge distance 4 mm", safe: false, apply: (q) => ({ ...q, stitch: { ...q.stitch, edge: Math.max(q.stitch.edge, 4) } }) }], partIds: uniq(near) });
  if (clash.length) issues.push({
    code: "HOLES_OVERLAP", level: "warn", message: `Holes run into each other (less than 0.8 mm between them) on ${names(clash)}.`,
    fixes: [{ id: "pitch", label: "Pitch 4 mm, holes 1.2 mm", safe: false, apply: (q) => ({ ...q, stitch: { ...q.stitch, pitch: Math.max(q.stitch.pitch, 4), hole: Math.min(q.stitch.hole, 1.2) } }) }], partIds: uniq(clash),
  });
  if (hwEdge.length) issues.push({ code: "HARDWARE_EDGE", level: "warn", message: `A fitting's cap overhangs the edge on ${names(hwEdge)}; use smaller hardware or a wider part.`, fixes: [], partIds: uniq(hwEdge) });
  if (hwStitch.length) issues.push({ code: "HARDWARE_ON_STITCHING", level: "warn", message: `A fitting sits on a stitch line on ${names(hwStitch)}; move it or use smaller hardware.`, fixes: [], partIds: uniq(hwStitch) });

  // ---- decoration
  if (p.decor.style !== "none") {
    if (!info.decor) issues.push({ code: "DECOR_SKIPPED", level: "info", message: "There is no room for the decoration inside the stitching and fittings on this design.", fixes: [{ id: "smaller", label: "Smaller pattern", safe: true, apply: (q) => ({ ...q, decor: { ...q.decor, scale: Math.max(6, q.decor.scale * 0.7) } }) }] });
    else if (p.decor.mode === "perforate" && info.decor.area / Math.max(1, info.decor.region) > 0.45) issues.push({ code: "DECOR_WEAK", level: "warn", message: `The perforation removes ${Math.round((100 * info.decor.area) / info.decor.region)} % of the leather in its area; the panel will stretch and tear.`, fixes: [{ id: "bar", label: "Thicker bars", safe: true, apply: (q) => ({ ...q, decor: { ...q.decor, bar: Math.max(q.decor.bar * 1.6, 2.5) } }) }, { id: "engrave", label: "Engrave it instead", safe: false, apply: (q) => ({ ...q, decor: { ...q.decor, mode: "engrave" } }) }] });
    if (p.decor.mode === "perforate" && p.decor.bar < 1.2) issues.push({ code: "DECOR_BARS", level: "warn", message: `Bars of ${p.decor.bar} mm between perforations are weak in leather; 1.5 mm or more holds better.`, fixes: [{ id: "bar", label: "Bars 1.6 mm", safe: true, apply: (q) => ({ ...q, decor: { ...q.decor, bar: 1.6 } }) }] });
  }

  if (info.notes.some((n) => n.includes("bank card"))) issues.push({ code: "CARD_FIT", level: "warn", message: info.notes.find((n) => n.includes("bank card"))!, fixes: [{ id: "wider", label: "Width for cards", safe: true, apply: (q) => ({ ...q, size: { ...q.size, width: Math.max(q.size.width, 2 * (94 + 2 * q.stitch.edge)) } }) }] });
  const longest = Math.max(0, ...out.parts.map((q) => { const xs = q.outer.map((a) => a[0]); return Math.max(...xs) - Math.min(...xs); }));
  if (longest > Math.max(p.bedW, p.bedH) - 10) issues.push({ code: "LONGER_THAN_BED", level: "info", message: `The ${PRODUCT_NAME(p)} is ${Math.round(longest)} mm long, longer than the ${p.bedW} × ${p.bedH} mm bed: cut the strap from a blank with a strap cutter and use the hand-cutting template for its ends, or use a larger bed.`, fixes: [{ id: "manual", label: "Make the hand-cutting template", safe: false, apply: (q) => ({ ...q, stitch: { ...q.stitch, mode: "manual" } }) }] });
  if (p.T > 4.5) issues.push({ code: "THICK", level: "info", message: `${p.T} mm is heavy for stitched seams; check that your needle and irons go through two layers.`, fixes: [] });
  return issues;
}
