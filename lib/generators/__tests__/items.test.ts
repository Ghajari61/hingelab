import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { sceneModel } from "@/lib/desktop/model3d";
import { BOXES } from "../boxes";
import { CLOCK } from "../clock";
import { rect } from "../geom";
import { generatorGrips, itemGrips, itemKeys } from "../grips3d";
import { itemInName, itemOf, tagByPlace, tagItem } from "../items";
import { KEYRACK } from "../keyrack";
import { PUZZLE } from "../puzzle";
import { QR } from "../qr";
import { generatorScene } from "../scene3d";
import { SHADOWBOX } from "../shadowbox";
import { SIGN } from "../sign";
import { TABLENUM } from "../tablenum";
import { TOPPER } from "../topper";
import { TROPHY } from "../trophy";
import type { AnyGenerator, Contour, GenOutput } from "../types";
import { CTX } from "./ctx";

const build = (g: AnyGenerator, raw: unknown) => g.build(g.merge(raw), CTX) as GenOutput;

/** The names of the 3D objects that are items, as `part · item`. */
function itemNames(g: AnyGenerator, raw: unknown): string[] {
  const p = g.merge(raw);
  const out = build(g, raw);
  expect(out.error).toBeUndefined();
  const names = new Set<string>();
  generatorScene(out, p.T).group.traverse((o) => { if ((o as THREE.Mesh).isMesh && itemInName(o.name)) names.add(o.name); });
  return [...names].sort();
}

/** The items found on a design, by item name only. */
const items = (g: AnyGenerator, raw: unknown) => [...new Set(itemNames(g, raw).map((n) => itemInName(n)!))].sort();

