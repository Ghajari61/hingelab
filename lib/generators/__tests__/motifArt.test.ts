import { describe, expect, it } from "vitest";
import { desktopCatalog } from "@/lib/desktop/products";
import { BOXES } from "../boxes";
import { bboxOf, rect } from "../geom";
import { KEYRACK } from "../keyrack";
import { MOTIF_ART, cleanMotifArt, motifArtFields } from "../motifArt";
import { motifRef } from "../motifRef";
import { MOTIF_OPTIONS, motifArt, motifSize } from "../motifs";
import { randomiseParams } from "../randomise";
import { encodeLevels } from "../shadowbox/picPath";
import { SIGN } from "../sign";
import { TABLENUM } from "../tablenum";
import { TOPPER } from "../topper";
import { TROPHY } from "../trophy";
import type { AnyGenerator, Contour, GenOutput } from "../types";
import { CTX } from "./ctx";

const sq = (x: number, w: number): Contour => rect(x, x, w, w);
/** Two levels: a square ring (dark parts only) and the whole square (dark and mid tones). */
const LEVELS = encodeLevels([[sq(100, 800), sq(300, 400).reverse()], [sq(100, 800)]]);
const PIC = { ...MOTIF_ART, levels: LEVELS, aspect: 1, cut: 0 };
const marks = (out: GenOutput) => out.parts.reduce((a, p) => a + (p.engrave?.length ?? 0) + (p.score?.length ?? 0), 0);
const build = (g: AnyGenerator, raw: unknown) => g.build(g.merge(raw), CTX);
const SIGN_P = SIGN.defaults();

describe("your own motif", () => {
  it("offers your picture and your text right after None, with rail pictures", () => {
    expect(MOTIF_OPTIONS.slice(0, 3).map((o) => o.v)).toEqual(["none", "picture", "text"]);
    expect(MOTIF_OPTIONS[1].input).toBe("picture");
    for (const id of ["picture", "text"]) for (const a of motifArt(id)) expect(a.d).toMatch(/^M[-\d.]+[ ,][-\d.]+ L/);
  });

  it("turns a traced picture into a motif in a 100 mm box: a level, or its light parts", () => {
    const ring = motifRef("picture", PIC).ref;
    if (!ring || typeof ring === "string") throw new Error("no motif");
    expect(ring.unit).toHaveLength(2);
    const b = bboxOf(ring.unit);
    expect(b.x1 - b.x0).toBeCloseTo(100, 6);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(0, 6);
    const full = motifRef("picture", { ...PIC, cut: 100 }).ref;
    expect(typeof full === "object" && full?.unit).toHaveLength(1);
    const light = motifRef("picture", { ...PIC, cut: 100, invert: true }).ref;
    expect(typeof light === "object" && light?.unit).toHaveLength(2);
    expect(motifSize(ring, 40)).toEqual({ w: 40, h: 40 });
    expect(motifRef("picture", MOTIF_ART)).toEqual({ ref: null, loading: false });
  });

  it("turns typed words into a motif, waiting for the font", () => {
    const t = motifRef("text", { ...MOTIF_ART, text: "AB", fontId: "archivo-black" }, CTX).ref;
    if (!t || typeof t === "string") throw new Error("no motif");
    const b = bboxOf(t.unit);
    expect(Math.max(b.x1 - b.x0, b.y1 - b.y0)).toBeCloseTo(100, 6);
    expect(b.x1 - b.x0).toBeGreaterThan(b.y1 - b.y0);
    expect(motifRef("text", MOTIF_ART, {})).toEqual({ ref: null, loading: true });
    expect(motifRef("text", { ...MOTIF_ART, text: "  " }, CTX)).toEqual({ ref: null, loading: false });
    expect(motifRef("heart", MOTIF_ART).ref).toBe("heart");
  });

  it("cleans stored settings", () => {
    const c = cleanMotifArt({ image: "javascript:alert(1)", aspect: 1e9, levels: "M0 0 l<script>", name: "<b>x</b>", cut: Number.NaN, invert: "yes", text: "x".repeat(200), fontId: 5 });
    expect(c).toEqual({ ...MOTIF_ART, aspect: 10, name: "bxb", text: "x".repeat(60) });
    expect(cleanMotifArt(null)).toEqual(MOTIF_ART);
  });

  it("shows the picture fields for your picture and the text fields for your text", () => {
    const f = motifArtFields<{ m: { kind: string; art: typeof MOTIF_ART } }>("m.kind", "m.art");
    const shown = (kind: string, art = MOTIF_ART) => f.filter((x) => !x.show || x.show({ m: { kind, art } })).map((x) => x.key);
    expect(shown("heart")).toEqual([]);
    expect(shown("picture")).toEqual(["m.art.image"]);
    expect(shown("picture", PIC)).toEqual(["m.art.image", "m.art.cut", "m.art.invert"]);
    expect(shown("text")).toEqual(["m.art.text", "m.art.fontId"]);
  });

  it("is left out where it cannot be used: the desktop app (pictures) and Randomise", async () => {
    const sign = (await desktopCatalog()).products.find((p) => p.id === "sign");
    const kind = sign?.sections.flatMap((s) => s.fields).find((f) => f.key === "motif.kind");
    const vs = kind && kind.kind === "choice" ? kind.options.map((o) => o.v) : [];
    expect(vs).toContain("text");
    expect(vs).not.toContain("picture");
    const field = SIGN.sections.flatMap((s) => s.fields).find((f) => f.key === "motif.kind")!;
    const def = { ...SIGN, sections: [{ id: "m", title: "Motif", help: "", fields: [{ ...field, shuffle: true }] }] } as AnyGenerator;
    for (let i = 0; i < 40; i++) expect(["picture", "text"]).not.toContain((randomiseParams(def, SIGN.defaults() as never, new Set(), () => i / 40) as unknown as typeof SIGN_P).motif.kind);
  });
});

