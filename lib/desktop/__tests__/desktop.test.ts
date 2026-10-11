import { describe, expect, it } from "vitest";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { exportGeneratorForPlan } from "@/lib/billing/exportGenerator";
import { DEFAULTS } from "@/lib/hinge";
import { NextURL } from "next/dist/server/web/next-url";
import { bearer, isLoopbackRedirect, isState, isVerifier, loopbackRedirect, randomToken, sha256, verifyPkce } from "../pkce";
import { desktopCatalog, fileNameOf, generateDesign } from "../products";
import { isAllowedUpdateURL, isSignature, manifestError, minimumVersion, updateFor, type ReleaseManifest } from "../releases";
import { effectivePlan } from "../session";
import type { GenerateResponse } from "../types";
import { clientVersion, compareVersions, parseVersion } from "../version";
import stable from "@/desktop/releases/stable.json";

/** A signature in the format the Tauri bundler writes (content is not checked here, only the shape). */
const sigFor = (trusted: string) => Buffer.from("untrusted comment: signature from tauri secret key\nRUQ" + "A".repeat(120) + `\ntrusted comment: ${trusted}\n` + "B".repeat(88) + "\n").toString("base64");
const SIG = sigFor("timestamp:1760000000\tfile:HingeLab_1.0.1_x64-setup.exe\tversion:1.0.1");

const manifest = (latest: Partial<ReleaseManifest["latest"]> | null, min = "1.0.0"): ReleaseManifest => ({
  channel: "stable",
  minimumVersion: min,
  latest: latest === null ? null : {
    version: "1.0.1", pub_date: "2026-10-11T00:00:00Z", notes: "Fixes.",
    platforms: { "windows-x86_64": { url: "https://github.com/hingelab/releases/download/v1.0.1/HingeLab_1.0.1_x64-setup.exe", signature: SIG, size: 5_000_000 } },
    ...latest,
  } as ReleaseManifest["latest"],
});

