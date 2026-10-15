import { describe, expect, it } from "vitest";
import { projectText, readProject } from "../../../desktop/src/projectFile";
import { detectProject } from "@/lib/projects/file";
import { mergeParams } from "@/lib/hinge";
import { designFromChanges, generateDesign } from "@/lib/desktop/products";

const NATIVE = new Set(["hinge", "clock", "boxes", "art"]);

describe("desktop project files", () => {
  it("writes the website's format, which the website reads back", () => {
    const text = projectText("hinge", { W: 80 });
    expect(JSON.parse(text)).toEqual({ app: "HingeLab", product: "hinge-box", version: 1, params: { W: 80 } });
    const d = detectProject(new TextEncoder().encode(projectText("clock", { name: "A" }, 3)));
    expect(d).toMatchObject({ section: "clock", version: 3, params: { name: "A" } });
  });

  it("opens designs the app edits itself, and sends the rest to the website", () => {
    expect(readProject(projectText("hinge", { W: 80 }), NATIVE)).toEqual({ kind: "native", product: "hinge", params: { W: 80 }, version: 1 });
    expect(readProject("\uFEFF" + JSON.stringify({ params: { W: 1 } }), NATIVE)).toMatchObject({ kind: "native", product: "hinge" });
    expect(readProject(JSON.stringify({ product: "clock", version: 2, params: {} }), NATIVE)).toMatchObject({ kind: "native", product: "clock", version: 2 });
    expect(readProject(JSON.stringify({ product: "letters", params: {} }), NATIVE)).toEqual({ kind: "web", section: "letters" });
    expect(readProject(JSON.stringify({ product: "parametric", params: {} }), NATIVE)).toEqual({ kind: "web", section: "parametric" });
    expect(readProject(null, NATIVE)).toEqual({ kind: "web", section: "studio" });
  });

  it("refuses what is not a project", () => {
    for (const t of ["", "[]", "{}", "{\"params\":[]}", "not json", JSON.stringify({ product: "art", params: {} })]) {
      expect(readProject(t, NATIVE).kind, t).toBe("error");
    }
    expect(readProject(JSON.stringify({ product: "testcard", params: {} }), NATIVE)).toMatchObject({ kind: "error", message: expect.stringContaining("Test Cards") });
  });

  it("round-trips a design through a file and the server", async () => {
    const { params } = await designFromChanges("hinge", null, [{ key: "W", value: 77 }]);
    expect(params.W).toBe(77);
    const r = readProject(projectText("hinge", params), NATIVE);
    if (r.kind !== "native") throw new Error("not native");
    const out = await generateDesign({ product: r.product, params: r.params, version: r.version }, "pro");
    expect(out.status).toBe(200);
    expect((out.body as { params: Record<string, unknown> }).params).toEqual(mergeParams(params as never));
  });

  it("generators report their settings version and migrate older files", async () => {
    const out = await generateDesign({ product: "clock", preset: undefined }, "pro");
    const v = (out.body as { version?: number }).version;
    expect(typeof v).toBe("number");
    const again = await generateDesign({ product: "clock", params: (out.body as { params: Record<string, unknown> }).params, version: v }, "pro");
    expect(again.status).toBe(out.status);
  });
});
