import { describe, expect, it } from "vitest";
import { makeShape, offsetShapes, totalArea, unionShapes } from "@/lib/letters/polygon";
import { bboxOf, signedArea } from "../geom";
import { SHADOWBOX } from "../shadowbox";
import type { ShadowBoxOutput } from "../shadowbox/build";
import { CELLS, FRAMES, HOLES, MAT_MM, OPENINGS, PATTERNS, RIDGES, SIZES, mergeShadowBox, type ShadowBoxParams } from "../shadowbox/params";
import { SHADOWBOX_FEATURED } from "../shadowbox/featured";
import { START_LAZY } from "../startPresets";
import { arrangeGenerator, genSVG } from "../output";
import type { ChoiceSpec } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => SHADOWBOX.build(mergeShadowBox(raw), CTX) as ShadowBoxOutput;
const layers = (out: ShadowBoxOutput) => out.parts.filter((p) => p.id.startsWith("layer"));
const area = (p: { outer: [number, number][]; holes: [number, number][][] }) => Math.abs(signedArea(p.outer)) - p.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0);
const choice = (key: string) => SHADOWBOX.sections.flatMap((s) => s.fields).find((f) => f.key === key) as ChoiceSpec<ShadowBoxParams>;

describe("shadow box", () => {
  it("has 134 presets that all build with no errors or warnings", () => {
    expect(SHADOWBOX.presets).toHaveLength(134);
    expect(new Set(SHADOWBOX.presets.map((p) => p.id)).size).toBe(134);
    for (const pr of SHADOWBOX.presets) {
      const p = SHADOWBOX.merge(pr.params);
      const out = SHADOWBOX.build(p, CTX);
      expect(out.error, pr.id).toBeUndefined();
      expect(layers(out), pr.id).toHaveLength(p.stack.count);
      expect(SHADOWBOX.check(p, out).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
    }
  });

  it("the start page's featured cards match built-in presets", async () => {
    const lazy = START_LAZY.shadowbox!;
    expect(lazy.count).toBe(SHADOWBOX.presets.length);
    expect(SHADOWBOX.presets.some((p) => p.id === lazy.cover)).toBe(true);
    expect((await lazy.load()).map((p) => p.id)).toEqual(SHADOWBOX_FEATURED.map((c) => c.id));
    for (const c of SHADOWBOX_FEATURED) expect(SHADOWBOX.presets.find((p) => p.id === c.id), c.id).toMatchObject({ name: c.name, note: c.note });
  });

  it("every layer keeps the frame's outline and its whole border", () => {
    for (const frame of FRAMES) {
      const out = build({ frame: { shape: frame, width: 200, height: 180, border: 12 }, design: { pattern: "tunnel", opening: "frame", max: 100, twist: 0 } });
      const outline = bboxOf([out.parts[0].outer]);
      for (const l of layers(out)) {
        const b = bboxOf([l.outer]);
        const r = (v: number) => Math.round(v * 10) / 10 + 0;
        expect([b.x0, b.y0, b.x1, b.y1].map(r), `${frame} ${l.id}`).toEqual([outline.x0, outline.y0, outline.x1, outline.y1].map(r));
        expect(Math.abs(signedArea(l.outer)), `${frame} ${l.id}`).toBeCloseTo(Math.abs(signedArea(out.parts[0].outer)), 0);
      }
      // The front layer's cut-out is the whole window, so what is left is the border ring.
      const front = layers(out).at(-1)!;
      const ring = offsetShapes([makeShape(out.parts[0].outer, [])], -12);
      const want = Math.abs(signedArea(out.parts[0].outer)) - totalArea(ring);
      expect(Math.abs(area(front) - want), frame).toBeLessThan(want * 0.005);
    }
  });

  it("cut-outs grow from the back to the front", () => {
    const out = build({ stack: { count: 8, back: true }, design: { pattern: "tunnel", opening: "polygon", sides: 6, min: 20, max: 90 } });
    const holes = layers(out).map((l) => l.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0));
    expect(holes[0]).toBe(0);
    for (let k = 2; k < holes.length; k++) expect(holes[k]).toBeGreaterThan(holes[k - 1]);
  });

  it("leaves no paper narrower than the bridge width", () => {
    for (const pattern of PATTERNS) {
      const out = build({ design: { pattern, web: 2, count: 24, pitch: 12 } });
      for (const l of layers(out)) {
        const s = unionShapes([l.outer, ...l.holes], [], true);
        const open = offsetShapes(offsetShapes(s, -0.95, "miter"), 0.95, "miter");
        expect(totalArea(open) / totalArea(s), `${pattern} ${l.id}`).toBeGreaterThan(0.995);
      }
    }
  });

  it("every pattern, shape, ridge and cell builds", () => {
    for (const opening of OPENINGS) for (const pattern of ["tunnel", "mandala"] as const) expect(build({ design: { pattern, opening } }).error, `${pattern} ${opening}`).toBeUndefined();
    for (const ridge of RIDGES) for (const from of ["bottom", "top", "both"] as const) expect(build({ design: { pattern: "landscape", ridge, from } }).error, `${ridge} ${from}`).toBeUndefined();
    for (const cell of CELLS) expect(layers(build({ design: { pattern: "lattice", cell } }))[3].holes.length, cell).toBeGreaterThan(10);
    expect(layers(build({ design: { pattern: "sunburst", count: 12 } }))[3].holes).toHaveLength(1);
  });

  it("stacks the layers with foam or spacer frames", () => {
    const foam = build({ T: 2, stack: { count: 6, spacer: "none", gap: 3 } });
    expect(layers(foam).map((l) => l.place!.z)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(foam.info!.depth).toBe(27);
    const framed = build({ T: 2, stack: { count: 6, spacer: "frames", per: 2 } });
    expect(framed.parts.filter((p) => p.id.startsWith("spacer"))).toHaveLength(10);
    expect(framed.info!.depth).toBe(6 * 2 + 5 * 4);
    const zs = framed.parts.map((p) => p.place!.z);
    expect(zs).toEqual([...zs].sort((a, b) => a - b));
    expect(framed.stats.find((s) => s.label === "Spacer frames")!.value).toBe("10");
  });

  it("a light hole goes through the back board only", () => {
    const out = build({ stack: { back: true }, design: { pattern: "landscape", moon: true } });
    expect(layers(out)[0].holes).toHaveLength(1);
    expect(build({ stack: { back: true } }).parts[0].holes).toHaveLength(0);
  });

  it("the blade cutter draws for a Cricut mat with no kerf, and pickers start each pattern sensibly", () => {
    const p = choice("cutter.kind").apply!(mergeShadowBox({}), "blade");
    expect(p).toMatchObject({ K: 0, bedW: MAT_MM, bedH: MAT_MM, material: "custom", cutter: { kind: "blade" } });
    expect(choice("cutter.kind").apply!(p, "laser")).toMatchObject({ material: "card2", cutter: { kind: "laser" } });
    const land = choice("design.ridge").apply!(mergeShadowBox({}), "waves");
    expect(land.design).toMatchObject({ pattern: "landscape", ridge: "waves", min: 34, max: 84 });
    const out = SHADOWBOX.build(land, CTX) as ShadowBoxOutput;
    expect(out.info!.open).toBeLessThanOrEqual(1);
  });

  it("a border that leaves no window is an error with a fix", () => {
    const p = mergeShadowBox({ frame: { width: 80, height: 80, border: 45 } });
    const out = SHADOWBOX.build(p, CTX);
    expect(out.error).toBeTruthy();
    const issue = SHADOWBOX.check(p, out).find((i) => i.code === "NO_WINDOW")!;
    expect(SHADOWBOX.build(issue.fixes[0].apply(p), CTX).error).toBeUndefined();
  });

  it("light holes take every shape and size, in the window", () => {
    const backArea = (raw: unknown) => { const l = layers(build(raw))[0]; return l.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0); };
    for (const hole of HOLES) {
      const out = build({ stack: { back: true }, design: { pattern: "landscape", moon: true, hole, holeSize: 30 } });
      const back = layers(out)[0];
      expect(back.holes.length, hole).toBeGreaterThan(0);
      const win = { x0: 12, y0: 12, x1: 188, y1: 188 };
      const b = bboxOf(back.holes);
      expect(b.x0 >= win.x0 && b.y0 >= win.y0 && b.x1 <= win.x1 && b.y1 <= win.y1, hole).toBe(true);
    }
    expect(backArea({ design: { moon: true, holeSize: 30 } })).toBeGreaterThan(backArea({ design: { moon: true, holeSize: 15 } }) * 3.5);
    expect(choice("design.hole").apply!(mergeShadowBox({}), "heart").design).toMatchObject({ moon: true, hole: "heart" });
  });

  it("words on the front layer hold together and shrink to fit the window", () => {
    const plain = build({ stack: { count: 6 }, design: { max: 200 } });
    const out = build({ stack: { count: 6 }, design: { max: 200 }, text: { text: "Sweet dreams", fontId: "lobster", size: 20 } });
    expect(out.error).toBeUndefined();
    const [a, b] = [layers(plain), layers(out)];
    // Only the front layer changes, and it is still one piece with more paper (the words and their bar).
    for (let k = 0; k < 5; k++) expect(area(b[k]), `layer ${k}`).toBeCloseTo(area(a[k]), 3);
    expect(area(b[5])).toBeGreaterThan(area(a[5]) + 500);
    expect(out.info!.textSize).toBe(20);
    expect(out.info!.dropped).toBe(0);
    const long = mergeShadowBox({ text: { text: "Happy Birthday Alexander", size: 30 } });
    const res = SHADOWBOX.build(long, CTX) as ShadowBoxOutput;
    expect(res.info!.textSize!).toBeLessThan(30);
    expect(res.info!.textW!).toBeLessThanOrEqual(res.info!.textRoom! + 0.5);
    expect(SHADOWBOX.check(long, res).map((i) => i.code)).toContain("TEXT_FIT");
    expect(SHADOWBOX.fonts!(long)).toEqual(["lobster"]);
    expect(SHADOWBOX.fonts!(mergeShadowBox({}))).toEqual([]);
    // Without a text renderer the build waits for the font.
    expect(SHADOWBOX.build(long, {}).notice).toBe("Loading the font.");
  });

  it("frame sizes set the layers for standard frames, and other sizes read as custom", () => {
    const p = choice("frame.size").apply!(mergeShadowBox({}), "8x10");
    expect(p.frame).toMatchObject({ width: 200, height: 251 });
    expect(mergeShadowBox(p).frame.size).toBe("8x10");
    expect(mergeShadowBox({ frame: { width: 210, height: 251 } }).frame.size).toBe("custom");
    for (const [id, s] of Object.entries(SIZES)) expect(mergeShadowBox({ frame: { width: s.w, height: s.h } }).frame.size, id).toBe(id);
    // A capsule on a square frame would be a circle: picking it turns the frame landscape.
    expect(mergeShadowBox(choice("frame.shape").apply!(mergeShadowBox({}), "pill")).frame).toMatchObject({ shape: "pill", width: 175, height: 124, size: "7x5" });
    expect(choice("frame.shape").apply!(mergeShadowBox({ frame: { width: 220, height: 220 } }), "pill").frame).toMatchObject({ width: 220, height: 136 });
    expect(choice("frame.shape").apply!(mergeShadowBox({ frame: { width: 240, height: 150 } }), "pill").frame).toMatchObject({ width: 240, height: 150 });
  });

  it("soft shapes, flowing stripes and sine ridges build as one piece per layer", () => {
    for (const opening of ["oval", "squircle", "wavy", "orbit"] as const) {
      const out = build({ design: { pattern: "tunnel", opening, twist: 0 } });
      expect(out.error, opening).toBeUndefined();
      expect(layers(out)[3].holes.length, opening).toBe(1);
    }
    for (const frame of ["squircle", "blossom", "pill"] as const) expect(build({ frame: { shape: frame } }).error, frame).toBeUndefined();
    const flow = build({ stack: { count: 6 }, design: { pattern: "flow", count: 6, waves: 2, amp: 30, min: 25, max: 85, web: 1.5 } });
    const slots = layers(flow).slice(1).map((l) => l.holes.length);
    expect(Math.min(...slots)).toBeGreaterThanOrEqual(6);
    const open = layers(flow).slice(1).map((l) => l.holes.reduce((a, h) => a + Math.abs(signedArea(h)), 0));
    for (let k = 1; k < open.length; k++) expect(open[k]).toBeGreaterThan(open[k - 1]);
    expect(flow.info!.dropped).toBe(0);
  });

  it("a photo sits on a plain back board, covers the window and replaces the light hole", () => {
    const JPG = "data:image/jpeg;base64,AAAA";
    const raw = { stack: { count: 6, back: false }, frame: { width: 200, height: 160, border: 12 }, design: { moon: true }, photo: { image: JPG, aspect: 0.75 } };
    const out = build(raw);
    const ls = layers(out);
    expect(ls).toHaveLength(6);
    expect(ls[0].holes).toEqual([]);
    expect(ls[0].images).toHaveLength(1);
    expect(ls.slice(1).every((l) => !l.images)).toBe(true);
    // Every zoom and shift still covers the window and its bleed.
    for (const zoom of [100, 180]) for (const x of [-100, 0, 100]) for (const y of [-100, 100]) for (const aspect of [0.5, 1.25, 3]) {
      const im = build({ ...raw, photo: { image: JPG, aspect, zoom, x, y } }).parts[0].images![0];
      const c = bboxOf([im.clip!]);
      expect(im.x, `${zoom} ${x} ${y} ${aspect}`).toBeLessThanOrEqual(c.x0 + 0.01);
      expect(im.y).toBeLessThanOrEqual(c.y0 + 0.01);
      expect(im.x + im.w).toBeGreaterThanOrEqual(c.x1 - 0.01);
      expect(im.y + im.h).toBeGreaterThanOrEqual(c.y1 - 0.01);
      expect(im.w / im.h).toBeCloseTo(aspect, 2);
    }
    const im = ls[0].images![0], c = bboxOf([im.clip!]);
    expect(c.x1 - c.x0).toBeCloseTo(176 + 6, 0);
    expect(c.x0).toBeGreaterThan(bboxOf([ls[0].outer]).x0);
    // Shifting right shows more of the photo's left side.
    const left = build({ ...raw, photo: { image: JPG, aspect: 3, x: 100 } }).parts[0].images![0];
    expect(left.x).toBeCloseTo(c.x0, 1);
    expect(out.stats.find((s) => s.label === "Photo shows")?.value).toBe("176 × 136 mm");
    expect(out.assembly!.some((a) => /photo is on Layer 1/.test(a))).toBe(true);
    // Only picture data URLs are kept.
    expect(mergeShadowBox({ photo: { image: "javascript:alert(1)" } }).photo.image).toBe("");
    expect(mergeShadowBox({ photo: { image: 5, zoom: 900, x: -500, aspect: -1 } }).photo).toMatchObject({ image: "", zoom: 300, x: -100, aspect: 1.5 });
    const svg = genSVG(SHADOWBOX, mergeShadowBox(raw), arrangeGenerator(SHADOWBOX, mergeShadowBox(raw), CTX).lay!);
    expect(svg.match(/<image /g)).toHaveLength(1);
    expect(svg).toMatch(/<image [^>]*clip-path="url\(#engrave-clip-0\)"[^>]*href="data:image\/jpeg;base64,AAAA"/);
    // Without a photo nothing changes.
    // Small back cut-outs hide the photo: a note says how much shows and the fix opens them up.
    const portal = SHADOWBOX.merge({ ...SHADOWBOX.presets.find((x) => x.id === "oval-portal")!.params, photo: { image: JPG } });
    const hidden = SHADOWBOX.check(portal, SHADOWBOX.build(portal, CTX)).find((i) => i.code === "PHOTO_HIDDEN")!;
    expect(hidden.message).toMatch(/^Only about \d+% of the photo shows/);
    const opened = hidden.fixes[0].apply(portal);
    const after = SHADOWBOX.build(opened, CTX) as ShadowBoxOutput;
    expect(after.info!.photoShown).toBeGreaterThanOrEqual(25);
    expect(SHADOWBOX.check(opened, after).map((i) => i.code)).not.toContain("PHOTO_HIDDEN");
    const plain = build({ ...raw, photo: { image: "" } }).parts[0];
    expect(plain.holes.length).toBeGreaterThan(0);
    expect(plain.images).toBeUndefined();
  });

  it("colours shade from the back to the front and paper looks matte", () => {
    const out = build({ look: { palette: "ocean" }, stack: { count: 5 } });
    expect(layers(out).map((l) => l.color)).toEqual(["#0b2545", "#13315c", "#1d7ea8", "#8dd3e8", "#e8f7fb"]);
    expect(out.parts.every((p) => p.matte)).toBe(true);
    expect(out.stacked).toBe(true);
  });
});