describe("items on a product", () => {
  it("tags contours by the block that holds them, the smallest when blocks overlap, and leaves a border alone", () => {
    const letter = rect(10, 10, 5, 8), dot = rect(40, 12, 4, 4), border = rect(0, 0, 60, 30);
    const cs: Contour[] = [letter, dot, border];
    tagByPlace(cs, [{ item: "Text", cs: [rect(8, 8, 12, 12)] }, { item: "Motif", cs: [rect(36, 8, 14, 14)] }, { item: "Back", cs: [rect(0, 0, 55, 25)] }]);
    expect(itemOf(letter)).toBe("Text");
    expect(itemOf(dot)).toBe("Motif");
    expect(itemOf(border)).toBeUndefined();
    expect(itemInName("Sign · Text engraving")).toBe("Text");
    expect(itemInName("Puzzle · Picture")).toBe("Picture");
    expect(itemInName("Sign engraving")).toBeNull();
  });

  it("draws each text, motif and number as its own part, on every generator", () => {
    expect(items(CLOCK, { inscription: { text: "Home" } })).toEqual(["Inscription", "Numerals", "Ticks"]);
    expect(items(CLOCK, { markers: { style: "dots", minutes: false } })).toEqual(["Dots"]);
    expect(items(PUZZLE, { engrave: { kind: "text", text: "Hi" } })).toEqual(["Text"]);
    expect(items(PUZZLE, { pieces: { count: 12 }, engrave: { kind: "numbers" } })).toEqual(["Numbers"]);
    expect(items(QR, { label: { text: "Scan me" }, logo: { kind: "text", text: "HL" } })).toEqual(["Code", "Label", "Logo"]);
    expect(items(BOXES, { box: { lid: "sliding" }, engrave: { text: "Tea", motif: "heart" } })).toEqual(["Motif", "Text"]);
    expect(items(BOXES, { box: { lid: "sliding" }, engrave: { text: "Tea", motif: "heart", mark: "score" } })).toEqual(["Motif", "Text"]);
    expect(items(BOXES, { design: "sign", sign: { text: "Hello" } })).toEqual(["Text"]);
    expect(items(TOPPER, { style: { kind: "plate" }, motif: { kind: "heart", place: "above" } })).toEqual(["Motif", "Text"]);
    expect(items(TOPPER, { kit: { kind: "cupcake" }, cupcake: { text: "Mia", count: 2 } })).toEqual(["Name"]);
    expect(items(KEYRACK, { motif: { kind: "heart", side: "left" }, hooks: { labels: "Car\nHome" } })).toEqual(["Hook labels", "Motif", "Text"]);
    expect(items(SIGN, { motif: { kind: "heart", side: "above" } })).toEqual(["Motif", "Text"]);
    expect(items(SIGN, { style: { mark: "score" }, motif: { kind: "none" } })).toEqual(["Text"]);
    expect(items(SIGN, { style: { kind: "neon" } })).toEqual(["Motif", "Text"]);
    expect(items(TABLENUM, {})).toEqual(["Label", "Number"]);
    expect(items(TROPHY, {})).toEqual(["Emblem text", "Name", "Title", "Year"]);
    expect(items(SHADOWBOX, { frame: { width: 160, height: 160 }, stack: { count: 6 }, cutter: { kind: "laser" }, text: { text: "Love", engrave: true } })).toEqual(["Words"]);
  });

  it("tags a puzzle's picture and a shadow box's photo", () => {
    const pz = build(PUZZLE, { engrave: { kind: "image", image: "data:image/jpeg;base64,AAAA", aspect: 2 } });
    expect(itemOf(pz.parts[0].images![0])).toBe("Picture");
    expect(tagItem([{ href: "x", x: 0, y: 0, w: 1, h: 1 }], "Photo").map(itemOf)).toEqual(["Photo"]);
  });

  it("leaves the cut file as it was: tags only, the same contours", () => {
    const a = build(SIGN, { motif: { kind: "heart", side: "above" } }), b = build(SIGN, { motif: { kind: "heart", side: "above" } });
    expect(JSON.stringify(a.parts)).toBe(JSON.stringify(b.parts));
    expect(a.parts[0].engrave!.length).toBeGreaterThan(0);
  });

  it("sizes the selected item's own setting, evenly, on that item alone", () => {
    const p = SIGN.merge({ motif: { kind: "heart", side: "above" } });
    let wrote: Record<string, number> | null = null;
    const g = itemGrips("sign", SIGN.sections, p, "Sign · Text", (v) => { wrote = v; }, "mm")!;
    expect(g.size).toMatchObject({ part: true, uniform: true, thin: 1.5 });
    expect(g.size!.settings.map((s) => s.key)).toEqual(["text.size"]);
    const r = g.size!.settings[0].at(1.5, 100);
    expect(r.v).toBe(60);
    g.size!.write({ "text.size": r.v });
    expect(wrote).toEqual({ "text.size": 60 });
    expect(itemKeys("sign", p, "Sign · Motif")).toEqual(["motif.size"]);
    expect(itemKeys("sign", p, "Letter 2")).toEqual(["text.size", "motif.size"]);
    expect(itemKeys("sign", p, "Sign")).toBeNull();
    expect(itemKeys("boxes", BOXES.merge({ design: "keys" }), "Board · Text")).toEqual(["keys.size"]);
    // A part that is not an item keeps the design's own handles.
    const set: unknown[] = [];
    const whole = generatorGrips(SIGN, p, (q) => set.push(q), "mm", [300, 200, 6], "Sign");
    expect(whole.size?.settings[0].key).toBe("scale");
    expect(whole.size?.uniform).toBe(true);
    const item = generatorGrips(SIGN, p, (q) => set.push(q), "mm", [300, 200, 6], "Sign · Motif");
    expect(item.size?.settings[0].key).toBe("motif.size");
  });

  it("has a setting for every item a generator draws", () => {
    const cases: [AnyGenerator, unknown][] = [
      [CLOCK, { inscription: { text: "Home" } }], [CLOCK, { markers: { style: "dots" } }],
      [PUZZLE, { engrave: { kind: "text", text: "Hi" } }], [PUZZLE, { pieces: { count: 12 }, engrave: { kind: "numbers" } }],
      [QR, { label: { text: "Scan" }, logo: { kind: "text", text: "HL" } }],
      [BOXES, { box: { lid: "sliding" }, engrave: { text: "Tea", motif: "heart" } }], [BOXES, { design: "keys", keys: { text: "KEYS" } }],
      [TOPPER, { style: { kind: "plate" }, motif: { kind: "heart" } }], [TOPPER, { kit: { kind: "cupcake" }, cupcake: { text: "Mia", count: 1 } }],
      [KEYRACK, { motif: { kind: "heart" }, hooks: { labels: "A" } }], [SIGN, { motif: { kind: "heart" } }],
      [TABLENUM, { batch: { mode: "range", from: 1, to: 1, names: "Smith" } }], [TROPHY, {}],
      [SHADOWBOX, { frame: { width: 160, height: 160 }, stack: { count: 6 }, cutter: { kind: "laser" }, text: { text: "Love", engrave: true } }],
    ];
    for (const [g, raw] of cases) {
      const p = g.merge(raw);
      for (const name of itemNames(g, raw)) {
        const keys = itemKeys(g.id, p, name);
        expect(keys, `${g.id} ${name}`).not.toBeNull();
        expect(itemGrips(g.id, g.sections, p, name, () => {}, "mm")?.size?.settings.length, `${g.id} ${name}`).toBe(new Set(keys).size);
      }
    }
  });

  it("sends each item to the Windows app as one object, a scored item see-through", () => {
    const raw = { style: { mark: "score" }, motif: { kind: "none" }, text: { text: "A B C", fontId: "archivo-black" } };
    const p = SIGN.merge(raw);
    const out = build(SIGN, raw);
    const model = sceneModel((e) => generatorScene(out, p.T, e))!;
    const text = model.objects.find((o) => o.name === "Sign · Text engraving");
    expect(text?.kind).toBe("slab");
    if (text?.kind !== "slab") return;
    expect(text.more?.length).toBeGreaterThan(0);
    expect(text.mat?.opacity).toBeGreaterThan(0);
    expect(text.mat!.opacity!).toBeLessThan(1);
    expect(model.objects.filter((o) => o.kind === "lines").map((o) => o.name)).toContain("Sign · Text engraving lines");
    expect(text.noMeasure).toBe(true);
  });
});