describe("desktop PKCE and tokens", () => {
  it("verifies the RFC 7636 example and rejects others", () => {
    expect(verifyPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(verifyPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
    expect(verifyPkce("short", "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(false);
    expect(isVerifier("a".repeat(129))).toBe(false);
  });

  it("only accepts the app's 127.0.0.1 loopback callback", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:49152/callback")).toBe(true);
    for (const bad of [
      "http://localhost:49152/callback", "https://127.0.0.1:49152/callback", "http://127.0.0.1/callback",
      "http://127.0.0.1:80/callback", "http://127.0.0.1:70000/callback", "http://127.0.0.1:49152/callback?x=1",
      "http://127.0.0.1:49152/other", "http://127.0.0.1.evil.example:49152/callback", "http://evil.example/callback",
      "http://127.0.0.1:49152@evil.example/callback", "javascript:alert(1)", 42,
    ]) expect(isLoopbackRedirect(bad), String(bad)).toBe(false);
  });

  it("builds the loopback callback from the port the app sends", () => {
    expect(loopbackRedirect("49152")).toBe("http://127.0.0.1:49152/callback");
    for (const bad of ["80", "1023", "70000", "0049152", "49152/x", "-1", "", undefined, 49152]) expect(loopbackRedirect(bad), String(bad)).toBeNull();
  });

  it("the authorize link survives Next.js URL normalization", () => {
    // NextURL turns the first 127.x.x.x in a URL into "localhost", query values included.
    const link = "https://hingelab.vercel.app/desktop/authorize?port=49152&state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256";
    const seen = new NextURL(link);
    expect(loopbackRedirect(seen.searchParams.get("port") ?? undefined)).toBe("http://127.0.0.1:49152/callback");
    const old = new NextURL("https://hingelab.vercel.app/desktop/authorize?redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback");
    expect(isLoopbackRedirect(old.searchParams.get("redirect_uri"))).toBe(false);
  });

  it("makes 43-character tokens and hashes, and reads bearer headers strictly", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sha256(t)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
    expect(bearer(`Bearer ${t}`)).toBe(t);
    expect(bearer(`bearer ${t}`)).toBeNull();
    expect(bearer(`Bearer ${t}x`)).toBeNull();
    expect(bearer(null)).toBeNull();
    expect(isState("abcdefghijklmnop")).toBe(true);
    expect(isState("short")).toBe(false);
  });
});

describe("desktop versions and releases", () => {
  it("parses and compares strict versions", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
    for (const bad of ["1.2", "1.2.3.4", "v1.2.3", "1.2.3-beta", "", null]) expect(parseVersion(bad)).toBeNull();
    expect(compareVersions([1, 10, 0], [1, 9, 9])).toBe(1);
    expect(compareVersions([1, 0, 0], [1, 0, 0])).toBe(0);
    expect(clientVersion("desktop/1.4.0")).toEqual([1, 4, 0]);
    expect(clientVersion("Mozilla/5.0")).toBeNull();
  });

  it("offers only a newer, well-formed release", () => {
    const m = manifest({});
    expect(manifestError(m)).toBeNull();
    expect(updateFor(m, "windows", "x86_64", [1, 0, 0])).toMatchObject({ version: "1.0.1", size: 5_000_000, signature: SIG });
    expect(updateFor(m, "windows", "x86_64", [1, 0, 1])).toBeNull();
    // No downgrades: an app newer than the manifest is left alone.
    expect(updateFor(m, "windows", "x86_64", [2, 0, 0])).toBeNull();
    expect(updateFor(m, "darwin", "aarch64", [1, 0, 0])).toBeNull();
    expect(updateFor(manifest(null), "windows", "x86_64", [1, 0, 0])).toBeNull();
  });

  it("refuses malformed or unsafe manifests", () => {
    const bad = (p: object) => manifest({ platforms: { "windows-x86_64": { url: "https://github.com/a/b/c.exe", signature: SIG, size: 1, ...p } } });
    expect(manifestError(bad({ url: "http://github.com/a/b/c.exe" }))).toMatch(/url/);
    expect(manifestError(bad({ url: "https://evil.example/c.exe" }))).toMatch(/url/);
    expect(manifestError(bad({ url: "https://github.com/a/b/c.msi.zip" }))).toMatch(/url/);
    expect(manifestError(bad({ url: "https://user:pw@github.com/a/b/c.exe" }))).toMatch(/url/);
    expect(manifestError(bad({ signature: "not-a-signature" }))).toMatch(/signature/);
    expect(manifestError(bad({ size: -1 }))).toMatch(/size/);
    // An older release's file and signature offered under a newer version number.
    expect(manifestError(bad({ signature: sigFor("timestamp:1\tfile:HingeLab_1.0.0_x64-setup.exe\tversion:1.0.0") }))).toMatch(/not made for 1\.0\.1/);
    expect(manifestError(bad({ signature: sigFor("timestamp:1\tfile:HingeLab_1.0.1_x64-setup.exe") }))).toMatch(/not made for/);
    expect(manifestError(manifest({ version: "1.0" }))).toMatch(/version/);
    expect(manifestError(manifest({}, "2.0.0"))).toMatch(/minimumVersion/);
    expect(manifestError({ channel: "beta" })).toBe("channel");
    expect(updateFor(bad({ url: "https://evil.example/c.exe" }), "windows", "x86_64", [1, 0, 0])).toBeNull();
    expect(isAllowedUpdateURL("https://abc.public.blob.vercel-storage.com/HingeLab_1.0.1_x64-setup.exe")).toBe(true);
    expect(isSignature(SIG)).toBe(true);
  });

  it("the committed release manifest is valid", () => {
    expect(manifestError(stable)).toBeNull();
  });

  it("raises the minimum version from the environment, never lowers it", () => {
    const m = manifest(null, "1.2.0");
    expect(minimumVersion(m, "1.5.0")).toEqual([1, 5, 0]);
    expect(minimumVersion(m, "1.0.0")).toEqual([1, 2, 0]);
    expect(minimumVersion(m, "junk")).toEqual([1, 2, 0]);
  });

  it("keeps Pro only within the paid period plus grace", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(effectivePlan("pro", null, now)).toBe("pro");
    expect(effectivePlan("pro", "2026-10-09T00:00:00Z", now)).toBe("pro");
    expect(effectivePlan("pro", "2026-10-01T00:00:00Z", now)).toBe("free");
    expect(effectivePlan("free", "2027-01-01T00:00:00Z", now)).toBe("free");
    expect(effectivePlan("admin", null, now)).toBe("free");
  });
});

