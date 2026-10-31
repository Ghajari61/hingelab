import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { BOXES } from "../boxes";
import { buildBoxes, type BoxesOutput } from "../boxes/build";
import { checkBoxes } from "../boxes/check";
import { mergeBoxes, type BoxesParams } from "../boxes/params";
import { bboxOf } from "../geom";
import { placePoint as world } from "../place";
import type { GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;
const issuesOf = (p: BoxesParams) => checkBoxes(p, buildBoxes(p, CTX) as BoxesOutput);
const codes = (raw: unknown) => issuesOf(mergeBoxes(raw)).map((i) => i.code);
const holeD = (pt: GenPart) => { const b = bboxOf([pt.holes[0]]); return b.x1 - b.x0; };
/** The plan-space box (x, y, z) a part fills, from its outline's corners through its placement. */
function space(pt: GenPart, T: number) {
  const b = bboxOf([pt.outer]);
  const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].flatMap(([u, v]) => [world(pt.place!, u, v, 0), world(pt.place!, u, v, T)]);
  const ax = (k: number) => [Math.min(...pts.map((q) => q[k])), Math.max(...pts.map((q) => q[k]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

describe("Book box closure", () => {
  it("magnets by default: a cap, two fins and a pocket patch per pair, stacked from the floor to the cover", () => {
    const p = mergeBoxes({ design: "book" }), T = p.T, Dk = p.book.thickness;
    const out = build({ design: "book" });
    const ids = out.parts.map((q) => q.id);
    expect(ids.filter((i) => i.startsWith("magnet-"))).toEqual(["magnet-cap1", "magnet-fin1-1", "magnet-fin1-2", "magnet-patch1"]);
    const cap = out.parts.find((q) => q.id === "magnet-cap1")!, patch = out.parts.find((q) => q.id === "magnet-patch1")!;
    expect(holeD(cap)).toBeCloseTo(6.2, 1);
    expect(holeD(patch)).toBeCloseTo(6.2, 1);
    // slots in the cap match the fins' tabs: the material thickness plus clearance
    const slot = bboxOf([cap.holes[1]]);
    expect(slot.y1 - slot.y0).toBeCloseTo(T + 0.1, 3);
    const fin = space(out.parts.find((q) => q.id === "magnet-fin1-1")!, T), c = space(cap, T), pa = space(patch, T);
    expect(fin.z[0]).toBeCloseTo(T, 3);                 // on the back cover
    expect(fin.z[1]).toBeCloseTo(c.z[1], 3);            // tabs flush with the cap's top
    expect(pa.z[0]).toBeCloseTo(c.z[1], 3);             // patch on the cap: the magnets meet
    expect(pa.z[1]).toBeCloseTo(Dk - T, 3);             // patch under the front cover
    // against the fore-edge wall, inside the book
    expect(c.x[1]).toBeCloseTo(p.book.width - p.book.over - T, 3);
    expect(out.stats.find((s) => s.label === "Closure")!.value).toMatch(/1 pair of 6 × 2 mm/);
    expect(out.assembly!.join(" ")).toMatch(/magnet/i);
    expect(codes({ design: "book" })).toEqual([]);
  });

  it("two pairs near the head and tail", () => {
    const out = build({ design: "book", book: { magnets: 2, height: 220 } });
    const caps = out.parts.filter((q) => q.id.startsWith("magnet-cap"));
    expect(caps.length).toBe(2);
    const ys = caps.map((q) => space(q, 3).y[0]);
    expect(Math.abs(ys[1] - ys[0])).toBeGreaterThan(80);
  });

  it("ribbon tie: a slot in each cover; none: no catch, and the assembly says so", () => {
    const rib = build({ design: "book", book: { close: "ribbon", ribbon: 12 } });
    const plain = build({ design: "book", book: { close: "none" } });
    const cover = (o: BoxesOutput) => o.parts.find((q) => q.id === "cover")!;
    expect(cover(rib).holes.length - cover(plain).holes.length).toBe(2);
    const added = cover(rib).holes.filter((h) => !cover(plain).holes.some((g) => JSON.stringify(g) === JSON.stringify(h)));
    for (const h of added) { const b = bboxOf([h]); expect(b.y1 - b.y0).toBeCloseTo(13, 3); }
    expect(rib.parts.some((q) => q.id.startsWith("magnet-"))).toBe(false);
    expect(plain.assembly!.join(" ")).toMatch(/springs it open/);
  });

  it("checks: too thin for towers, and magnets thicker than the patch, each with a fix", () => {
    const thin = mergeBoxes({ design: "book", book: { thickness: 16 } });
    expect(issuesOf(thin).map((i) => i.code)).toContain("BOOK_MAGNET_ROOM");
    expect(issuesOf(autoFixAll(thin, issuesOf).params).map((i) => i.code)).not.toContain("BOOK_MAGNET_ROOM");
    const thick = mergeBoxes({ design: "book", book: { magnetT: 5 } });
    const issue = issuesOf(thick).find((i) => i.code === "BOOK_MAGNET_THICK")!;
    expect(issue).toBeDefined();
    expect(issuesOf(issue.fixes[0].apply(thick)).map((i) => i.code)).not.toContain("BOOK_MAGNET_THICK");
  });

  it("the book presets close with magnets and build without warnings", () => {
    for (const pr of BOXES.presets.filter((x) => (x.params as { design?: string }).design === "book")) {
      const p = BOXES.merge(pr.params);
      const out = buildBoxes(p, CTX) as BoxesOutput;
      expect(out.parts.some((q) => q.id === "magnet-cap1"), pr.id).toBe(true);
      expect(issuesOf(p).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });
});
