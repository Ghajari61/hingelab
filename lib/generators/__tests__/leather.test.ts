import { describe, expect, it } from "vitest";
import { LEATHER } from "../leather";
import type { LeatherOutput } from "../leather/build";
import { Pattern } from "../leather/kit";
import { LEATHERS } from "../leather/materials";
import { DECOR_NAMES, LEATHER_DEFAULTS, PRODUCTS, mergeLeather, type DecorStyle, type LeatherParams, type ProductKind } from "../leather/params";
import { applyProduct, LEATHER_PRESETS } from "../leather/presets";
import { arrangeGenerator, sheetIssues } from "../output";
import { distToContour, pointInContour } from "../geom";
import { CTX } from "./ctx";

const build = (p: LeatherParams) => LEATHER.build(p, CTX) as LeatherOutput;
const ofProduct = (k: ProductKind, over: Partial<LeatherParams> = {}) => ({ ...applyProduct(mergeLeather({}), k, true), ...over });
const GEOMETRY = ["SEAM_MISMATCH", "HOLES_NEAR_EDGE", "HOLES_OVERLAP", "HARDWARE_EDGE", "HARDWARE_ON_STITCHING"];

describe("leather studio", () => {
  it("has 41 products in every construction family and 17 decorative styles", () => {
    const kinds = Object.keys(PRODUCTS) as ProductKind[];
    expect(kinds.length).toBe(41);
    expect(new Set(kinds.map((k) => PRODUCTS[k].family))).toEqual(new Set(["box", "wrap", "bucket", "folded", "flat", "strap"]));
    expect(Object.keys(DECOR_NAMES).filter((k) => k !== "none").length).toBe(17);
  });

  it("every product builds from its starting point with matched seams and clean holes", () => {
    for (const k of Object.keys(PRODUCTS) as ProductKind[]) {
      const p = ofProduct(k);
      const out = build(p);
      expect(out.error, k).toBeUndefined();
      expect(out.parts.length, k).toBeGreaterThan(0);
      const codes = LEATHER.check(p, out).map((i) => i.code);
      for (const c of GEOMETRY) expect(codes, `${k}: ${c}`).not.toContain(c);
      // every stitch hole lies inside its part, at least half the edge distance in
      for (const [id, recs] of Object.entries(out.info!.holes)) {
        const part = out.parts.find((q) => q.id === id)!;
        for (const h of recs) {
          expect(pointInContour(h.pt, part.outer), `${k} ${id} ${h.what}`).toBe(true);
          if (!h.what.endsWith(" mount")) expect(distToContour(h.pt, part.outer), `${k} ${id} ${h.what}`).toBeGreaterThanOrEqual(Math.min(p.stitch.edge * 0.5, h.r + 0.8) - 1e-6);
        }
      }
    }
  }, 60_000);

  it("seams get the same hole count on every side, whatever their lengths", () => {
    const pat = new Pattern({ ...LEATHER_DEFAULTS.stitch }, 2, LEATHER_DEFAULTS.hw);
    const a = { id: "a", name: "A", outer: [[0, 0], [300, 0], [300, 50], [0, 50]] as [number, number][], holes: [] };
    const b = { id: "b", name: "B", outer: [[0, 0], [300, 0], [300, 50], [0, 50]] as [number, number][], holes: [] };
    pat.add(a); pat.add(b);
    const curved: [number, number][] = Array.from({ length: 41 }, (_, i) => [10 + i * 5, 20 + 10 * Math.sin(i / 6)]);
    const rep = pat.seam("test", [{ part: a, rows: [curved] }, { part: b, rows: [[[10, 4], [212, 4]]] }]);
    expect(a.holes.length).toBe(rep.holes);
    expect(b.holes.length).toBe(rep.holes);
    expect(rep.lengths.length).toBe(2);
  });

  it("the templates build, fit the 915 × 458 mm bed and raise no geometry warnings", () => {
    expect(LEATHER_PRESETS.length).toBeGreaterThanOrEqual(40);
    expect(LEATHER_PRESETS.filter((q) => q.id.startsWith("studio-")).length).toBe(3);
    for (const pr of LEATHER_PRESETS) {
      const p = LEATHER.merge(pr.params);
      const out = build(p);
      expect(out.error, pr.id).toBeUndefined();
      const issues = LEATHER.check(p, out).filter((i) => i.level !== "info");
      expect(issues.map((i) => i.code), pr.id).toEqual(["LASER_BLOCKED"]);
      expect(sheetIssues(LEATHER, p, arrangeGenerator(LEATHER, p, CTX)).map((i) => i.code), pr.id).toEqual([]);
    }
  }, 120_000);

  it("never lets PVC or unknown leatherette be laser cut, and needs confirmation for everything else", () => {
    for (const l of LEATHERS) {
      const p = ofProduct("cardholder", { leather: l.id, verified: true });
      const iss = LEATHER.check(p, build(p));
      const blocked = iss.find((i) => i.code === "LASER_BLOCKED");
      if (l.id === "pvc" || l.id === "leatherette") {
        expect(blocked?.level, l.id).toBe("error");
        expect(blocked?.fixes.map((f) => f.id), l.id).toEqual(["manual"]);
      } else expect(blocked, l.id).toBeUndefined();
      const unconfirmed = ofProduct("cardholder", { leather: l.id, verified: false });
      expect(LEATHER.check(unconfirmed, build(unconfirmed)).some((i) => i.code === "LASER_BLOCKED" && i.level === "error"), l.id).toBe(true);
    }
    expect(LEATHERS.find((l) => l.id === "chrome")?.laser).toBe("not-approved");
    // the hand-cutting template is always allowed, and carries no laser checklist
    const manual = ofProduct("cardholder", { leather: "pvc", stitch: { ...LEATHER_DEFAULTS.stitch, mode: "manual" } });
    const out = build(manual);
    expect(LEATHER.check(manual, out).some((i) => i.code === "LASER_BLOCKED")).toBe(false);
    expect(out.assembly!.some((s) => s.startsWith("Laser safety"))).toBe(false);
    expect(out.parts.every((q) => q.holes.length === 0 || q.holes.every((h) => h.length > 3))).toBe(true);
    const laser = ofProduct("cardholder", { verified: true });
    expect(build(laser).assembly!.some((s) => s.startsWith("Laser safety"))).toBe(true);
  });

  it("stacks line up hole for hole through every layer", () => {
    const out = build(ofProduct("cardholder"));
    const back = out.info!.holes.back.map((h) => h.pt), front = out.parts.find((q) => q.id === "pocket2")!;
    const oy = out.info!.size[1] - (front.outer.reduce((m, q) => Math.max(m, q[1]), 0));
    const fr = out.info!.holes.pocket2;
    expect(fr.length).toBeGreaterThan(10);
    for (const h of fr) expect(back.some((q) => Math.hypot(q[0] - h.pt[0], q[1] - (h.pt[1] + oy)) < 1e-6)).toBe(true);
  });

  it("cuts a gusset longer than the bed in two overlapping parts with a stitched joint", () => {
    const p = ofProduct("tote", { size: { ...ofProduct("tote").size, width: 400, height: 330 } });
    const out = build(p);
    const g = out.parts.filter((q) => q.id.startsWith("gusset") && !q.id.includes("lining"));
    expect(g.map((q) => q.id)).toEqual(["gusset", "gusset-2"]);
    for (const q of g) expect(Math.max(...q.outer.map((a) => a[0])) - Math.min(...q.outer.map((a) => a[0]))).toBeLessThanOrEqual(p.bedW - 30 + 1e-6);
    expect(out.info!.seams.some((s) => s.label.endsWith("joint"))).toBe(true);
  });

  it("every decorative style decorates a coaster, clear of the stitching", () => {
    for (const style of Object.keys(DECOR_NAMES) as DecorStyle[]) {
      if (style === "none") continue;
      const base = ofProduct("coaster");
      const p = { ...base, size: { ...base.size, width: 120 }, decor: { ...base.decor, style, mode: "perforate" as const, scale: 14 } };
      const out = build(p);
      expect(out.info!.decor?.shapes ?? 0, style).toBeGreaterThan(0);
      expect(LEATHER.check(p, out).map((i) => i.code), style).not.toContain("HOLES_OVERLAP");
    }
  }, 60_000);

  it("strap goods size from the buckle and keep mirrored holes about each fold", () => {
    const out = build(ofProduct("belt"));
    const recs = out.info!.holes.strap;
    const screws = recs.filter((h) => h.what === "chicago mount");
    expect(screws.length).toBe(2);
    expect(screws[0].pt[0] + screws[1].pt[0]).toBeCloseTo(90, 1); // mirrored about the fold at 45 mm
    expect(recs.filter((h) => h.what === "Size holes").length).toBe(5);
  });

  it("reports thread, leather area and hardware", () => {
    const out = build(ofProduct("handbag"));
    const labels = out.stats.map((s) => s.label);
    for (const l of ["Thread", "Leather", "Hardware", "Stitching", "Laser"]) expect(labels).toContain(l);
    expect(out.info!.hardware.some((h) => h.kind === "zipper")).toBe(true);
    expect(out.info!.thread).toBeGreaterThan(out.info!.stitchLength);
  });
});
