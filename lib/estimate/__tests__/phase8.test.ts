import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { batchZip } from "@/components/generators/batchZip";
import { parseRows, rowFolders, rowText, slugOf } from "@/lib/batch/rows";
import { CTX } from "@/lib/generators/__tests__/ctx";
import { SIGN } from "@/lib/generators/sign";
import { mergeSign } from "@/lib/generators/sign/params";
import type { UserMaterial } from "@/lib/materials/library";
import { cleanEstimate, fmtArea, fmtDuration, fmtLength, jobCost, jobTime, measureSVG, speedsFor } from "..";

// A 100 mm square part with a 40 mm square hole, a 100 mm score line and a 20 mm engraved square.
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="300mm" height="200mm" viewBox="0 0 300 200">
<g inkscape:groupmode="layer" inkscape:label="03 Inner cuts" fill="none" stroke="#00FF00"><path d="M40 40 L80 40 L80 80 L40 80 Z"/></g>
<g inkscape:groupmode="layer" inkscape:label="02 Outline cut" fill="none" stroke="#FF0000"><path d="M10 10 L110 10 L110 110 L10 110 Z"/></g>
<g inkscape:groupmode="layer" inkscape:label="01 Score lines" fill="none" stroke="#0000FF"><path d="M150 10 L250 10"/></g>
<g inkscape:groupmode="layer" inkscape:label="00 Engrave" fill="#000000" stroke="none"><path d="M150 50 L170 50 L170 70 L150 70 Z"/></g>
</svg>`;

describe("job estimate", () => {
  const m = measureSVG(SVG);

  it("measures cut and score length, engrave area, parts area and travel", () => {
    expect(m.cut).toBeCloseTo(160 + 400, 6);
    expect(m.score).toBeCloseTo(100, 6);
    expect(m.engraveArea).toBeCloseTo(400, 6);
    expect(m.partsArea).toBeCloseTo(100 * 100 - 40 * 40, 3);
    expect(m.paths).toBe(3);
    expect(m.travel).toBeCloseTo(Math.hypot(40, 40) + Math.hypot(30, 30) + Math.hypot(140, 0), 6);
    expect(m.sheets).toEqual([{ w: 300, h: 200 }]);
  });

  it("uses the laid-out sheets when given", () => {
    expect(measureSVG(SVG, [{ x: 0, y: 0, w: 600, h: 400 }, { x: 0, y: 420, w: 600, h: 400 }]).sheets).toEqual([{ w: 600, h: 400 }, { w: 600, h: 400 }]);
  });

  it("times the job only from speeds the user gave", () => {
    const t = jobTime(m, { cut: { speed: 10, passes: 2 }, score: { speed: 20, passes: 1 }, engrave: { speed: 100, passes: 1 }, interval: 0.1, travel: 100 });
    expect(t.missing).toEqual([]);
    expect(t.parts.cut).toBeCloseTo((560 * 2) / 10, 6);
    expect(t.parts.score).toBeCloseTo(5, 6);
    expect(t.parts.engrave).toBeCloseTo(400 / 0.1 / 100, 6);
    expect(t.parts.travel).toBeCloseTo(m.travel / 100, 6);
    expect(t.total).toBeCloseTo(112 + 5 + 40 + m.travel / 100, 6);
    const none = jobTime(m, { cut: { speed: 10, passes: 1 }, interval: 0.1, travel: 0 });
    expect(none.total).toBeNull();
    expect(none.missing).toEqual(["score", "engrave"]);
  });

  it("prices the sheets and the share the parts take", () => {
    const c = jobCost(m, 30)!;
    expect(c.sheets).toBe(1);
    expect(c.full).toBe(30);
    expect(c.share).toBeCloseTo(8400 / 60000, 9);
    expect(c.used).toBeCloseTo(30 * (8400 / 60000), 9);
    expect(jobCost({ ...m, sheets: [] }, 30)).toBeNull();
  });

  it("prefers the material's laser settings, then the user's machine speeds", () => {
    const s = cleanEstimate({ machine: "co2-50", speeds: { "co2-50": { cut: { speed: 12, passes: 1 }, score: { speed: 80, passes: 1 } } } });
    const mat = { laser: { cut: { speed: 8, power: 60, passes: 2 } } } as unknown as UserMaterial;
    const sp = speedsFor(mat, { id: "co2-50", maxSpeed: 500 }, s);
    expect(sp.cut).toEqual({ speed: 8, passes: 2 });
    expect(sp.from).toEqual({ cut: "material", score: "machine" });
    expect(sp.score).toEqual({ speed: 80, passes: 1 });
    expect(sp.engrave).toBeUndefined();
    expect(sp.travel).toBe(500);
  });

  it("cleans stored settings", () => {
    const s = cleanEstimate({ machine: "../x", price: -4, currency: "<b>€</b>", interval: 9, speeds: { "bad id!": { cut: { speed: 5 } }, ok: { cut: { speed: 0 }, score: { speed: 40, passes: 999 } } } }, "fallback");
    expect(s.machine).toBe("fallback");
    expect(s.price).toBeNull();
    expect(s.currency).toBe("b€b");
    expect(s.interval).toBe(0.1);
    expect(s.speeds).toEqual({ ok: { score: { speed: 40, passes: 1 } } });
  });

  it("formats lengths, areas and times", () => {
    expect(fmtLength(560, "mm")).toBe("560 mm");
    expect(fmtLength(2540, "mm")).toBe("2.54 m");
    expect(fmtLength(254, "in")).toBe("10.0 in");
    expect(fmtArea(8400, "mm")).toBe("84.0 cm²");
    expect(fmtDuration(42)).toBe("42 s");
    expect(fmtDuration(3 * 3600 + 5 * 60)).toBe("3 h 5 min");
  });
});

describe("batch rows", () => {
  it("reads one name per line", () => {
    const r = parseRows("Ana\nBen\n\n  Cy  \r\n");
    expect(r.rows.map((x) => x.name)).toEqual(["Ana", "Ben", "Cy"]);
    expect(r.header).toBe(false);
    expect(parseRows("Ana, Ben").rows).toEqual([{ name: "Ana, Ben", date: "", photo: "" }]);
  });

  it("reads spreadsheet columns", () => {
    expect(parseRows("Ana\t12.06.2027\tana.jpg\nBen\t\t").rows).toEqual([{ name: "Ana", date: "12.06.2027", photo: "ana.jpg" }, { name: "Ben", date: "", photo: "" }]);
  });

  it("reads a CSV with a header and quoted cells", () => {
    const r = parseRows('\uFEFFPhoto,Name,Date\r\nana.jpg,"Smith, Ana",2027\r\n,"Ben ""B""",\r\nx.png,"Two\nlines",');
    expect(r.header).toBe(true);
    expect(r.rows).toEqual([
      { name: "Smith, Ana", date: "2027", photo: "ana.jpg" },
      { name: 'Ben "B"', date: "", photo: "" },
      { name: "Two\nlines", date: "", photo: "x.png" },
    ]);
    expect(parseRows("name;date\nAna;1990").rows).toEqual([{ name: "Ana", date: "1990", photo: "" }]);
  });

  it("caps the rows", () => {
    const r = parseRows("a\nb\nc\nd\ne", 3);
    expect(r.rows.length).toBe(3);
    expect(r.dropped).toBe(2);
  });

  it("makes safe file names in any script", () => {
    expect(slugOf("سارا و علی")).toBe("سارا-و-علی");
    expect(slugOf("Ana & Ben / 2027")).toBe("Ana-Ben-2027");
    expect(slugOf("../..")).toBe("row");
    expect(rowFolders([{ name: "Ana", date: "", photo: "" }, { name: "Ana", date: "", photo: "" }])).toEqual(["01-Ana", "02-Ana"]);
    expect(rowText({ name: "Ana", date: "2027", photo: "" }, true)).toBe("Ana\n2027");
    expect(rowText({ name: "Ana", date: "2027", photo: "" }, false)).toBe("Ana 2027");
  });
});

describe("batch ZIP", () => {
  it("builds a folder of files per row and a summary", async () => {
    const p = mergeSign({});
    const progress: number[] = [];
    const r = await batchZip({
      def: SIGN as never, params: p as never, ctx: CTX,
      rows: [{ name: "Ana", date: "", photo: "" }, { name: "Ben", date: "2027", photo: "" }, { name: "Cy", date: "", photo: "cy.jpg" }],
      photos: [], formats: ["svg", "dxf"], machine: "co2-50", pro: true,
      onProgress: (d) => progress.push(d), cancelled: () => false,
    });
    expect(r).not.toBeNull();
    const files = unzipSync(r!.zip);
    expect(Object.keys(files).sort()).toEqual(["01-Ana/Ana.dxf", "01-Ana/Ana.svg", "02-Ben/Ben.dxf", "02-Ben/Ben.svg", "summary.csv"]);
    expect(r!.made).toBe(2);
    expect(r!.failed.map((f) => f.row)).toEqual([3]);
    const ana = strFromU8(files["01-Ana/Ana.svg"]), ben = strFromU8(files["02-Ben/Ben.svg"]);
    expect(ana).toMatch(/^<\?xml|^<svg/);
    expect(ana).not.toBe(ben);
    expect(strFromU8(files["01-Ana/Ana.dxf"])).toContain("EOF");
    const summary = strFromU8(files["summary.csv"]).replace(/^\uFEFF/, "").trim().split("\r\n");
    expect(summary[0]).toBe("row,name,date,photo,result");
    expect(summary[1]).toBe("1,Ana,,,made");
    expect(summary[3].startsWith("3,Cy,,cy.jpg,")).toBe(true);
    expect(progress.at(-1)).toBe(3);
  });

  it("stops when cancelled", async () => {
    const r = await batchZip({
      def: SIGN as never, params: mergeSign({}) as never, ctx: CTX, rows: [{ name: "Ana", date: "", photo: "" }],
      photos: [], formats: ["svg"], machine: "co2-50", pro: true, onProgress: () => {}, cancelled: () => true,
    });
    expect(r).toBeNull();
  });
});
