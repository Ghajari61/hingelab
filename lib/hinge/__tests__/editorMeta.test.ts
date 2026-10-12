import { describe, expect, it } from "vitest";
import { DEFAULTS, clone, computeModel, type Model, type Params } from "@/lib/hinge";
import { explainHingeError, hingeIssues } from "@/lib/issues/hinge";
import { hingeMeta } from "@/components/editor/summary";

const hinge = (over: Partial<Params>): Params => ({ ...clone(DEFAULTS), ...over });
const build = (p: Params) => {
  const r = computeModel(p);
  return "error" in r ? null : (r as Model);
};

describe("Hinge Box dock headers", () => {
  it("the Dimensions header follows the current values, also while the box does not build", () => {
    const wide = hinge({ W: 700 });
    const before = hingeMeta(wide, build(wide), null, "mm");
    expect(before.dims).toBe("700 mm × 90 mm × 70 mm");

    const narrow = hinge({ W: 10 });
    expect(build(narrow)).toBeNull();
    const after = hingeMeta(narrow, null, before, "mm");
    expect(after.dims).toBe("10 mm × 90 mm × 70 mm");
    // The slit count needs a model, so it keeps the last one.
    expect(after.pat).toBe(before.pat);
    expect(after.pat).toMatch(/^\d+ slits$/);
  });

  it("formats polygons, cylinders and inches", () => {
    expect(hingeMeta(hinge({ shape: "poly", W: 120, sides: 6 }), null, null, "mm").dims).toBe("120 mm × 6 sides × 70 mm");
    expect(hingeMeta(hinge({ shape: "cyl", dia: 90 }), null, null, "mm").dims).toBe("Ø90 mm × 70 mm");
    expect(hingeMeta(hinge({ W: 254 }), null, null, "in").dims).toBe("10.000 in × 3.543 in × 2.756 in");
  });
});

describe("radius larger than the box", () => {
  const raw = "Corner radius is larger than half the width or depth. Lower the radius or enlarge the box.";

  it("names the width when the width is too small for the radius", () => {
    const p = hinge({ W: 10 });
    const r = computeModel(p);
    expect(r).toEqual({ error: raw });
    expect(explainHingeError(p, raw)).toBe("The width (10 mm) is less than twice the 24 mm corner radius. Make it at least 48 mm, or lower the radius to 5 mm or less.");
  });

  it("names the depth when a large radius does not fit the depth", () => {
    const p = hinge({ R: 50 });
    expect(explainHingeError(p, raw)).toBe("The depth (90 mm) is less than twice the 50 mm corner radius. Make it at least 100 mm, or lower the radius to 45 mm or less.");
  });

  it("leaves other errors as they are", () => {
    const msg = "Corner radius must be at least 4 mm for 3 mm material.";
    expect(explainHingeError(hinge({ R: 2 }), msg)).toBe(msg);
  });

  it("offers one-click fixes that make the box build, without changing anything silently", () => {
    const p = hinge({ W: 10 });
    const issue = hingeIssues(p).find((i) => i.code === "BUILD")!;
    expect(issue.message).toMatch(/^The width \(10 mm\)/);
    expect(issue.fixes.map((f) => f.label)).toEqual(["Set radius to 5 mm", "Set width to 48 mm"]);
    expect(issue.fixes.every((f) => !f.safe)).toBe(true);
    for (const f of issue.fixes) {
      const q = f.apply(p);
      expect(hingeIssues(q).some((i) => i.code === "BUILD"), f.label).toBe(false);
    }
  });
});
