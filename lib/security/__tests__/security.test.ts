import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { escapeXml, inertSvgMarkup, isImageDataURL, laserSheetSvg, xmlCommentText } from "../svg";
import { clientIP, declaredLength, isCrossSite, isJSONRequest } from "../request";
import { memoryLimiter } from "../limiter";
import { contentSecurityPolicy, downloadHeaders, securityHeaders } from "../headers";
import { layeredSVG } from "@/lib/hinge/export";
import { DEFAULTS, mergeParams, type Params } from "@/lib/hinge";
import { HINGE_PRESETS } from "@/lib/hinge/presets";
import { PARAMETRIC_DEFAULTS, mergeParametricParams, type ParametricParams } from "@/lib/parametric";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { GENERATOR_IDS } from "@/lib/generators/ids";
import { loadGenerator } from "@/lib/generators/registry";
import { GENERATOR_PRESETS } from "@/lib/generators/presets";
import { sanitizeGeneratorParams } from "@/lib/generators/sanitize";
import { arrangeGenerator, genSVG } from "@/lib/generators/output";
import { mergePuzzle } from "@/lib/generators/puzzle/params";
import { MAX_COPIES } from "@/lib/generators/types";
import { hingeRequestError, parametricRequestError } from "@/lib/billing/validate";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { exportGeneratorForPlan } from "@/lib/billing/exportGenerator";
import { handleStripeEvent, type BillingStore, type ProfilePatch } from "@/lib/billing/events";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const commentOf = (svg: string) => svg.split("\n").find((l) => l.startsWith("<!--"))!;

