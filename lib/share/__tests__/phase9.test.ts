import { describe, expect, it } from "vitest";
import { deflateSync, strToU8 } from "fflate";
import { computeModel, DEFAULTS, exportSVG, layoutParts, mergeParams } from "@/lib/hinge";
import { decodeShare, encodeShare, hasImages, isShareProduct, productName, readShareHash, shareURL, stripAssets, SHARED_ID } from "@/lib/share";
import { designThumb, MAX_THUMB_CHARS } from "@/lib/share/thumb";
import { cleanEntry, MAX_GALLERY_PARAMS } from "@/lib/gallery";
import { FLAG_IDS, parseFlags } from "@/lib/flags";
import { designGates, FREE_FONT_UPLOADS, gateLock, PRO_FEATURES } from "@/lib/gates";

const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function hingeSVG() {
  const p = mergeParams({});
  const model = computeModel(p);
  if ("error" in model) throw new Error(model.error);
  return exportSVG(model, layoutParts(model.parts, p.bedW, p.gap), p);
}

describe("share links", () => {
  it("round-trips a design through the link", () => {
    const params = { ...structuredClone(DEFAULTS), name: "Kitchen box ✓", W: 123.4 } as unknown as Record<string, unknown>;
    const code = encodeShare("hinge", params);
    expect(code.startsWith("1.")).toBe(true);
    expect(code).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    expect(decodeShare(code, isShareProduct)).toEqual({ p: "hinge", params });
    const url = shareURL("https://x.test", "sign", { name: "A" });
    expect(url.startsWith("https://x.test/app/editor/local?p=sign#share=1.")).toBe(true);
    expect(readShareHash(new URL(url).hash, isShareProduct)).toEqual({ p: "sign", params: { name: "A" } });
    expect(readShareHash("#other=1&share=" + encodeShare("letters", { text: "Hi" }), isShareProduct)?.params).toEqual({ text: "Hi" });
  });

  it("compresses: a default Hinge Box link is short", () => {
    expect(shareURL("https://hingelab.app", "hinge", DEFAULTS as unknown as Record<string, unknown>).length).toBeLessThan(2000);
  });

  it("refuses damaged links, unknown products and bombs", () => {
    expect(decodeShare("", isShareProduct)).toBeNull();
    expect(decodeShare("2.abc", isShareProduct)).toBeNull();
    expect(decodeShare("1.@@@", isShareProduct)).toBeNull();
    expect(decodeShare("1.AAAA", isShareProduct)).toBeNull();
    expect(decodeShare(encodeShare("nope", {}), isShareProduct)).toBeNull();
    expect(decodeShare(encodeShare("hinge", {}), (p) => p === "letters")).toBeNull();
    expect(decodeShare("1." + b64url(deflateSync(strToU8(JSON.stringify({ p: "hinge", params: [1] })))), isShareProduct)).toBeNull();
    expect(decodeShare("1." + b64url(deflateSync(strToU8("not json"))), isShareProduct)).toBeNull();
    // 9 MB of spaces inflates past the 8 MB cap from a few kilobytes.
    const bomb = deflateSync(strToU8(JSON.stringify({ p: "hinge", params: { pad: " ".repeat(9 * 1024 * 1024) } })), { level: 9 });
    expect(bomb.length).toBeLessThan(100_000);
    expect(decodeShare("1." + b64url(bomb), isShareProduct)).toBeNull();
    expect(readShareHash("#nothing", isShareProduct)).toBeNull();
  });

  it("leaves pictures and uploaded fonts out unless asked", () => {
    const pic = "data:image/png;base64,AAAA";
    const params = { name: "Tag", fontId: "upload:abc-1", photo: { src: pic, x: 1 }, items: [{ src: pic }, { src: "lib:star" }] };
    const defaults = { name: "Name", fontId: "inter", photo: { src: "", x: 0 }, items: [{ src: "lib:heart" }] };
    const s = stripAssets(params, defaults);
    expect(s.images).toBe(2);
    expect(s.fonts).toBe(1);
    expect(s.params).toEqual({ name: "Tag", fontId: "inter", photo: { src: "", x: 1 }, items: [{ src: "lib:heart" }, { src: "lib:star" }] });
    expect(params.photo.src).toBe(pic);
    const keep = stripAssets(params, defaults, true);
    expect(keep.images).toBe(0);
    expect(keep.fonts).toBe(1);
    expect((keep.params.photo as { src: string }).src).toBe(pic);
    expect(hasImages(params)).toBe(true);
    expect(hasImages(s.params)).toBe(false);
    expect(hasImages({ a: [1, "x", { b: null }] })).toBe(false);
  });

  it("names products and knows the read-only id", () => {
    expect(productName("hinge")).toBe("Hinge Box");
    expect(productName("letters")).toBe("Letters");
    expect(isShareProduct("parametric")).toBe(true);
    expect(isShareProduct("sign")).toBe(true);
    expect(isShareProduct("__proto__")).toBe(false);
    expect(SHARED_ID).toBe("shared-link");
  });
});

