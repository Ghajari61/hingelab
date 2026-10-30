import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { autoFixAll } from "@/lib/issues";
import { bboxOf, pointInContour } from "../geom";
import { arrangeGenerator, genSVG } from "../output";
import { QR } from "../qr";
import { buildQr, type QrOutput } from "../qr/build";
import { checkQr } from "../qr/check";
import { qrMatrix, qrPayload } from "../qr/encode";
import { mergeQr, type QrParams } from "../qr/params";
import { EYE_SAFE } from "../qr/eyes";
import type { Contour, GenPart } from "../types";
import { CTX } from "./ctx";

const build = (raw: unknown) => buildQr(mergeQr(raw), CTX) as QrOutput;
const issuesOf = (p: QrParams) => checkQr(p, buildQr(p, CTX) as QrOutput);
const codes = (p: QrParams) => issuesOf(p).map((i) => i.code);

/** Even-odd fill of `dark` on white, `px` pixels per module, with a white margin; grey per pixel. */
function raster(dark: Contour[], frame: Contour, module: number, px = 6) {
  const bb = bboxOf([frame]);
  const ppm = px / module, M = 4 * px;
  const w = Math.ceil((bb.x1 - bb.x0) * ppm) + 2 * M, h = Math.ceil((bb.y1 - bb.y0) * ppm) + 2 * M;
  const grey = new Uint8Array(w * h).fill(255);
  const edges: number[] = [];
  for (const c of dark) for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    edges.push(a[0], a[1], b[0], b[1]);
  }
  for (let y = 0; y < h; y++) {
    const py = (y + 0.5 - M) / ppm + bb.y0;
    const xs: number[] = [];
    for (let e = 0; e < edges.length; e += 4) {
      const ay = edges[e + 1], by = edges[e + 3];
      if ((ay > py) !== (by > py)) xs.push(edges[e] + ((py - ay) * (edges[e + 2] - edges[e])) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil((xs[k] - bb.x0) * ppm + M - 0.5)), x1 = Math.min(w - 1, Math.floor((xs[k + 1] - bb.x0) * ppm + M - 0.5));
      for (let x = x0; x <= x1; x++) grey[y * w + x] = 0;
    }
  }
  return { grey, w, h };
}

function decode(out: QrOutput): string | null {
  let part: GenPart = out.parts[0];
  if (part.cuts?.length) {
    // a tent card: read the front face (the lower half) on its own
    const b = bboxOf([part.outer]), y = b.y1 - out.info!.plateH;
    part = { ...part, outer: [[b.x0, y], [b.x1, y], [b.x1, b.y1], [b.x0, b.y1]], engrave: part.engrave!.filter((c) => bboxOf([c]).y0 > y) };
  }
  const dark = part.id === "plate" ? part.engrave ?? [] : part.holes;
  const { grey, w, h } = raster(dark, part.outer, out.info!.module);
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < grey.length; i++) { rgba[4 * i] = rgba[4 * i + 1] = rgba[4 * i + 2] = grey[i]; rgba[4 * i + 3] = 255; }
  const res = jsQR(rgba, w, h, { inversionAttempts: "attemptBoth" });
  return res ? new TextDecoder().decode(new Uint8Array(res.binaryData)) : null;
}

const CONTENT: Record<string, Partial<QrParams["content"]>> = {
  url: { kind: "url", url: "example.com/menu?table=4" },
  text: { kind: "text", text: "Hello, laser! سلام ✓" },
  wifi: { kind: "wifi", ssid: "Cafe; Guest", password: "p@ss:word,1", security: "WPA" },
  vcard: { kind: "vcard", first: "Sam", last: "Rivera", org: "Rivera Studio", phone: "+1 555 0100", email: "sam@example.com", website: "https://example.com" },
  email: { kind: "email", to: "hi@example.com", subject: "Order #12", body: "Hello there" },
  sms: { kind: "sms", smsTo: "+1 (555) 0100", message: "Table 4 is ready" },
  phone: { kind: "phone", tel: "+44 20 7946 0000" },
};

