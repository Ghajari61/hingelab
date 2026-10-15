import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { detectProject, oclcName, OPEN_ACCEPT, productOfSection, sectionOfProduct } from "../file";

const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

describe(".oclc project files", () => {
  it("tells sections apart by what the file holds", () => {
    expect(detectProject(json({ app: "HingeLab", product: "letters", version: 1, params: { text: "A" } }))).toMatchObject({ section: "letters", version: 1, params: { text: "A" } });
    expect(detectProject(json({ app: "HingeLab", product: "parametric", params: {} }))).toMatchObject({ section: "parametric", version: 1 });
    expect(detectProject(json({ app: "HingeLab", product: "clock", version: 3, params: { name: "x" } }))).toMatchObject({ section: "clock", version: 3 });
    expect(detectProject(json({ app: "HingeLab", product: "hinge-box", params: { W: 80 } }))).toMatchObject({ section: "hinge" });
  });

  it("opens files saved before products existed as Hinge Box", () => {
    expect(detectProject(json({ app: "HingeLab", version: 1, params: { W: 80 } }))).toMatchObject({ section: "hinge" });
  });

  it("reads a Studio ZIP by its signature, whatever its name", () => {
    const zip = zipSync({ "document.json": strToU8("{}") });
    expect(detectProject(zip)).toEqual({ section: "studio" });
  });

  it("keeps the whole file for its fonts", () => {
    const d = detectProject(json({ product: "sign", params: {}, assets: { fonts: [{ id: "upload:a" }] } }));
    expect("file" in d && (d.file.assets as { fonts: unknown[] }).fonts).toHaveLength(1);
  });

  it("ignores a byte-order mark", () => {
    const b = json({ product: "letters", params: {} });
    expect(detectProject(new Uint8Array([0xef, 0xbb, 0xbf, ...b]))).toMatchObject({ section: "letters" });
  });

  it("refuses what is not a project, with a clear reason", () => {
    expect(detectProject(new TextEncoder().encode("not json"))).toEqual({ error: expect.stringMatching(/not a HingeLab project/) });
    expect(detectProject(json({ product: "letters" }))).toEqual({ error: expect.stringMatching(/not a HingeLab project/) });
    expect(detectProject(json({ product: "letters", params: [1] }))).toEqual({ error: expect.stringMatching(/not a HingeLab project/) });
    expect(detectProject(json([1, 2]))).toEqual({ error: expect.stringMatching(/not a HingeLab project/) });
    expect(detectProject(new Uint8Array([0xff, 0xfe, 0x00]))).toEqual({ error: expect.stringMatching(/not a HingeLab project/) });
  });

  it("says when a file comes from a newer app or from Test Cards", () => {
    expect(detectProject(json({ product: "rocket", params: {} }))).toEqual({ error: expect.stringMatching(/newer version/) });
    expect(detectProject(json({ product: "testcard", params: {} }))).toEqual({ error: expect.stringMatching(/Test Cards was removed/) });
  });

  it("maps products and sections both ways", () => {
    expect(sectionOfProduct("hinge-box")).toBe("hinge");
    expect(sectionOfProduct("hinge")).toBe("hinge");
    expect(sectionOfProduct("boxes")).toBe("boxes");
    expect(sectionOfProduct("nope")).toBeNull();
    expect(productOfSection("hinge")).toBe("hinge-box");
    expect(productOfSection("tablenum")).toBe("tablenum");
  });

  it("names files .oclc, replacing older extensions and characters Windows refuses", () => {
    expect(oclcName("My box")).toBe("My box.oclc");
    expect(oclcName("My box.oclc")).toBe("My box.oclc");
    expect(oclcName("old.hingelab.json")).toBe("old.oclc");
    expect(oclcName("studio.hingelab")).toBe("studio.oclc");
    expect(oclcName('Box: "v2"?')).toBe("Box- -v2--.oclc");
    expect(oclcName("  ")).toBe("Untitled.oclc");
    expect(oclcName("trailing. ")).toBe("trailing.oclc");
    expect(oclcName("x".repeat(300))).toHaveLength(120 + 5);
  });

  it("offers the new extension and the old ones when opening", () => {
    for (const ext of [".oclc", ".hingelab", ".json"]) expect(OPEN_ACCEPT.split(",")).toContain(ext);
  });
});