describe("SVG output cannot be broken out of", () => {
  it("escapeXml escapes markup and both quotes", () => {
    expect(escapeXml(`<a href="x" b='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; b=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });

  it("comment text never contains -- (so --> and ---> cannot end the comment)", () => {
    for (const s of ["-->", "--->", "---->", "a--b", "<!-- x -->", "-".repeat(9) + ">"]) {
      const out = xmlCommentText(s);
      expect(out).not.toMatch(/--/);
      expect(out.endsWith("-")).toBe(s.endsWith("-") && !s.endsWith("--"));
    }
    expect(xmlCommentText("a\u0000b\u001fc\td")).toBe("abc\td");
  });

  it("a hostile name stays inside the shared layered SVG comment", () => {
    const svg = layeredSVG(10, 10, `Box ---><script>alert(1)</script><!--`, { outline: ["M0 0L1 1"], slots: [], hinge: [], labels: [], fills: [] } as never, DEFAULTS.layers, false);
    const c = commentOf(svg);
    expect(c.match(/-->/g)).toHaveLength(1);
    expect(c.endsWith(" -->")).toBe(true);
    expect(svg.split("\n").filter((l) => /<script/.test(l) && !l.startsWith("<!--"))).toEqual([]);
  });

  it("only base64 PNG/JPEG/WebP data URLs count as pictures", () => {
    expect(isImageDataURL(PNG)).toBe(true);
    for (const bad of [
      "javascript:alert(1)",
      'data:image/png;base64,AAAA"><script>alert(1)</script>',
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:text/html;base64,PHNjcmlwdD4=",
      "https://evil.example/x.png",
      "",
      42,
    ]) expect(isImageDataURL(bad)).toBe(false);
  });

  it("thumbnail markup with anything active is refused", () => {
    const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10" style="fill:var(--surface-sheet,#1F1D1A)"/><path d="M0 0L5 5" fill="url(#g)"/></svg>`;
    expect(inertSvgMarkup(ok)).toBe(ok);
    for (const bad of [
      `<svg><script>alert(1)</script></svg>`,
      `<svg onload="alert(1)"></svg>`,
      `<svg><image href="x" onerror="alert(1)"/></svg>`,
      `<svg><a href="javascript:alert(1)"><rect/></a></svg>`,
      `<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>`,
      `<svg><use href="data:image/svg+xml,..."/></svg>`,
      `<svg><rect style="fill:url(https://evil.example/x)"/></svg>`,
      `<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>`,
      `<svg><style>@import url(x)</style></svg>`,
      `<img src=x onerror=alert(1)>`,
      `<svg><img/src/onerror=alert(1)></svg>`,
      `<svg><svg/onload=alert(1)></svg>`,
      `<svg><rect x="1"onclick="alert(1)"/></svg>`,
      `<svg><x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script></svg>`,
      `<svg><x:a xmlns:x="http://www.w3.org/2000/svg" x:href="javascript:alert(1)"/></svg>`,
      `<svg><!DOCTYPE x [<!ENTITY e "y">]></svg>`,
      "",
      null,
    ]) expect(inertSvgMarkup(bad as string)).toBeUndefined();
  });

  it("keeps a model SVG only when it is inert and fits the bed", () => {
    const circle = `<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="80mm" viewBox="0 0 120 80"><circle cx="60" cy="40" r="20" fill="none" stroke="#FF0000" stroke-width="0.1"/></svg>`;
    expect(laserSheetSvg(circle, 900, 600)).toMatchObject({ ok: true, w: 120, h: 80 });
    expect(laserSheetSvg(circle.replace("120mm", "1200mm"), 900, 600).ok).toBe(false);
    expect(laserSheetSvg(circle.replace(/width="120mm"/, 'width="120"'), 900, 600).ok).toBe(false);
    expect(laserSheetSvg(circle.replace("</svg>", "<script>x</script></svg>"), 900, 600).ok).toBe(false);
  });
});

describe("puzzle pictures (the stored-XSS path)", () => {
  const evil = 'data:image/png;base64,AAAA"/><script>alert(document.cookie)</script><x y="';

  it("merge drops a picture that is not a plain image data URL", () => {
    expect(mergePuzzle({ engrave: { kind: "image", image: evil } }).engrave.image).toBe("");
    expect(mergePuzzle({ engrave: { kind: "image", image: "javascript:alert(1)" } }).engrave.image).toBe("");
    expect(mergePuzzle({ engrave: { kind: "image", image: PNG } }).engrave.image).toBe(PNG);
  });

  it("the SVG never carries a script, even when the picture is forced past merge", async () => {
    const def = await loadGenerator.puzzle();
    const p = def.merge({ engrave: { kind: "image", image: PNG } });
    (p as { engrave: { image: string } }).engrave.image = evil;
    const a = arrangeGenerator(def, p, {});
    expect(a.lay).toBeTruthy();
    const svg = genSVG(def, a.params, a.lay!);
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toContain(evil);
  });

  it("the server export refuses the picture and still sends a clean file", async () => {
    const out = await exportGeneratorForPlan("puzzle", { cols: 10, rows: 10, engrave: { kind: "image", image: evil } }, "pro");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.svg).not.toMatch(/<script/i);
      expect(out.svg).not.toMatch(/<image/);
    }
  });

  it("a hostile design name stays inside the generator SVG comment", async () => {
    const out = await exportGeneratorForPlan("boxes", { name: `x ---><script>alert(1)</script>` }, "pro");
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(commentOf(out.svg).match(/-->/g)).toHaveLength(1);
      expect(out.svg).not.toMatch(/<script/i);
    }
  });
});