describe("gallery", () => {
  const thumb = designThumb(hingeSVG())!;

  it("makes a small preview of the cut and score lines", () => {
    expect(thumb).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="\d+"/);
    expect(thumb.length).toBeLessThanOrEqual(MAX_THUMB_CHARS);
    expect(thumb).toContain('stroke="#8A6A3A"');
    expect(thumb).not.toMatch(/<script|<image|href=/);
    expect(designThumb('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBeNull();
  });

  it("accepts a clean entry and refuses anything else", () => {
    const ok = cleanEntry({ product: "hinge", name: "  My\u0007 box  ", params: { W: 1 }, thumb }, isShareProduct);
    expect(ok).toEqual({ product: "hinge", name: "My  box", params: { W: 1 }, thumb });
    const bad = (over: Record<string, unknown>) => "error" in cleanEntry({ product: "hinge", name: "A", params: {}, thumb, ...over }, isShareProduct);
    expect(bad({ product: "nope" })).toBe(true);
    expect(bad({ name: "   " })).toBe(true);
    expect(bad({ params: [] })).toBe(true);
    expect(bad({ params: { big: "x".repeat(MAX_GALLERY_PARAMS) } })).toBe(true);
    expect(bad({ thumb: "<svg><script>alert(1)</script></svg>" })).toBe(true);
    expect(bad({ thumb: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })).toBe(true);
    expect(bad({ thumb: '<svg xmlns="http://www.w3.org/2000/svg"><path onload="x()"/></svg>' })).toBe(true);
    expect(bad({ thumb: '<svg xmlns="http://www.w3.org/2000/svg"><image href="x.png"/></svg>' })).toBe(true);
    expect(bad({ thumb: '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:x()"/></svg>' })).toBe(true);
    expect(bad({ thumb: '<svg xmlns="http://www.w3.org/2000/svg">' + "x".repeat(MAX_THUMB_CHARS) + "</svg>" })).toBe(true);
    expect(bad({})).toBe(false);
    expect("error" in cleanEntry(null, isShareProduct)).toBe(true);
  });
});

describe("flags and Pro gates", () => {
  it("reads known flags only", () => {
    expect([...parseFlags("gallery, gate.batch nope,,gate.lbrn2")]).toEqual(["gallery", "gate.batch", "gate.lbrn2"]);
    expect(parseFlags(undefined).size).toBe(0);
    expect(FLAG_IDS).toContain("gate.customFonts");
  });

  it("locks a feature only for Free with its gate on", () => {
    const on = parseFlags("gate.batch,gate.nesting,gate.photoEngrave");
    expect(gateLock("batch", "free", new Set())).toBeNull();
    expect(gateLock("batch", "free", on)).toBe(PRO_FEATURES.batch.why);
    expect(gateLock("batch", "pro", on)).toBeNull();
    expect(gateLock("lbrn2", "free", on)).toBeNull();
    expect(PRO_FEATURES.customFonts.why).toContain(String(FREE_FONT_UPLOADS));
    expect(designGates({ sheet: { nest: "outline" } }, 1, "free", on)).toEqual([PRO_FEATURES.nesting.why, PRO_FEATURES.photoEngrave.why]);
    expect(designGates({ sheet: { nest: "box" } }, 0, "free", on)).toEqual([]);
    expect(designGates({ sheet: { nest: "outline" } }, 2, "pro", on)).toEqual([]);
    expect(designGates({ sheet: { nest: "outline" } }, 2, "free", new Set())).toEqual([]);
  });
});
