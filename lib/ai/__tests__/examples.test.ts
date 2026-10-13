import { describe, expect, it } from "vitest";
import { cleanExampleSvg, exampleContent, ExampleError, exampleWords, pickExamples, renderExample } from "../exampleFiles";
import { parseExampleInput } from "../examples";
import { MAX_EXAMPLE_SVG } from "../exampleLimits";

const KEYCHAIN = `<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="80mm" viewBox="0 0 60 80">
  <script>alert(1)</script>
  <path d="M5 5h50v70h-50z" fill="none" stroke="#FF0000" stroke-width="0.1" onclick="alert(2)"/>
  <circle cx="30" cy="12" r="3" fill="none" stroke="#ff0000"/>
  <path d="M15 40h30v10h-30z" fill="#000"/>
  <path d="M10 60h40" stroke="#0000FF"/>
  <image href="https://evil.example/x.png" width="10" height="10"/>
  <text x="10" y="30">Luna</text>
</svg>`;

describe("cleanExampleSvg", () => {
  it("keeps only geometry in mm with LightBurn colours", () => {
    const c = cleanExampleSvg(KEYCHAIN, `Cat "keychain" <b>`);
    expect(c.width).toBe(50);
    expect(c.height).toBe(70);
    expect(c.objects).toBe(4);
    expect(c.svg).not.toMatch(/script|onclick|href|evil|<text|<image/i);
    expect(c.svg).toContain('stroke="#FF0000"');
    expect(c.svg).toContain('stroke="#0000FF"');
    expect(c.svg).toContain('fill="#000000"');
    expect(c.svg).toContain("<title>Cat &quot;keychain&quot; &lt;b&gt;</title>");
    expect(c.svg).toMatch(/width="52.8mm" height="72.8mm"/);
    expect(c.warnings.join(" ")).toMatch(/text object/);
  });

  it("reads px files at 96 per inch", () => {
    const c = cleanExampleSvg('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect x="0" y="0" width="96" height="48" fill="none" stroke="#f00"/></svg>', "x");
    expect(c.width).toBeCloseTo(25.4, 1);
    expect(c.height).toBeCloseTo(12.7, 1);
  });

  it("refuses files that are not drawings", () => {
    expect(() => cleanExampleSvg("<html><body>hi</body></html>", "x")).toThrow(ExampleError);
    expect(() => cleanExampleSvg('<svg xmlns="http://www.w3.org/2000/svg"><text>only text</text></svg>', "x")).toThrow(/no shapes/);
    expect(() => cleanExampleSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><path d="M0 0h0.2v0.2z" stroke="#f00"/></svg>', "x")).toThrow(/size/);
  });

  it("renders a PNG", () => {
    const c = cleanExampleSvg(KEYCHAIN, "k");
    const png = renderExample(c.svg, c.width, c.height, 200);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
  });
});

describe("pickExamples", () => {
  const lib = [
    { id: 1, title: "Cat keychain with a name", description: "Plywood, the name engraved in script", tags: "keychain, pet, gift" },
    { id: 2, title: "Cafe wall sign", description: "Large round sign with a coffee cup", tags: "sign, cafe, coffee, shop" },
    { id: 3, title: "Dog keychains", description: "", tags: "pet" },
    { id: 4, title: "Wedding cake topper", description: "Mr & Mrs in script", tags: "wedding" },
  ];

  it("ranks by title and tag words, then description", () => {
    expect(pickExamples(lib, "Cat keychain with the name Luna").map((e) => e.id)).toEqual([1, 3]);
    expect(pickExamples(lib, "Wall sign that says Cafe Luna, about 60 cm wide").map((e) => e.id)).toEqual([2]);
  });

  it("shows nothing when nothing clearly fits", () => {
    expect(pickExamples(lib, "A round cookie jar with a lid")).toEqual([]);
    expect(pickExamples(lib, "laser cut plywood design 3 mm")).toEqual([]);
    expect(pickExamples(lib, "")).toEqual([]);
  });

  it("folds plurals and keeps other scripts", () => {
    expect(exampleWords("Keychains for Cats")).toEqual(["keychain", "cat"]);
    expect(exampleWords("جاکلیدی گربه")).toEqual(["جاکلیدی", "گربه"]);
  });
});

describe("exampleContent", () => {
  it("puts each example's words, photo and cut file before the request", () => {
    const parts = exampleContent([
      { title: "Cat keychain", description: "Bold name", width: 50.2, height: 70, render: "UE5H", photo: "SlBH" },
      { title: "Sign", description: "", width: 600, height: 300, render: "UE5H" },
    ]);
    expect(Array.isArray(parts)).toBe(true);
    const p = parts as Exclude<typeof parts, string>;
    expect(p.filter((x) => x.type === "file")).toHaveLength(3);
    expect(p.map((x) => (x.type === "text" ? x.text : x.type)).join("|")).toMatch(/Example 1: Cat keychain \(50 × 70 mm\)\. Bold name\|The finished product:\|file\|Its cut file:\|file\|Example 2: Sign \(600 × 300 mm\)\|Its cut file:\|file\|The customer's request:$/);
    expect(exampleContent([])).toEqual([]);
  });
});

describe("parseExampleInput", () => {
  const ok = { title: " Cat keychain ", description: "Nice", tags: "pet", svg: KEYCHAIN, photo: "data:image/jpeg;base64,/9j/AA==" };

  it("accepts a good upload", () => {
    const r = parseExampleInput(JSON.stringify(ok));
    expect("error" in r).toBe(false);
    if (!("error" in r)) { expect(r.title).toBe("Cat keychain"); expect(r.photo).toMatch(/^data:image\/jpeg/); }
    const noPhoto = parseExampleInput(JSON.stringify({ ...ok, photo: null }));
    expect("error" in noPhoto ? noPhoto.error : noPhoto.photo).toBeNull();
  });

  it("refuses bad uploads", () => {
    const err = (o: unknown) => { const r = parseExampleInput(typeof o === "string" ? o : JSON.stringify(o)); return "error" in r ? r.error : ""; };
    expect(err("{")).toMatch(/JSON/);
    expect(err({ ...ok, title: "" })).toMatch(/title/);
    expect(err({ ...ok, title: "x".repeat(121) })).toMatch(/title/);
    expect(err({ ...ok, description: "x".repeat(1001) })).toMatch(/description/);
    expect(err({ ...ok, svg: "" })).toMatch(/SVG/);
    expect(err({ ...ok, svg: "x".repeat(MAX_EXAMPLE_SVG + 1) })).toMatch(/too large/);
    expect(err({ ...ok, photo: "data:image/png;base64,iVBO" })).toMatch(/JPEG/);
    expect(err({ ...ok, photo: "javascript:alert(1)" })).toMatch(/JPEG/);
  });
});