describe("request checks", () => {
  const req = (headers: Record<string, string>, url = "https://hingelab.vercel.app/api/export") => new Request(url, { method: "POST", headers });

  it("cross-site requests are recognised", () => {
    expect(isCrossSite(req({ "sec-fetch-site": "same-origin", origin: "https://hingelab.vercel.app" }))).toBe(false);
    expect(isCrossSite(req({}))).toBe(false);
    expect(isCrossSite(req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(req({ "sec-fetch-site": "same-site" }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://evil.example" }))).toBe(true);
    expect(isCrossSite(req({ origin: "null" }))).toBe(true);
    expect(isCrossSite(req({ origin: "https://hingelab.com" }), ["https://hingelab.com"])).toBe(false);
  });

  it("only JSON bodies are accepted (an HTML form cannot send one)", () => {
    expect(isJSONRequest(req({ "content-type": "application/json" }))).toBe(true);
    expect(isJSONRequest(req({ "content-type": "application/json; charset=utf-8" }))).toBe(true);
    for (const t of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp"]) {
      expect(isJSONRequest(req({ "content-type": t }))).toBe(false);
    }
    expect(isJSONRequest(req({}))).toBe(false);
  });

  it("declared length and client IP", () => {
    expect(declaredLength(req({ "content-length": "123" }))).toBe(123);
    expect(declaredLength(req({}))).toBeNull();
    expect(clientIP(req({ "x-vercel-forwarded-for": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIP(req({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIP(req({}))).toBe("unknown");
  });
});

describe("rate limiter", () => {
  it("allows the limit per window, then refuses with a retry time, then resets", () => {
    let t = 0;
    const lim = memoryLimiter(() => t);
    const rule = { name: "x", limit: 3, windowSec: 60 };
    expect([1, 2, 3].map(() => lim.hit("a", rule).ok)).toEqual([true, true, true]);
    expect(lim.hit("a", rule)).toEqual({ ok: false, retryAfter: 60 });
    expect(lim.hit("b", rule).ok).toBe(true);
    t = 30_000;
    expect(lim.hit("a", rule)).toEqual({ ok: false, retryAfter: 30 });
    t = 60_000;
    expect(lim.hit("a", rule).ok).toBe(true);
  });

  it("gives back counts a failed job did not use", () => {
    const lim = memoryLimiter(() => 0);
    const rule = { name: "x", limit: 2, windowSec: 60 };
    lim.hit("a", rule);
    lim.hit("a", rule);
    expect(lim.hit("a", rule).ok).toBe(false);
    lim.refund("a", 2);
    expect(lim.hit("a", rule).ok).toBe(true);
    lim.refund("a", 10);
    lim.refund("missing", 1);
    expect([lim.hit("a", rule).ok, lim.hit("a", rule).ok, lim.hit("a", rule).ok]).toEqual([true, true, false]);
  });
});

describe("headers", () => {
  it("downloads are attachments that never run as a page", () => {
    const h = downloadHeaders("image/svg+xml", 'a"b\r\nc.svg');
    expect(h["content-disposition"]).toBe('attachment; filename="a_b__c.svg"');
    expect(h["content-security-policy"]).toMatch(/default-src 'none'.*sandbox/);
    expect(h["x-content-type-options"]).toBe("nosniff");
  });

  it("the site CSP blocks plugins, framing by others and foreign scripts", () => {
    const csp = contentSecurityPolicy({ dev: false, https: true, preview: false, supabaseURL: "https://abc.supabase.co" });
    expect(csp).toContain("upgrade-insecure-requests");
    expect(contentSecurityPolicy({ dev: false, preview: false, supabaseURL: "" })).not.toContain("upgrade-insecure-requests");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval';/);
    expect(csp).toContain("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: true, preview: false, supabaseURL: "" })).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy({ dev: false, preview: false, supabaseURL: "", depthModelURL: "https://models.example.com/depth.onnx" })).toContain("connect-src 'self' https://models.example.com https://huggingface.co");
    // only our own Supabase project: an injected script could not post to someone else's
    expect(csp).not.toContain("*.supabase.co");
    const keys = securityHeaders({ dev: false, https: true, preview: false, supabaseURL: "" }).map((h) => h.key);
    expect(keys).toEqual(expect.arrayContaining(["Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]));
    expect(keys).not.toContain("Content-Security-Policy");
  });
});

describe("generator settings are held to the editor's ranges", () => {
  it("every built-in preset of every generator passes unchanged", async () => {
    for (const id of GENERATOR_IDS) {
      const def = await loadGenerator[id]();
      for (const pr of [{ id: "defaults", params: {} }, ...GENERATOR_PRESETS[id]]) {
        const p = def.merge(pr.params);
        expect(sanitizeGeneratorParams(def, p), `${id}/${pr.id}`).toEqual(p);
      }
    }
  });

  it("hand-made values are clamped or reset", async () => {
    const def = await loadGenerator.puzzle();
    const p = sanitizeGeneratorParams(def, def.merge({ pieces: { auto: false, cols: 1e9, rows: -3, count: 1e9 }, T: -5, sheet: { copies: 1e6 }, tabs: { style: "<script>" }, name: "n".repeat(5000) }));
    expect(p.pieces.cols).toBe(50);
    expect(p.pieces.rows).toBe(1);
    expect(p.pieces.count).toBe(1000);
    // Card and paper go down to 0.1 mm.
    expect(p.T).toBe(0.1);
    expect(p.sheet.copies).toBeLessThanOrEqual(MAX_COPIES);
    expect(p.tabs.style).toBe(def.defaults().tabs.style);
    expect(p.name.length).toBe(200);
  });
});

describe("Hinge Box requests", () => {
  it("defaults and every preset are accepted", () => {
    expect(hingeRequestError(mergeParams(DEFAULTS))).toBeNull();
    for (const pr of HINGE_PRESETS) expect(hingeRequestError(mergeParams(pr.params)), pr.id).toBeNull();
  });

  it("absurd sizes, NaN and unknown options are refused before any geometry is built", () => {
    const bad: Partial<Params>[] = [
      { W: 1e7 }, { H: Number.NaN }, { pitch: 0.0001 }, { T: -1 }, { bedW: 1e9 },
      { shape: "hexagon" as Params["shape"] }, { pattern: "<x>" as Params["pattern"] }, { name: "n".repeat(1000) },
      { W: 3000, D: 3000, H: 3000, pitch: 0.5, slit: 3, bridge: 0.5 },
    ];
    for (const b of bad) {
      expect(hingeRequestError(mergeParams(b)), JSON.stringify(b).slice(0, 80)).not.toBeNull();
      const out = exportHingeForPlan(b, "pro");
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.status).toBe(400);
    }
  });
});

describe("Parametric requests", () => {
  const params = (patch: Partial<ParametricParams> = {}) => mergeParametricParams({ ...structuredClone(PARAMETRIC_DEFAULTS), ...patch });

  it("defaults and every preset are accepted", () => {
    expect(parametricRequestError(params())).toBeNull();
    for (const pr of PARAMETRIC_PRESETS) expect(parametricRequestError(mergeParametricParams({ ...structuredClone(PARAMETRIC_DEFAULTS), ...pr.params })), pr.id).toBeNull();
  });

  it("an exploding mesh, a microscopic fin spacing or a huge formula is refused", () => {
    expect(parametricRequestError(params({ source: { kind: "library", id: "sphere", detail: 20 } as ParametricParams["source"] }))).not.toBeNull();
    expect(parametricRequestError(params({ source: { kind: "library", id: "../../etc/passwd" } as unknown as ParametricParams["source"] }))).not.toBeNull();
    expect(parametricRequestError(params({ source: { kind: "formula", expression: "x".repeat(5000) } as ParametricParams["source"] }))).not.toBeNull();
    expect(parametricRequestError(params({ method: "teleport" as ParametricParams["method"] }))).not.toBeNull();
    expect(parametricRequestError(params({ name: "n".repeat(1000) }))).not.toBeNull();
  });
});

describe("webhook: ending one subscription keeps Pro while another is paid", () => {
  const sub = (id: string, status: Stripe.Subscription.Status) => ({ id, object: "subscription", status, customer: "cus_1", items: { data: [{ current_period_end: 1_900_000_000 }] } }) as unknown as Stripe.Subscription;
  const event = (type: string, object: unknown) => ({ id: "evt_1", type, data: { object } }) as unknown as Stripe.Event;
  const store = (other: Stripe.Subscription | null) => {
    const calls: ProfilePatch[] = [];
    const s: BillingStore = {
      updateByCustomer: async (_c, patch) => { calls.push(patch); return true; },
      updateByUser: async () => true,
      retrieveSubscription: async (id) => sub(id, "canceled"),
      otherProSubscription: async (_c, except) => (other && other.id !== except ? other : null),
    };
    return { s, calls };
  };

  it("deleted with another active subscription → still Pro", async () => {
    const { s, calls } = store(sub("sub_2", "active"));
    await handleStripeEvent(event("customer.subscription.deleted", sub("sub_1", "canceled")), s);
    expect(calls[0]).toMatchObject({ plan: "pro", plan_status: "active" });
  });

  it("updated to canceled with another trialing subscription → still Pro", async () => {
    const { s, calls } = store(sub("sub_2", "trialing"));
    await handleStripeEvent(event("customer.subscription.updated", sub("sub_1", "canceled")), s);
    expect(calls[0]).toMatchObject({ plan: "pro", plan_status: "trialing" });
  });

  it("deleted with no other subscription → Free", async () => {
    const { s, calls } = store(null);
    await handleStripeEvent(event("customer.subscription.deleted", sub("sub_1", "canceled")), s);
    expect(calls[0]).toMatchObject({ plan: "free", plan_status: "canceled" });
  });
});