describe("QR content", () => {
  it("writes the standard formats phones understand", () => {
    const P = (c: Partial<QrParams["content"]>) => qrPayload(mergeQr({ content: c }).content);
    expect(P(CONTENT.url)).toBe("https://example.com/menu?table=4");
    expect(P({ kind: "url", url: "mailto:a@b.c" })).toBe("mailto:a@b.c");
    expect(P(CONTENT.wifi)).toBe("WIFI:T:WPA;S:Cafe\\; Guest;P:p@ss\\:word\\,1;;");
    expect(P({ kind: "wifi", ssid: "Open", security: "nopass", hidden: true })).toBe("WIFI:T:nopass;S:Open;H:true;;");
    expect(P(CONTENT.vcard)).toBe([
      "BEGIN:VCARD", "VERSION:3.0", "N:Rivera;Sam;;;", "FN:Sam Rivera", "ORG:Rivera Studio", "TEL;TYPE=CELL:+1 555 0100",
      "EMAIL:sam@example.com", "URL:https://example.com", "END:VCARD",
    ].join("\n"));
    expect(P(CONTENT.email)).toBe("mailto:hi@example.com?subject=Order%20%2312&body=Hello%20there");
    expect(P(CONTENT.sms)).toBe("SMSTO:+15550100:Table 4 is ready");
    expect(P(CONTENT.phone)).toBe("tel:+442079460000");
    expect(P({ kind: "url", url: "  " })).toBe("");
  });

  it("asks for content, and refuses content too long for any code", () => {
    expect(build({ content: { kind: "wifi", ssid: "" } }).error).toMatch(/Wi-Fi/);
    expect(build({ content: { kind: "text", text: "x".repeat(4000) }, code: { ecc: "H" } }).error).toMatch(/too much/);
    const big = qrMatrix("x".repeat(2000), "L")!;
    expect(big.version).toBeGreaterThan(30);
    expect(big.n).toBe(4 * big.version + 17);
  });

  for (const [kind, c] of Object.entries(CONTENT)) {
    it(`${kind}: the engraved code decodes to the content at every error-correction level`, () => {
      for (const ecc of ["L", "M", "Q", "H"] as const) {
        const out = build({ content: c, code: { ecc } });
        expect(decode(out), `${kind} ${ecc}`).toBe(out.info!.payload);
      }
    });
  }
});

describe("QR outputs and styles", () => {
  for (const style of ["square", "rounded", "dots", "connected"] as const) {
    for (const output of ["engrave", "cutout", "stencil"] as const) {
      it(`${style} ${output} decodes`, () => {
        const out = build({ code: { style, size: 60 }, output: { kind: output } });
        expect(decode(out)).toBe("https://hingelab.vercel.app");
      });
    }
  }

  it("an inverted (light) code decodes", () => {
    const out = build({ code: { invert: true } });
    expect(decode(out)).toBe("https://hingelab.vercel.app");
  });

  it("a cut-out is a top plate over a contrasting backplate, and counts the loose pieces", () => {
    const p = mergeQr({ output: { kind: "cutout" }, keyring: { kind: "top" } });
    const out = buildQr(p, CTX) as QrOutput;
    expect(out.parts.map((x) => x.id)).toEqual(["top", "back"]);
    const [top, back] = out.parts;
    expect(top.place!.z).toBe(p.T);
    expect(back.place!.z).toBe(0);
    expect(back.tone).toBeLessThan(1);
    expect(back.outer).toEqual(top.outer);
    expect(back.holes.length).toBe(1);
    expect(out.info!.islands).toBeGreaterThan(0);
    expect(out.stats.find((s) => s.label === "Loose pieces")?.value).toBe(String(out.info!.islands));
    expect(issuesOf(p).map((i) => i.code)).toContain("LOOSE_PIECES");
  });

  it("no part of a stencil falls out: all its material joins the border", () => {
    for (const style of ["square", "rounded", "dots", "connected"] as const) {
      const out = build({ code: { style, size: 120 }, output: { kind: "stencil", bridge: 20 }, label: { text: "SMILE" } });
      const part = out.parts[0];
      // Material is the plate minus the holes; at 20 px a module the bridges are 4 px wide.
      const { grey, w, h } = raster([part.outer, ...part.holes], part.outer, out.info!.module, 20);
      let total = 0, seed = -1;
      for (let i = 0; i < grey.length; i++) if (grey[i] === 0) { total++; if (seed < 0) seed = i; }
      const seen = new Uint8Array(w * h), stack = [seed];
      seen[seed] = 1;
      let n = 0;
      while (stack.length) {
        const i = stack.pop()!;
        n++;
        const x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && !seen[j] && grey[j] === 0) { seen[j] = 1; stack.push(j); }
        }
      }
      expect(n, style).toBe(total);
      expect(out.info!.counters, "the label has no closed letters").toBe(0);
    }
  });

  it("a stencil warns about letters whose centres fall out", () => {
    const p = mergeQr({ output: { kind: "stencil" }, code: { size: 120 }, label: { text: "SCAN ON" } });
    expect(codes(p)).toContain("STENCIL_COUNTERS");
  });
});