describe("your own motif in every design", () => {
  it("sign: engraves or scores your picture and your text", () => {
    const none = marks(build(SIGN, { motif: { kind: "none" }, border: { kind: "none" } }));
    const pic = build(SIGN, { motif: { kind: "picture", art: PIC }, border: { kind: "none" } });
    expect(marks(pic)).toBeGreaterThan(none);
    const scored = build(SIGN, { style: { mark: "score" }, motif: { kind: "picture", art: PIC }, border: { kind: "none" } });
    expect(scored.parts[0].engrave ?? []).toHaveLength(0);
    expect(scored.parts[0].score!.length).toBe(marks(pic));
    const text = build(SIGN, { motif: { kind: "text", art: { text: "XO", fontId: "archivo-black" } }, border: { kind: "none" } });
    expect(marks(text)).toBeGreaterThan(none);
    expect(SIGN.fonts!(SIGN.merge({ motif: { kind: "text", art: { fontId: "fredoka" } } }))).toContain("fredoka");
  });

  it("table numbers, key rack and topper carry it beside the text", () => {
    for (const [g, raw] of [[TABLENUM, {}], [KEYRACK, {}], [TOPPER, { style: { kind: "plate", mark: "engrave" } }]] as const) {
      const none = marks(build(g, { ...raw, motif: { kind: "none" } }));
      expect(marks(build(g, { ...raw, motif: { kind: "picture", art: PIC } }))).toBeGreaterThan(none);
      expect(marks(build(g, { ...raw, motif: { kind: "text", art: { text: "XO" } } }))).toBeGreaterThan(none);
    }
  });

  it("topper: cupcake picks use your picture, as a mark or as the silhouette", () => {
    const kit = { kit: { kind: "cupcake" }, cupcake: { count: 1, motif: "picture", art: PIC, shape: "motif", size: 50 } };
    const sil = build(TOPPER, kit).parts[0];
    const b = bboxOf([sil.outer]);
    expect(b.x1 - b.x0).toBeCloseTo(50 + 2 * 1.2, 0);
    const disc = build(TOPPER, { ...kit, cupcake: { ...kit.cupcake, shape: "circle" } });
    expect(marks(disc)).toBe(2);
  });

  it("trophy: your picture is the emblem with its details engraved; your text is the emblem", () => {
    const base = { emblem: { kind: "motif", text: "" }, plate: { on: false } };
    const pic = build(TROPHY, { ...base, emblem: { ...base.emblem, motif: "picture", art: PIC } });
    expect(marks(pic)).toBe(2);
    const fallback = build(TROPHY, { ...base, emblem: { ...base.emblem, motif: "picture" } });
    expect(marks(fallback)).toBe(0);
    expect(build(TROPHY, { ...base, emblem: { ...base.emblem, motif: "text", art: { text: "A" } } }).error).toBeUndefined();
  });

  it("boxes: the lid engraving takes your picture or text, engraved or scored", () => {
    const none = marks(build(BOXES, { engrave: { text: "Tea" } }));
    const pic = build(BOXES, { engrave: { text: "Tea", motif: "picture", art: PIC } });
    expect(marks(pic)).toBeGreaterThan(none);
    const scored = build(BOXES, { engrave: { text: "Tea", motif: "picture", art: PIC, mark: "score" } });
    expect(scored.parts.some((p) => p.engrave?.length)).toBe(false);
    expect(scored.parts.some((p) => p.score?.length)).toBe(true);
    expect(build(BOXES, { engrave: { motif: "text", art: { text: "XO" } } }).parts.some((p) => p.engrave?.length)).toBe(true);
    expect(BOXES.merge({ engrave: { motif: "dragon", mark: "melt" } }).engrave).toMatchObject({ motif: "none", mark: "engrave" });
  });
});
