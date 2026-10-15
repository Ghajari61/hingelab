import { describe, expect, it } from "vitest";
import { getPath } from "@/lib/generators/path";
import { desktopCatalog, generateDesign } from "../products";
import type { GenerateResponse } from "../types";

const body = (r: { body: unknown }) => r.body as GenerateResponse;

describe("desktop Randomise", () => {
  it("marks the settings Randomise may change, and seeds with their own dice", async () => {
    const c = await desktopCatalog();
    const fields = (id: string) => c.products.find((p) => p.id === id)!.sections.flatMap((s) => s.fields);
    for (const p of c.products.filter((x) => x.id !== "hinge")) {
      expect(fields(p.id).some((f) => f.kind !== "text" && f.shuffle), p.id).toBe(true);
      expect(fields(p.id).some((f) => f.kind === "text" && "shuffle" in f), p.id).toBe(false);
    }
    expect(fields("puzzle").some((f) => f.kind === "number" && f.random)).toBe(true);
  });

  it("gives a generator a new design that builds, keeping locked settings and the text", async () => {
    const start = body(await generateDesign({ product: "clock" }, "pro")).params;
    let changed = 0;
    for (let i = 0; i < 6; i++) {
      const r = await generateDesign({ product: "clock", params: start, randomise: { locked: ["face.shape"] } }, "pro");
      expect(r.status, body(r).error).toBe(200);
      const q = body(r).params;
      expect(getPath(q, "face.shape")).toBe(getPath(start, "face.shape"));
      expect(getPath(q, "inscription.text")).toEqual(getPath(start, "inscription.text"));
      if (JSON.stringify(q) !== JSON.stringify(start)) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  }, 60000);

  it("gives the Hinge Box a new pattern within the plan, keeping its size", async () => {
    const start = body(await generateDesign({ product: "hinge" }, "free")).params;
    for (let i = 0; i < 6; i++) {
      const r = await generateDesign({ product: "hinge", params: start, randomise: {} }, "free");
      expect(r.status, body(r).error ?? body(r).locked).toBe(200);
      const q = body(r).params;
      for (const k of ["W", "D", "H", "shape", "material"]) expect(q[k]).toEqual(start[k]);
    }
  }, 60000);

  it("rejects a malformed request", async () => {
    expect((await generateDesign({ product: "clock", randomise: { locked: [1] } }, "pro")).status).toBe(400);
    expect((await generateDesign({ product: "clock", randomise: "yes" }, "pro")).status).toBe(400);
  });
});