describe("QR plate", () => {
  it("lays the label below, above or beside the code", () => {
    const plain = build({}).info!;
    const below = build({ label: { text: "Scan me", position: "below", size: 6 } }).info!;
    const beside = build({ label: { text: "Scan me", position: "right", size: 6 } }).info!;
    expect(below.plateH).toBeGreaterThan(plain.plateH + 6);
    expect(below.plateW).toBeCloseTo(plain.plateW, 6);
    expect(beside.plateW).toBeGreaterThan(plain.plateW + 20);
    expect(beside.plateH).toBeCloseTo(plain.plateH, 6);
    const above = build({ label: { text: "Scan me", position: "above", size: 6 } });
    expect(decode(above)).toBe("https://hingelab.vercel.app");
  });

  it("a round plate holds the whole quiet zone", () => {
    const out = build({ plate: { shape: "circle", padding: 3 } });
    const info = out.info!;
    expect(info.plateW).toBeCloseTo(info.plateH, 1);
    expect(decode(out)).toBe("https://hingelab.vercel.app");
  });

  it("the keyring tab's hole sits outside the plate; a corner hole stays out of the quiet zone with a wide border", () => {
    const plain = build({}).parts[0];
    const out = build({ keyring: { kind: "top", diameter: 5 } });
    const part = out.parts[0];
    expect(part.holes.length).toBe(1);
    const hb = bboxOf(part.holes);
    const pb = bboxOf([part.outer]);
    expect(pb.y1 - pb.y0).toBeGreaterThan(bboxOf([plain.outer]).y1 - bboxOf([plain.outer]).y0);
    expect(hb.y1).toBeLessThan(pb.y1 - (bboxOf([plain.outer]).y1 - bboxOf([plain.outer]).y0));
    expect(hb.x1 - hb.x0).toBeCloseTo(5, 1);
    expect(build({ keyring: { kind: "corner" }, plate: { padding: 1 } }).info!.holeInQuiet).toBe(true);
    expect(build({ keyring: { kind: "corner" }, plate: { padding: 8 } }).info!.holeInQuiet).toBe(false);
  });

  it("the frame is a ring in the border that keeps clear of the keyring hole", () => {
    const out = build({ plate: { frame: true, padding: 6, frameWidth: 1.2 }, keyring: { kind: "corner", diameter: 4 }, });
    const part = out.parts[0];
    const hole = part.holes[0];
    const c = bboxOf([hole]);
    const centre: [number, number] = [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
    const ring = (part.engrave ?? []).filter((e) => bboxOf([e]).x1 - bboxOf([e]).x0 > 40);
    expect(ring.length).toBeGreaterThan(0);
    for (const e of ring) for (const pt of e) expect(Math.hypot(pt[0] - centre[0], pt[1] - centre[1])).toBeGreaterThan(2 + 1.4);
    expect(decode(out)).toBe("https://hingelab.vercel.app");
  });
});

describe("QR logo", () => {
  for (const kind of ["heart", "star", "wifi", "text"] as const) {
    it(`a ${kind} logo at level H still decodes`, () => {
      const out = build({ code: { ecc: "H", size: 60 }, logo: { kind, size: 22, text: "HL" } });
      expect(out.info!.logoShare).toBeGreaterThan(0.03);
      expect(decode(out)).toBe("https://hingelab.vercel.app");
    });
  }

  it("too big for the level: error, fixed by level H or a smaller logo", () => {
    const p = mergeQr({ code: { ecc: "M" }, logo: { kind: "heart", size: 30 } });
    expect(codes(p)).toContain("LOGO_TOO_BIG");
    const fixed = autoFixAll(p, issuesOf).params;
    expect(codes(fixed)).not.toContain("LOGO_TOO_BIG");
    expect(decode(buildQr(fixed, CTX) as QrOutput)).toBe("https://hingelab.vercel.app");
    const big = mergeQr({ code: { ecc: "H" }, logo: { kind: "heart", size: 40 } });
    const small = autoFixAll(big, issuesOf).params;
    expect(small.logo.size).toBeLessThan(40);
    expect(codes(small)).not.toContain("LOGO_TOO_BIG");
    expect(codes(mergeQr({ code: { ecc: "L" }, logo: { kind: "star" } }))).toContain("LOGO_TOO_BIG");
  });
});

describe("QR checks and fixes", () => {
  it("every preset builds without warnings and decodes", () => {
    expect(QR.presets.length).toBeGreaterThanOrEqual(5);
    for (const pr of QR.presets) {
      const p = QR.merge(pr.params);
      const out = buildQr(p, CTX) as QrOutput;
      expect(out.error, pr.id).toBeUndefined();
      expect(issuesOf(p).filter((i) => i.level !== "info").map((i) => i.code), pr.id).toEqual([]);
      expect(decode(out), pr.id).toBe(out.info!.payload);
    }
  });

  it("small modules: explicit size fix makes the code bigger without silent resizing", () => {
    const p = mergeQr({ content: CONTENT.vcard, code: { size: 20 }, output: { kind: "cutout" } });
    expect(codes(p)).toContain("SMALL_MODULES");
    expect(autoFixAll(p, issuesOf).params.code.size).toBe(20);
    const fixed = issuesOf(p).find(i => i.code === "SMALL_MODULES")!.fixes[0].apply(p);
    expect(fixed.code.size).toBeGreaterThan(20);
    expect(codes(fixed)).not.toContain("SMALL_MODULES");
  });

  it("quiet zone, bridges, a tight frame and the keyring hole each have a fix", () => {
    for (const [raw, code] of [
      [{ code: { quiet: 0 }, plate: { padding: 0 } }, "QUIET_ZONE"],
      [{ output: { kind: "stencil", bridge: 5 }, code: { size: 120 } }, "THIN_BRIDGE"],
      [{ plate: { frame: true, padding: 2, frameWidth: 1.5 } }, "FRAME_TIGHT"],
      [{ keyring: { kind: "corner" }, plate: { padding: 1 } }, "HOLE_IN_QUIET_ZONE"],
    ] as const) {
      const p = mergeQr(raw);
      expect(codes(p), code).toContain(code);
      const issue = issuesOf(p).find(i => i.code === code)!;
      expect(codes(issue.fixes[0].apply(p)), code).not.toContain(code);
    }
  });

  it("warns about a Wi-Fi network without a password, and letters the font lacks", () => {
    expect(codes(mergeQr({ content: { kind: "wifi", ssid: "Home" } }))).toContain("NO_PASSWORD");
    const fa = mergeQr({ label: { text: "سلام", fontId: "fredoka" } });
    expect(codes(fa)).toContain("MISSING_GLYPHS");
    expect(autoFixAll(fa, issuesOf).params.label.fontId).toBe("vazirmatn");
  });

  it("waits for the label's font", () => {
    expect(buildQr(mergeQr({ label: { text: "Scan" } }), {}).notice).toMatch(/font/);
  });
});

describe("QR export", () => {
  it("the default code's SVG matches the golden file", async () => {
    const p = QR.defaults();
    const svg = genSVG(QR, p, arrangeGenerator(QR, p, CTX).lay!);
    expect(svg).toContain("Engrave");
    await expect(svg).toMatchFileSnapshot("./golden/qr-default.svg");
  });

  it("with kerf, a cut-out's loose pieces are cut as their own outlines inside the plate", () => {
    const p = mergeQr({ output: { kind: "cutout" }, K: 0.15 });
    const a = arrangeGenerator(QR, p, CTX);
    const top = a.lay!.items.map((i) => i.pt).find((x) => x.id === "top")!;
    const islands = (buildQr(p, CTX) as QrOutput).info!.islands;
    // Pieces that touch the plate only at a corner join it once the kerf is added.
    expect(top.outline.length).toBeGreaterThan(1);
    expect(top.outline.length).toBeLessThanOrEqual(1 + islands);
    for (const o of top.outline.slice(1)) expect(pointInContour(o[0], top.outline[0])).toBe(true);
  });
});

describe("QR with a cut-out pattern", () => {
  it("the pattern goes round the code and its quiet zone, so the code still decodes", () => {
    for (const [output, mark] of [["cutout", "cut"], ["engrave", "engrave"]] as const) {
      const p = QR.merge({ output: { kind: output }, plate: { padding: 25 }, pattern: { pattern: "circles", cell: 8, bar: 2, mark } });
      const out = QR.build(p, CTX) as QrOutput;
      expect(out.pattern?.shapes, output).toBeGreaterThan(10);
      expect(decode(out), output).toBe(out.info!.payload);
    }
  });
});
describe("QR designer styles (module styles and eye shapes)", () => {
  for (const style of ["diamond", "tiny", "vlines", "hlines"] as const) {
    for (const output of ["engrave", "cutout", "stencil"] as const) {
      it(`${style} ${output} decodes`, () => {
        const out = build({ code: { style, size: 60 }, output: { kind: output } });
        expect(decode(out)).toBe("https://hingelab.vercel.app");
      });
    }
  }

  it("every safe eye frame and centre pair decodes; the others are flagged with a fix", () => {
    const bad: string[] = [];
    for (const [eyeFrame, safe] of Object.entries(EYE_SAFE)) for (const eyeBall of ["square", "rounded", "circle", "leaf", "diamond", "star"] as const) {
      const p = mergeQr({ code: { style: "dots", size: 60, eyeFrame, eyeBall } });
      if (!safe.includes(eyeBall)) {
        expect(codes(p), `${eyeFrame} ${eyeBall}`).toContain("EYE_MISMATCH");
        const fixed = autoFixAll(p, issuesOf).params;
        expect(codes(fixed)).not.toContain("EYE_MISMATCH");
        continue;
      }
      expect(codes(p)).not.toContain("EYE_MISMATCH");
      for (const url of ["https://hingelab.vercel.app", "https://example.com/menu?table=12&lang=en"]) {
        const out = build({ content: { url }, code: { style: "dots", size: 60, eyeFrame, eyeBall } });
        if (decode(out) !== out.info!.payload) bad.push(`${eyeFrame} ${eyeBall}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("custom eyes decode cut out and inverted; Match keeps the old output", () => {
    expect(decode(build({ code: { eyeFrame: "circle", eyeBall: "circle" }, output: { kind: "cutout" } }))).toBe("https://hingelab.vercel.app");
    expect(decode(build({ code: { eyeFrame: "leaf", eyeBall: "diamond", invert: true } }))).toBe("https://hingelab.vercel.app");
    expect(build({ code: { eyeFrame: "auto", eyeBall: "auto" } }).parts[0].engrave).toEqual(build({}).parts[0].engrave);
  });

  it("no part of a vertical-bar or diamond stencil falls out", () => {
    for (const style of ["vlines", "diamond", "tiny"] as const) {
      const out = build({ code: { style, size: 120 }, output: { kind: "stencil", bridge: 20 } });
      const part = out.parts[0];
      const { grey, w, h } = raster([part.outer, ...part.holes], part.outer, out.info!.module, 20);
      let total = 0, seed = -1;
      for (let i = 0; i < grey.length; i++) if (grey[i] === 0) { total++; if (seed < 0) seed = i; }
      const seen = new Uint8Array(w * h), stack = [seed];
      seen[seed] = 1;
      let k = 0;
      while (stack.length) {
        const i = stack.pop()!;
        k++;
        const x = i % w, y = (i / w) | 0;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && grey[j] === 0) { seen[j] = 1; stack.push(j); }
      }
      expect(k, style).toBe(total);
    }
  });
});

describe("QR new content", () => {
  const P = (c: Partial<QrParams["content"]>) => qrPayload(mergeQr({ content: c }).content);
  it("WhatsApp, map and event payloads", () => {
    expect(P({ kind: "whatsapp", waTo: "+44 (0)7700 900123".replace("(0)", ""), waText: "Table 4" })).toBe("https://wa.me/447700900123?text=Table%204");
    expect(P({ kind: "whatsapp", waTo: "0044 7700 900123" })).toBe("https://wa.me/447700900123");
    expect(P({ kind: "map", place: "51.5007, -0.1246" })).toBe("https://www.google.com/maps/search/?api=1&query=51.5007,-0.1246");
    expect(P({ kind: "map", place: "10 Downing St, London" })).toBe("https://www.google.com/maps/search/?api=1&query=10%20Downing%20St%2C%20London");
    expect(P({ kind: "event", evTitle: "Open day; tea", evDate: "2026-12-5", evStart: "9:30", evEnd: "17:00", evPlace: "Hall, Main St" })).toBe(
      ["BEGIN:VEVENT", "SUMMARY:Open day\\; tea", "DTSTART:20261205T093000", "DTEND:20261205T170000", "LOCATION:Hall\\, Main St", "END:VEVENT"].join("\n"));
    expect(P({ kind: "event", evTitle: "Fair", evDate: "2026-07-01" })).toContain("DTSTART;VALUE=DATE:20260701");
    expect(P({ kind: "event", evTitle: "Fair", evDate: "next week" })).toBe("");
    expect(build({ content: { kind: "event", evTitle: "x" } }).error).toMatch(/date/);
  });
  for (const c of [{ kind: "whatsapp", waTo: "+1 555 0100", waText: "Hi" }, { kind: "map", place: "48.8584, 2.2945" }, { kind: "event", evTitle: "Party", evDate: "2026-12-31", evStart: "20:00" }] as const) {
    it(`${c.kind} decodes`, () => {
      const out = build({ content: c });
      expect(decode(out)).toBe(out.info!.payload);
    });
  }
});

describe("QR signs: plate shapes, header picture, stands", () => {
  for (const shape of ["arch", "hexagon", "octagon", "shield", "bubble", "scalloped", "ticket", "bone", "stake"] as const) {
    it(`a ${shape} plate holds the code, its quiet zone and label, and decodes`, () => {
      const out = build({ plate: { shape, padding: 5 }, label: { text: "Scan me" }, badge: { kind: "stars", size: 8 } });
      const part = out.parts[0];
      const engr = bboxOf(part.engrave!);
      for (const pt of [[engr.x0, engr.y0], [engr.x1, engr.y0], [engr.x0, engr.y1], [engr.x1, engr.y1]] as [number, number][]) expect(pointInContour(pt, part.outer), shape).toBe(true);
      expect(decode(out), shape).toBe("https://hingelab.vercel.app");
      expect(codes(mergeQr({ plate: { shape, padding: 5 } }))).not.toContain("QUIET_ZONE");
    });
  }

  it("every header picture sits above the code and keeps it scannable", () => {
    for (const kind of ["stars", "menu", "coffee", "wifi", "camera", "pin", "pay", "tap", "chat", "phone", "calendar", "heart", "paw", "note", "gift", "house", "leaf"] as const) {
      const plain = build({});
      const out = build({ badge: { kind, size: 12 } });
      expect(out.info!.plateH, kind).toBeGreaterThan(plain.info!.plateH + 12);
      expect(decode(out), kind).toBe("https://hingelab.vercel.app");
    }
  });

  it("a slotted base: tabs below the plate, slots in the upper layers that fit them", () => {
    const p = mergeQr({ stand: { kind: "base", layers: 2, depth: 60 }, code: { size: 50 } });
    const out = buildQr(p, CTX) as QrOutput;
    expect(out.parts.map((x) => x.id)).toEqual(["plate", "base1", "base2"]);
    const [plate, b1, b2] = out.parts;
    expect(b1.holes.length).toBe(0);
    expect(b2.holes.length).toBe(2);
    expect(bboxOf([plate.outer]).y1 - out.info!.plateH).toBeCloseTo(p.T, 3);
    const slot = bboxOf([b2.holes[0]]);
    expect(slot.y1 - slot.y0).toBeCloseTo(p.T + 0.1, 3);
    expect(plate.place!.upright).toBe(true);
    expect(decode(out)).toBe("https://hingelab.vercel.app");
    // a cut-out sign: both plates in a slot twice as wide
    const two = buildQr(mergeQr({ stand: { kind: "base" }, output: { kind: "cutout" } }), CTX) as QrOutput;
    const s2 = bboxOf([two.parts.find((x) => x.id === "base2")!.holes[0]]);
    expect(s2.y1 - s2.y0).toBeCloseTo(2 * p.T + 0.1, 3);
  });

  it("feet: two slotted feet, the sign leaning back", () => {
    const out = build({ stand: { kind: "feet", lean: 12 } });
    expect(out.parts.map((x) => x.id)).toEqual(["plate", "foot1", "foot2"]);
    expect(out.parts[0].place!.tilt).toBe(78);
    expect(out.parts[1].place!.yaw).toBe(90);
    expect(decode(out)).toBe("https://hingelab.vercel.app");
  });

  it("a tent card is one piece with a living hinge and the code on both faces", () => {
    const out = build({ stand: { kind: "tent" }, plate: { shape: "circle" }, keyring: { kind: "top" } });
    expect(out.parts.length).toBe(1);
    const card = out.parts[0];
    expect(card.cuts!.length).toBeGreaterThan(10);
    expect(card.holes.length).toBe(0);
    const b = bboxOf([card.outer]);
    expect(b.y1 - b.y0).toBeGreaterThan(2 * out.info!.plateH);
    // the front face (lower half) decodes on its own
    const lower: GenPart = { ...card, outer: [[b.x0, b.y1 - out.info!.plateH], [b.x1, b.y1 - out.info!.plateH], [b.x1, b.y1], [b.x0, b.y1]], engrave: card.engrave!.filter((c) => bboxOf([c]).y0 > b.y1 - out.info!.plateH) };
    expect(decode({ ...out, parts: [lower] })).toBe("https://hingelab.vercel.app");
  });

  it("wall holes stay out of the quiet zone with a border, and are flagged without one", () => {
    expect(build({ stand: { kind: "wall", holes: "four" }, plate: { padding: 8 } }).parts[0].holes.length).toBe(4);
    const tight = mergeQr({ stand: { kind: "wall", holes: "four", holeD: 5 }, plate: { padding: 1 } });
    expect(codes(tight)).toContain("HOLE_IN_QUIET_ZONE");
    expect(codes(issuesOf(tight).find((i) => i.code === "HOLE_IN_QUIET_ZONE")!.fixes[0].apply(tight))).not.toContain("HOLE_IN_QUIET_ZONE");
  });

  it("a tall sign on a shallow base warns and the fix deepens it", () => {
    const p = mergeQr({ stand: { kind: "base", depth: 25 }, code: { size: 120 } });
    expect(codes(p)).toContain("STAND_TIPS");
    expect(codes(autoFixAll(p, issuesOf).params)).not.toContain("STAND_TIPS");
  });

  it("the stand is ignored for a stencil", () => {
    expect(build({ stand: { kind: "base" }, output: { kind: "stencil" } }).parts.map((x) => x.id)).toEqual(["stencil"]);
  });
});
