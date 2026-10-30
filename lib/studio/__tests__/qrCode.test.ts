import { describe, expect, it } from "vitest";
import { decodeContours } from "@/lib/generators/__tests__/qrDecode";
import { createDocument } from "../doc";
import { placeQr, qrOutlines, QR_INSERT_DEFAULTS } from "../qrCode";
import { findNode } from "../scene";
import type { Contour } from "@/lib/generators/types";
import type { PathNode, Subpath } from "../types";

const contours = (subs: Subpath[]): Contour[] => subs.map((s) => s.nodes.map((n) => [n.x, n.y] as [number, number]));

describe("Insert QR Code", () => {
  it("places a scannable code on a fill layer, centred where asked", () => {
    const d = createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } });
    const id = placeQr(d, { ...QR_INSERT_DEFAULTS, text: "https://example.com/menu", style: "dots", eyeFrame: "circle", eyeBall: "circle" }, 0, { x: 120, y: 80 })!;
    const n = findNode(d.root, id) as PathNode;
    expect(n.type).toBe("path");
    expect(n.transform.slice(4)).toEqual([120, 80]);
    expect(d.cutLayers[n.layer].mode).toBe("fill");
    const q = qrOutlines({ ...QR_INSERT_DEFAULTS, text: "https://example.com/menu", style: "dots", eyeFrame: "circle", eyeBall: "circle" })!;
    expect(decodeContours(contours(n.subpaths), q.module)).toBe("https://example.com/menu");
  });

  it("an inverted code (light modules filled) still decodes; empty or huge content gives nothing", () => {
    const o = { ...QR_INSERT_DEFAULTS, text: "WIFI:T:WPA;S:Cafe;P:secret;;", invert: true };
    const q = qrOutlines(o)!;
    expect(decodeContours(contours(q.subpaths), q.module)).toBe(o.text);
    expect(qrOutlines({ ...o, text: "  " })).toBeNull();
    expect(qrOutlines({ ...o, text: "x".repeat(5000), ecc: "H" })).toBeNull();
    expect(placeQr(createDocument({ name: "T", id: "doc", now: "2026-01-01T00:00:00.000Z", sheet: { w: 300, h: 200 } }), { ...o, text: "" }, 0, { x: 0, y: 0 })).toBeNull();
  });
});
