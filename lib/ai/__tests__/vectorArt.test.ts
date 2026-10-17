import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { mockImageProvider } from "../providers/mock";
import { claudeFirstRoutes } from "../providers";
import { RASTER_ONLY, studioImage, VECTOR_NOTE, type VectorDraw } from "../studio/server";
import { cleanVectorSvg, drawVectorArt, renderVector, shapeCount, vectorProblems } from "../studio/vectorArt";

const PNG_1x1 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const signal = new AbortController().signal;

/** A bold drawing: a white frame with a black sun and twelve rays. */
const SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" fill="#fff"/>
<circle cx="512" cy="512" r="200" fill="#000"/>${Array.from({ length: 12 }, (_, i) => `<path d="M512 512 L${Math.round(512 + 420 * Math.cos(i * Math.PI / 6))} ${Math.round(512 + 420 * Math.sin(i * Math.PI / 6))}" stroke="#000" stroke-width="28"/>`).join("")}</svg>`;

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 20, text: 20, reasoning: undefined } };
function claude(...answers: string[]) {
  let i = 0;
  const calls: unknown[] = [];
  const model = new MockLanguageModelV4({
    doGenerate: async (opts) => {
      calls.push(opts.prompt);
      const text = answers[Math.min(i++, answers.length - 1)];
      return { content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] } as never;
    },
  });
  return { model, calls };
}

describe("vector engine", () => {
  it("keeps only safe drawing elements from a model answer", () => {
    const answer = `Here it is:\n\`\`\`svg\n<svg viewBox="0 0 1024 1024"><text x="1">Hi</text><style>p{}</style><path d="M0 0L9 9" class="a" style="fill:red"/></svg>\n\`\`\``;
    expect(cleanVectorSvg(answer)).toBeNull();
    const ok = cleanVectorSvg('<svg viewBox="0 0 1024 1024"><!-- hi --><text x="1">Hi</text><title>x</title><path d="M0 0L9 9" class="a"/></svg>')!;
    expect(ok).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(ok).not.toMatch(/<text|<title|class=|<!--/);
    expect(cleanVectorSvg('<svg viewBox="0 0 9 9"><image href="x.png"/></svg>')).toBeNull();
    expect(cleanVectorSvg("no drawing here")).toBeNull();
    expect(cleanVectorSvg('<svg><path d="M0 0"/></svg>', "wide")).toContain('viewBox="0 0 1536 1024"');
  });

  it("renders the drawing to a real PNG and measures its ink", () => {
    const r = renderVector(SUN, "square");
    expect(Array.from(r.png.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
    expect(r.ink).toBeGreaterThan(0.1);
    expect(r.ink).toBeLessThan(0.6);
    expect(shapeCount(SUN)).toBe(14);
    expect(vectorProblems(SUN, r.ink)).toBe("");
    expect(vectorProblems('<svg><circle r="1"/></svg>', 0.001)).toMatch(/far more detail.*under 2%/);
  });

  it("asks Claude again when the first drawing is weak, and keeps the better one", async () => {
    const { model, calls } = claude('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="5" cy="5" r="2"/></svg>', SUN);
    const r = await drawVectorArt({ prompt: "a sun", style: "silhouette" }, "u", signal, model);
    expect(calls).toHaveLength(2);
    expect(shapeCount(r.svg)).toBe(14);
    expect(r.model).toBe("claude-test");
  });

  it("sends the source picture to Claude when redrawing", async () => {
    const { model, calls } = claude(SUN);
    await drawVectorArt({ prompt: "", source: { data: Uint8Array.from(Buffer.from(PNG_1x1.split(",")[1], "base64")), mediaType: "image/png" }, sketch: true }, "u", signal, model);
    expect(JSON.stringify(calls[0])).toMatch(/rough sketch/);
    expect(JSON.stringify(calls[0])).toMatch(/image\/png/);
  });
});

describe("AI Studio falls back to vectors", () => {
  const draw: VectorDraw = async () => ({ png: renderVector(SUN, "square").png, svg: SUN, model: "claude" });
  const broke = () => mockImageProvider("openai", () => { throw new Error("You have no credits remaining. Add credits"); });
  const free = () => mockImageProvider("gateway", () => { throw new Error("Free tier users do not have access to this model."); });

  it("draws with Claude when every picture service is out of credit", async () => {
    const r = await studioImage({ op: "generate", prompt: "a sun" }, "u", signal, [broke(), free()], "pro", draw);
    expect(r).toMatchObject({ provider: "claude-vector", note: VECTOR_NOTE });
    expect(r.image).toMatch(/^data:image\/png;base64,/);
    const restyle = await studioImage({ op: "restyle", prompt: "", image: PNG_1x1 }, "u", signal, [broke()], "pro", draw);
    expect(restyle.provider).toBe("claude-vector");
  });

  it("draws with Claude when no picture service is set up", async () => {
    expect((await studioImage({ op: "generate", prompt: "a sun" }, "u", signal, [], "free", draw)).provider).toBe("claude-vector");
  });

  it("keeps the picture service when it works, and says which tools need it", async () => {
    const ok = mockImageProvider();
    expect((await studioImage({ op: "generate", prompt: "a sun" }, "u", signal, [ok], "pro", draw)).provider).toBe("mock");
    await expect(studioImage({ op: "cutout", image: PNG_1x1 }, "u", signal, [broke()], "pro", draw)).rejects.toMatchObject({ status: 503, message: RASTER_ONLY });
    const down = mockImageProvider("x", () => { throw new Error("503 upstream"); });
    expect((await studioImage({ op: "generate", prompt: "a sun" }, "u", signal, [down], "pro", draw)).provider).toBe("claude-vector");
    const nothing = async () => { throw new Error("overloaded"); };
    await expect(studioImage({ op: "generate", prompt: "a sun" }, "u", signal, [down], "pro", nothing)).rejects.toMatchObject({ status: 502 });
  });

  it("tries the deployment's own Claude key before the Gateway", () => {
    expect(claudeFirstRoutes("u", "t", { AI_GATEWAY_API_KEY: "x", ANTHROPIC_API_KEY: "z" }).map((r) => r.id).slice(0, 2)).toEqual(["claude", "claude-gateway"]);
  });
});
