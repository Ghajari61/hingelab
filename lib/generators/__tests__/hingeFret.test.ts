import { describe, expect, it } from "vitest";
import { clone, computeModel, DEFAULTS, exportSVG, layoutParts, type Params, type PlatePart, type WallPart } from "@/lib/hinge";
import { hingeRequestError } from "@/lib/billing/validate";

const box = (over: Partial<Params> = {}): Params => Object.assign(clone(DEFAULTS), over);
const build = (p: Params) => { const m = computeModel(p); if ("error" in m) throw new Error(m.error); return m; };
const lidOf = (m: ReturnType<typeof build>) => m.parts.find((q): q is PlatePart => q.kind === "plate" && q.name === "LID")!;
const walls = (m: ReturnType<typeof build>) => m.parts.filter((q): q is WallPart => q.kind === "wall" && !q.test && !q.divider);
const area = (c: [number, number][]) => { let a = 0; for (let i = 0; i < c.length; i++) { const [x0, y0] = c[i], [x1, y1] = c[(i + 1) % c.length]; a += x0 * y1 - x1 * y0; } return Math.abs(a / 2); };

describe("Hinge Box cut-out pattern: motif, shape and mark", () => {
  const base = { W: 180, D: 120, H: 80, R: 26, fret: "motif" as const, fretCell: 14, fretBar: 2 };

  it("a motif repeats the chosen library shape, not always a heart", () => {
    const heart = build(box(base)), star = build(box({ ...base, fretMotif: "star" }));
    const plain = lidOf(build(box())).slots.length;
    const h = lidOf(heart).slots.slice(plain), s = lidOf(star).slots.slice(plain);
    expect(h.length).toBeGreaterThan(4);
    expect(s.length).toBeGreaterThan(4);
    expect(Math.abs(area(h[0]) - area(s[0]))).toBeGreaterThan(1);
    // Unset, it is the heart as before.
    expect(lidOf(build(box({ ...base, fretMotif: "heart" }))).slots).toEqual(lidOf(heart).slots);
  });

  it("a shape window keeps the pattern in the middle of each face", () => {
    const full = build(box({ ...base, fret: "circles" })), win = build(box({ ...base, fret: "circles", fretShape: "circle", fretSize: 60 }));
    const plain = lidOf(build(box())).slots.length;
    expect(lidOf(win).slots.length - plain).toBeGreaterThan(0);
    expect(lidOf(win).slots.length).toBeLessThan(lidOf(full).slots.length);
    const wh = walls(win).reduce((n, w) => n + (w.holes?.length ?? 0), 0), fh = walls(full).reduce((n, w) => n + (w.holes?.length ?? 0), 0);
    expect(wh).toBeGreaterThan(0);
    expect(wh).toBeLessThan(fh);
  });

  it("engraved or scored, it adds no cuts and goes on its own layer", () => {
    const plain = build(box());
    for (const mark of ["engrave", "score"] as const) {
      const m = build(box({ ...base, fret: "circles", fretMark: mark }));
      expect(lidOf(m).slots.length).toBe(lidOf(plain).slots.length);
      expect(lidOf(m)[mark]!.length).toBeGreaterThan(4);
      expect(walls(m).every((w) => !w.holes?.length)).toBe(true);
      expect(walls(m).some((w) => (w[mark]?.length ?? 0) > 0)).toBe(true);
      const p = box({ ...base, fret: "circles", fretMark: mark });
      const svg = exportSVG(m, layoutParts(m.parts, p.bedW, p.gap), p);
      expect(svg).toContain(mark === "engrave" ? 'id="engrave"' : 'id="score"');
    }
  });

  it("the server checks the new settings", () => {
    expect(hingeRequestError(box({ ...base, fretMotif: "star", fretShape: "heart", fretSize: 50, fretMark: "engrave" }))).toBeNull();
    expect(hingeRequestError(box({ ...base, fretMotif: "<script>" }))).not.toBeNull();
    expect(hingeRequestError(box({ ...base, fretShape: "blob" as never }))).not.toBeNull();
    expect(hingeRequestError(box({ ...base, fretSize: 500 }))).not.toBeNull();
    expect(hingeRequestError(box({ ...base, fretMark: "burn" as never }))).not.toBeNull();
  });
});
