import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPLATE_BY_ID } from "@/lib/templates/catalog";
import { templateDocument } from "@/lib/templates/open";
import { buildBoxes, type BoxesOutput } from "@/lib/generators/boxes/build";
import { mergeBoxes } from "@/lib/generators/boxes/params";
import { placePoint } from "@/lib/generators/place";
import type { GenPart } from "@/lib/generators/types";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { createDocument } from "../../doc";
import { mul, rotateAt } from "../../geom";
import type { Document, Mat, PathNode } from "../../types";
import { assemble } from "../index";
import { applyFix, applyIssues, safeIssues } from "../fixes";
import { apply } from "../mat3";

type Pt = [number, number];

/** The generator's parts laid out in a row on one sheet, every other one turned 90°, as paths on the cut layer. */
function docOf(parts: { outer: Pt[]; holes: Pt[][]; engrave?: Pt[][]; name: string }[], materialId = "birch3", turn = true): Document {
  const doc = createDocument({ name: "Test", sheet: { w: 4000, h: 1000 }, materialId, now: "2026-10-13T00:00:00.000Z", id: "t" });
  let x = 10;
  parts.forEach((p, i) => {
    const xs = p.outer.map((q) => q[0]), ys = p.outer.map((q) => q[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const turned = turn && i % 2 === 1;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const ww = turned ? h : w, hh = turned ? w : h;
    const m: Mat = mul([1, 0, 0, 1, x + ww / 2 - cx, 10 + hh / 2 - cy], turned ? rotateAt(90, cx, cy) : [1, 0, 0, 1, 0, 0]);
    x += ww + 10;
    const sub = (c: Pt[]) => ({ closed: true, nodes: c.map(([a, b]) => ({ x: a, y: b })) });
    const node: PathNode = { id: `n${i}`, type: "path", name: p.name, transform: m, layer: 2, subpaths: [sub(p.outer), ...p.holes.map(sub)] };
    doc.root.children.push(node);
    if (p.engrave?.length) doc.root.children.push({ id: `e${i}`, type: "path", transform: m, layer: 0, subpaths: p.engrave.map(sub) } as PathNode);
  });
  return doc;
}

const build = (raw: unknown) => buildBoxes(mergeBoxes(raw), CTX) as BoxesOutput;

/** Size of the generator's own 3D model. */
function genSize(parts: GenPart[], T = 3): number[] {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) for (const [u, v] of p.outer) for (const h of [0, p.t ?? T]) {
    const q = placePoint(p.place!, u, v, h);
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
  }
  return hi.map((v, i) => v - lo[i]);
}
const size = (a: ReturnType<typeof assemble>) => a.hi.map((v, i) => v - a.lo[i]);
const sorted = (v: number[]) => [...v].sort((a, b) => a - b);

const pairs = new Set<string>();
const pairHits = new Map<string, number>();
/** Every corner of every slab, so parts can be checked for crossing each other. */
function slabsOverlap(a: ReturnType<typeof assemble>): number {
  // Sample points inside each part's material and count those that fall inside another part's slab.
  const inPoly = (p: Pt, c: Pt[]) => {
    let r = false;
    for (let i = 0, j = c.length - 1; i < c.length; j = i++) if ((c[i][1] > p[1]) !== (c[j][1] > p[1]) && p[0] < ((c[j][0] - c[i][0]) * (p[1] - c[i][1])) / (c[j][1] - c[i][1]) + c[i][0]) r = !r;
    return r;
  };
  const inv = (m: number[], q: number[]) => {
    // Rigid motion: inverse is the transpose.
    const d = [q[0] - m[3], q[1] - m[7], q[2] - m[11]];
    return [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];
  };
  const solid = (p: (typeof a.parts)[number], u: number, v: number) => inPoly([u, v], p.outer) && !p.holes.some((h) => inPoly([u, v], h));
  let bad = 0;
  pairs.clear();
  pairHits.clear();
  for (const p of a.parts) {
    for (let v = 1.3; v < p.h; v += 4.1) for (let u = 1.7; u < p.w; u += 4.1) {
      if (!solid(p, u, v)) continue;
      const P = apply(p.m, [u, -v, p.t / 2]);
      for (const q of a.parts) {
        if (q === p) continue;
        const [x, y, z] = inv(q.m, P);
        if (z > 0.2 && z < q.t - 0.2 && solid(q, x, -y)) {
          bad++;
          const k = `${p.name} × ${q.name}`;
          pairs.add(k);
          pairHits.set(k, (pairHits.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return bad;
}

describe("3D assembly of a Studio drawing", () => {
  it("puts a closed finger-joint box together at the generator's size", () => {
    const out = build({ design: "box", box: { lid: "closed" } });
    const a = assemble(docOf(out.parts));
    expect(a.box).not.toBeNull();
    expect(a.joined).toBe(out.parts.length);
    expect(a.parts.every((p) => p.role !== "loose")).toBe(true);
    expect(sorted(size(a))).toEqual(sorted(genSize(out.parts)).map((v) => expect.closeTo(v, 0)));
    expect(a.issues.filter((i) => i.level !== "info")).toEqual([]);
    expect(slabsOverlap(a)).toBe(0);
  });

  it("puts an open box together with its top edge up", () => {
    const out = build({ design: "box", box: { lid: "open", width: 150, depth: 90, height: 70 } });
    const a = assemble(docOf(out.parts));
    expect(a.joined).toBe(out.parts.length);
    expect(sorted(size(a))).toEqual(sorted(genSize(out.parts)).map((v) => expect.closeTo(v, 0)));
    expect(a.hi[2] - a.lo[2]).toBeCloseTo(genSize(out.parts)[2], 0);
    expect(slabsOverlap(a)).toBe(0);
  });

  it("stands a tray's dividers in the tray", () => {
    const out = build({ design: "tray" });
    const a = assemble(docOf(out.parts));
    expect(a.joined).toBe(out.parts.length);
    expect(sorted(size(a))).toEqual(sorted(genSize(out.parts)).map((v) => expect.closeTo(v, 0)));
    expect(a.parts.filter((p) => p.role === "divider").length).toBe(out.parts.length - 5);
    expect(slabsOverlap(a)).toBe(0);
  });

  it("stands a desk sign's plate in its base slots", () => {
    const out = build({ design: "sign" });
    const a = assemble(docOf(out.parts.map((p) => ({ ...p, engrave: undefined }))));
    expect(a.joined).toBe(out.parts.length);
    expect(sorted(size(a))).toEqual(sorted(genSize(out.parts)).map((v) => expect.closeTo(v, 0)));
    expect(slabsOverlap(a)).toBe(0);
  });

  it("stands a tab-and-slot box's walls in its bottom and puts the top on their tabs", () => {
    const out = build({ design: "box", joint: { style: "tabs" } });
    const a = assemble(docOf(out.parts));
    expect(a.joined).toBe(out.parts.length);
    expect(size(a)).toEqual(genSize(out.parts).map((v) => expect.closeTo(v, 0)));
    expect(a.parts.find((p) => p.name === "Bottom")?.role).toBe("bottom");
    expect(a.parts.find((p) => p.name === "Top")?.role).toBe("top");
    expect(slabsOverlap(a)).toBe(0);
  });

  it("joins a box cut for 6 mm on a 3 mm sheet and offers both fixes", () => {
    const out = buildBoxes(mergeBoxes({ design: "box", T: 6, material: "birch6" }), CTX) as BoxesOutput;
    const a = assemble(docOf(out.parts));
    expect(a.joined).toBe(out.parts.length);
    expect(sorted(size(a))).toEqual(sorted(genSize(out.parts, 6)).map((v) => expect.closeTo(v, 0)));
    const fit = a.issues.find((i) => i.id === "fit-3");
    expect(fit?.title).toBe("Joints don't fit 3 mm material");
    expect(fit?.detail).toContain("cut for 6 mm");
  });

  it("builds a drawer cabinet upright and each drawer as its own box", () => {
    const out = build({ design: "drawer" });
    const a = assemble(docOf(out.parts));
    expect(a.joined).toBe(out.parts.length);
    expect(a.parts.filter((p) => p.role === "bottom").map((p) => p.name).sort()).toEqual(["Cabinet bottom", "Drawer 1 bottom", "Drawer 2 bottom"]);
    expect(a.parts.find((p) => p.name === "Cabinet top")?.role).toBe("top");
    slabsOverlap(a);
    expect([...pairs]).toEqual([]);
  });

  it("lays a lone rectangle flat and says nothing joins", () => {
    const a = assemble(docOf([{ name: "Plate", outer: [[0, 0], [100, 0], [100, 60], [0, 60]], holes: [] }]));
    expect(a.parts).toHaveLength(1);
    expect(a.parts[0].role).toBe("loose");
    expect(size(a)).toEqual([expect.closeTo(100, 5), expect.closeTo(60, 5), expect.closeTo(3, 5)]);
    expect(a.issues.map((i) => i.id)).toContain("nojoin");
  });

  it("finds joints cut for the wrong material and fits them in one fix", () => {
    const out = build({ design: "box", box: { lid: "closed" } });
    const doc = docOf(out.parts, "card2");
    const a = assemble(doc);
    expect(a.joined).toBe(out.parts.length);
    const fit = a.issues.find((i) => i.id.startsWith("fit-"));
    expect(fit?.fix?.kind).toBe("anchors");
    expect(fit?.safe).toBe(true);
    expect(fit?.alt?.fix).toMatchObject({ kind: "material" });
    applyFix(doc, fit!.fix!);
    const b = assemble(doc);
    expect(b.issues.filter((i) => i.id.startsWith("fit-"))).toEqual([]);
    expect(b.joined).toBe(out.parts.length);
    expect(slabsOverlap(b)).toBe(0);
    // The other way: the material that matches the joints.
    const doc2 = docOf(out.parts, "card2");
    applyFix(doc2, assemble(doc2).issues.find((i) => i.id.startsWith("fit-"))!.alt!.fix);
    expect(assemble(doc2).issues.filter((i) => i.id.startsWith("fit-"))).toEqual([]);
  });

  it("applies hand adjustments on top of the solved placement", () => {
    const out = build({ design: "box", box: { lid: "closed" } });
    const doc = docOf(out.parts);
    const a = assemble(doc);
    const k = a.parts[0].key;
    const c0 = apply(a.parts[0].m, [0, 0, 0]);
    doc.assembly = { parts: { [k]: { move: [10, 0, 5] }, [a.parts[1].key]: { hidden: true } } };
    const b = assemble(doc);
    const c1 = apply(b.parts[0].m, [0, 0, 0]);
    expect(c1.map((v, i) => v - c0[i])).toEqual([expect.closeTo(10, 6), expect.closeTo(0, 6), expect.closeTo(5, 6)]);
    expect(b.parts[1].hidden).toBe(true);
    doc.assembly = { parts: { [k]: { flat: true } } };
    expect(assemble(doc).parts[0].role).toBe("loose");
  });

  it("turns a part that hangs off the sheet back onto it", () => {
    const doc = createDocument({ name: "Paper Tray", sheet: { w: 600, h: 308 }, id: "p" });
    doc.root.children.push({ id: "r", type: "path", transform: [1, 0, 0, 1, 250, 0], layer: 2, subpaths: [{ closed: true, nodes: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 500 }, { x: 0, y: 500 }] }] } as PathNode);
    const a = assemble(doc);
    const off = a.issues.find((i) => i.id.startsWith("sheet-"));
    expect(off?.fixLabel).toBe("Turn onto the sheet");
    applyIssues(doc, safeIssues(a));
    expect(assemble(doc).issues.find((i) => i.id.startsWith("sheet-"))).toBeUndefined();
  });

  it("closes a cut whose ends nearly meet", () => {
    const doc = createDocument({ name: "Gap", id: "g" });
    doc.root.children.push({ id: "o", type: "path", transform: [1, 0, 0, 1, 10, 10], layer: 2, subpaths: [{ closed: false, nodes: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }, { x: 0, y: 1 }] }] } as PathNode);
    const a = assemble(doc);
    expect(a.parts).toHaveLength(0);
    applyIssues(doc, safeIssues(a));
    expect(assemble(doc).parts).toHaveLength(1);
  });

  // Bundled templates are kerf-compensated SVG: outer corners are bevelled and the parts have no names.
  const fetchText = async (url: string) => readFileSync(join(process.cwd(), "public", ...url.split("/").filter(Boolean)), "utf8");
  it.each([
    ["box-dream-bank", 6, 1],
    ["box-recipe", 5, 1],
    ["box-wren-house", 5, 1],
    ["box-craft-stack", 15, 3],
    ["box-three-drawers", 20, 4],
  ] as const)("puts the kerf-compensated %s template together", async (id, joined, bottoms) => {
    const doc = await templateDocument(TEMPLATE_BY_ID[id], { id: "t", fetchText, materialId: "birch3" });
    const a = assemble(doc);
    expect(a.joined).toBe(joined);
    expect(a.parts.filter((p) => p.role === "bottom")).toHaveLength(bottoms);
    expect(a.issues.filter((i) => i.level !== "info").map((i) => i.id)).toEqual([]);
    slabsOverlap(a);
    // Kerf compensation makes touching fingers share a 0.15 mm band; a sample may land in it.
    expect([...pairHits].filter(([, n]) => n > 2)).toEqual([]);
  });
});
