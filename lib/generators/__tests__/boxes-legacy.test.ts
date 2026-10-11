import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildBoxes } from "../boxes/build";
import { mergeBoxes } from "../boxes/params";
import { CTX } from "./ctx";

/** Version 1 designs: their parts must not change when Boxes grows. */
const LEGACY: Record<string, unknown> = {
  "default": {},
  "small-box": { design: "box", box: { width: 120, depth: 80, height: 60, lid: "closed" } },
  "pencil-cup": { design: "box", joint: { finger: 8 }, box: { width: 75, depth: 75, height: 100, lid: "open" } },
  "keepsake": { design: "box", box: { width: 160, depth: 110, height: 70, lid: "liftoff", clearance: 0.3 } },
  "odd-open": { box: { lid: "open", width: 73, depth: 151, height: 37 } },
  "outside": { joint: { outside: true, finger: 7 }, box: { width: 90, depth: 90, height: 90 } },
  "thick": { T: 6, joint: { finger: 15 }, box: { width: 200, depth: 140, height: 110 } },
  "organiser": { design: "tray", tray: { width: 240, depth: 160, height: 50, cols: 3, rows: 2, dividers: 85 } },
  "tea-box": { design: "tray", tray: { width: 280, depth: 150, height: 80, cols: 4, rows: 2, dividers: 90 } },
  "screw-tray": { design: "tray", joint: { finger: 8 }, tray: { width: 200, depth: 150, height: 30, cols: 4, rows: 3, dividers: 100 } },
  "desk-sign": { design: "sign" },
  "office-sign": { design: "sign", sign: { width: 220, height: 80, corner: 14, text: "Studio", fontId: "archivo-black", size: 26, base: 50, border: 5, borderWidth: 1.5 } },
  "frame-stand": { design: "frame" },
  "frame-hang": { design: "frame", frame: { photoW: 130, photoH: 130, border: 25, overlap: 5, corner: 3, mount: "hang" } },
  "phone-stand": { design: "stand" },
  "tablet-stand": { design: "stand", stand: { width: 160, angle: 70, slot: 16, lip: 14, height: 140 } },
  "key-holder": { design: "keys" },
  "bird-house": { design: "bird" },
  "bird-steep": { design: "bird", bird: { pitch: 55, perch: true } },
};

const r = (v: number) => Math.round(v * 1000) / 1000;
function fingerprint(raw: unknown): string {
  const out = buildBoxes(mergeBoxes(raw), CTX);
  const parts = out.parts.map((p) => ({
    id: p.id, name: p.name,
    outer: p.outer.map(([x, y]) => [r(x), r(y)]),
    holes: p.holes.map((h) => h.map(([x, y]) => [r(x), r(y)])),
    engrave: (p.engrave ?? []).map((h) => h.map(([x, y]) => [r(x), r(y)])),
    place: p.place,
  }));
  const body = JSON.stringify({ parts, stats: out.stats, assembly: out.assembly, error: out.error ?? null });
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

describe("Boxes version 1 designs", () => {
  it("build exactly the same parts as before", async () => {
    const prints = Object.fromEntries(Object.entries(LEGACY).map(([k, raw]) => [k, fingerprint(raw)]));
    await expect(JSON.stringify(prints, null, 2) + "\n").toMatchFileSnapshot("./golden/boxes-v1.json");
  });
});