describe("desktop catalog", () => {
  it("lists every product as plain JSON with no code in it", async () => {
    const c = await desktopCatalog();
    expect(c.products.map((p) => p.id)).toEqual(["hinge", "clock", "puzzle", "qr", "boxes", "topper"]);
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
    const text = JSON.stringify(c);
    expect(text).not.toMatch(/=>|function\s*\(/);
    for (const p of c.products) {
      expect(p.presets.length).toBeGreaterThan(0);
      for (const s of p.sections) for (const f of s.fields) if (f.kind === "number") expect(f.min, `${p.id} ${f.key}`).toBeLessThanOrEqual(f.max);
    }
    const hinge = c.products[0];
    const shape = hinge.sections[0].fields.find((f) => f.key === "shape");
    expect(shape && shape.kind === "choice" && shape.options.filter((o) => o.pro).map((o) => o.v)).toEqual(["pill", "poly", "cyl"]);
  });

  it("makes safe file names", () => {
    expect(fileNameOf("Gift box", "x")).toBe("Gift box.svg");
    expect(fileNameOf("..\\..\\Windows\\evil<>:\"|?*", "x")).toBe("Windows evil.svg");
    expect(fileNameOf("", "hinge-box")).toBe("hinge-box.svg");
    expect(fileNameOf("CON/../a", "x")).toBe("CON a.svg");
  });
});

const gen = async (req: object, plan: "free" | "pro" = "free") => {
  const r = await generateDesign(req, plan);
  return { status: r.status, body: r.body as GenerateResponse };
};

describe("desktop generate (server-side SVG)", () => {
  it("builds the same Hinge Box SVG as the web export, with the Free mark", async () => {
    const free = await gen({ product: "hinge" });
    expect(free.status).toBe(200);
    expect(free.body.svg).toBe(exportHingeForPlan(DEFAULTS, "free").ok && (exportHingeForPlan(DEFAULTS, "free") as { svg: string }).svg);
    expect(free.body.watermark).toBe(true);
    expect(free.body.svg).toContain("Made with HingeLab");
    const pro = await gen({ product: "hinge" }, "pro");
    expect(pro.body.svg).toBe((exportHingeForPlan(DEFAULTS, "pro") as { svg: string }).svg);
    expect(pro.body.svg).not.toContain("Made with HingeLab");
    expect(pro.body.width).toBeGreaterThan(0);
    expect(pro.body.fileName).toBe("Untitled box.svg");
  });

  it("refuses Pro designs on Free with no SVG, and never trusts a plan in the request", async () => {
    const r = await gen({ product: "hinge", change: { key: "shape", value: "cyl" }, plan: "pro" });
    expect(r.status).toBe(403);
    expect(r.body.svg).toBeUndefined();
    expect(r.body.locked).toMatch(/Cylinder shape is a Pro feature/);
    expect(r.body.params.shape).toBe("cyl");
    expect(r.body.form.hidden).toContain("W");
    const pro = await gen({ product: "hinge", change: { key: "shape", value: "cyl" } }, "pro");
    expect(pro.status).toBe(200);
    expect(pro.body.svg).toMatch(/^<\?xml|^<svg/);
  });

  it("applies edits on the server: ranges, materials and unknown keys", async () => {
    const big = await gen({ product: "hinge", change: { key: "sides", value: 99 } });
    expect(big.body.params.sides).toBe(12);
    const mat = await gen({ product: "hinge", change: { key: "material", value: "card2" } });
    expect(mat.body.params).toMatchObject({ material: "card2", T: 2, K: 0.2 });
    const t = await gen({ product: "hinge", change: { key: "T", value: "3.5" } });
    expect(t.body.params).toMatchObject({ material: "custom", T: 3.5 });
    expect((await gen({ product: "hinge", change: { key: "__proto__", value: 1 } })).status).toBe(400);
    expect((await gen({ product: "hinge", change: { key: "W", value: "abc" } })).status).toBe(400);
    expect((await gen({ product: "hinge", change: { key: "pattern", value: "spiral" } })).status).toBe(400);
    expect((await gen({ product: "hinge", params: { W: 1e9 } })).status).toBe(400);
    expect((await gen({ product: "laser-cannon" })).status).toBe(400);
    expect((await gen({ product: "hinge", params: [] })).status).toBe(400);
    const label = await gen({ product: "hinge", change: { key: "shape", value: "poly" } }, "pro");
    expect(label.body.form.labels.W).toBe("Across");
  });

  it("starts from presets and applies fixes", async () => {
    const pr = await gen({ product: "hinge", preset: "card-box" });
    expect(pr.body.params).toMatchObject({ name: "Card deck box", W: 100 });
    expect((await gen({ product: "hinge", preset: "nope" })).status).toBe(400);
    const tight = await gen({ product: "hinge", params: { ...DEFAULTS, pitch: 0.6 } });
    const issue = tight.body.issues.find((i) => i.fixes.length);
    expect(issue).toBeTruthy();
    const fixed = await gen({ product: "hinge", params: tight.body.params, fix: { code: issue!.code, id: issue!.fixes[0].id } });
    expect(fixed.body.applied).toEqual([issue!.fixes[0].label]);
    const auto = await gen({ product: "hinge", params: { ...DEFAULTS, pitch: 0.6 }, autofix: true });
    expect(auto.body.applied.length).toBeGreaterThan(0);
  });

  it("builds generators like the web export and holds their Pro designs back", async () => {
    const clock = await gen({ product: "clock" });
    expect(clock.status).toBe(200);
    const web = await exportGeneratorForPlan("clock", clock.body.params, "pro");
    expect(web.ok && web.svg).toBe(clock.body.svg);
    expect(clock.body.stats.length).toBeGreaterThan(0);
    const many = await gen({ product: "puzzle", change: { key: "pieces.count", value: 120 } });
    expect(many.status).toBe(403);
    expect(many.body.svg).toBeUndefined();
    const manyPro = await gen({ product: "puzzle", change: { key: "pieces.count", value: 120 } }, "pro");
    expect(manyPro.status).toBe(200);
    const copies = await gen({ product: "boxes", change: { key: "sheet.copies", value: 500 } });
    expect(copies.body.params.sheet).toMatchObject({ copies: 50 });
    const qr = await gen({ product: "qr", preset: (await desktopCatalog()).products[3].presets[0].id });
    expect(qr.status).toBe(200);
  });
});
