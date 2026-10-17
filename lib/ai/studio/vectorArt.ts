import "server-only";
/**
 * AI Studio's vector engine: Claude draws the picture as one SVG of black shapes on white, and the
 * server renders it to PNG, so every Studio tool (score, vectorize, engrave) works on it as on any
 * picture. Used when the picture services are not available (no credit, not set up). Vector line
 * art suits the laser well; photographic styles come out as bold ink drawings.
 */
import { Resvg } from "@resvg/resvg-js";
import { generateText, type LanguageModel, type ModelMessage, type UserContent } from "ai";
import { claudeFirstRoutes, userTag, withFallback, type ImageData, type TextRoute } from "@/lib/ai/providers";
import { inertSvgMarkup } from "@/lib/security/svg";
import { styleById } from "./styles";

export type Aspect = "square" | "wide" | "tall";

export const ASPECT_BOX: Record<Aspect, [number, number]> = { square: [1024, 1024], wide: [1536, 1024], tall: [1024, 1536] };

export interface VectorAsk {
  prompt: string;
  style?: string;
  aspect?: Aspect;
  /** A picture to redraw (restyle), and reference pictures for the subject or style. */
  source?: ImageData;
  refs?: ImageData[];
  sketch?: boolean;
  transparent?: boolean;
}

export interface VectorResult {
  png: Uint8Array;
  svg: string;
  model: string;
}

export const VECTOR_SYSTEM = `You are a master vector illustrator who draws artwork for laser cutting and engraving. You draw by writing SVG by hand, with the skill of a professional illustrator: confident curves, good proportions, a clear silhouette and rich, intentional detail.
Answer with one complete SVG document and nothing else.
Rules:
- Start with <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H"> using the size you are given, and draw everything inside it with a margin of at least 4%.
- Use only these elements: g, path, circle, ellipse, rect, polygon, polyline, line. No text, no image, no use, no defs, no symbol, no pattern, no style element, no CSS, no gradients, no filters, no masks, no clipPath, no links. To repeat a motif, write each copy out, placed with <g transform="rotate(…)"> or translate.
- Keep the file compact: whole-number coordinates, under 25,000 characters.
- Colours: black (#000) ink on a white (#fff) background rectangle that fills the frame. Fills and strokes are black or white only, unless the style asks for flat colours or tones.
- Build the drawing from many shapes (usually 40 to 300 path commands): the subject, its parts and the decoration the style asks for. Smooth curves use C, Q, S or A commands.
- Draw like an artist, not with boxes: study the subject's real shape and anatomy, give it a graceful outline with flowing Bezier curves, and add the characteristic details (fur tufts, feather tips, petals, folds) that make it recognisable and charming.
- For cut-outs every black part joins the others; no line thinner than 0.5% of the width.
- Never draw letters or words; leave clean empty space where words will be added.
- Keep cultural motifs accurate (Persian girih and eslimi, Celtic knots, Art Nouveau) and never draw logos, brands or copyrighted characters.`;

const ELEMENT = /<(path|circle|ellipse|rect|polygon|polyline|line)\b/gi;
/** The first drawing must be back within this for a second try to fit in the route's 110 s. */
const SECOND_TRY_MS = 50_000;
/** Less thinking keeps a drawing inside the route's time; the drawing itself is the answer. */
const VECTOR_EFFORT = "medium";
/** Elements the vector engine allows; anything else is removed before rendering. */
const DISALLOWED = /<\s*(text|tspan|textPath|title|desc|metadata|defs|clipPath|mask|pattern|marker|symbol|linearGradient|radialGradient|filter)\b[\s\S]*?<\s*\/\s*\1\s*>|<\s*(text|tspan|defs|clipPath|mask|pattern|marker|symbol|linearGradient|radialGradient|filter)\b[^>]*\/>/gi;

/** The SVG in a model answer, cleaned: comments and disallowed elements removed, active content refused. */
export function cleanVectorSvg(answer: string, aspect: Aspect = "square"): string | null {
  const m = /<svg[\s\S]*<\/svg>/i.exec(answer);
  if (!m) return null;
  let svg = m[0].replace(/<!--[\s\S]*?-->/g, "").replace(DISALLOWED, "").replace(/\s(class|style|id)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  if (!/\sxmlns=/.test(svg.slice(0, 200))) svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (!/viewBox=/i.test(svg.slice(0, 300))) { const [w, h] = ASPECT_BOX[aspect]; svg = svg.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`); }
  return inertSvgMarkup(svg) ?? null;
}

export const shapeCount = (svg: string) => (svg.match(ELEMENT) ?? []).length;

/** The SVG as a PNG of the frame's size, and the share of it that is ink. */
export function renderVector(svg: string, aspect: Aspect, transparent = false): { png: Uint8Array; ink: number } {
  const [w] = ASPECT_BOX[aspect];
  const img = new Resvg(svg, { fitTo: { mode: "width", value: w }, ...(transparent ? {} : { background: "#ffffff" }) }).render();
  const p = img.pixels;
  let ink = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 128 && p[i] < 110 && p[i + 1] < 110 && p[i + 2] < 110) ink++;
  return { png: new Uint8Array(img.asPng()), ink: ink / Math.max(1, p.length / 4) };
}

/** What is wrong with a drawing, in words for the model, or "" when it is fine. */
export function vectorProblems(svg: string, ink: number): string {
  const out: string[] = [];
  const n = shapeCount(svg);
  if (n < 12) out.push(`It has only ${n} shapes: draw the subject in far more detail.`);
  if (ink < 0.02) out.push("Almost nothing is drawn: the ink covers under 2% of the frame. Draw the subject large and bold.");
  if (ink > 0.8) out.push("The frame is almost all black: draw black shapes on a white background.");
  return out.join(" ");
}

function request(o: VectorAsk): UserContent {
  const [w, h] = ASPECT_BOX[o.aspect ?? "square"];
  const style = o.style ? styleById(o.style) : undefined;
  const text = [
    o.source ? (o.sketch ? "Turn the attached rough sketch into a finished, clean design. Keep its layout, proportions and every element it shows." : "Redraw the attached picture as a new laser design. Keep the subject, its pose and the composition.") : "",
    `Draw: ${o.prompt || "(see the picture)"}`,
    style ? `Style: ${style.name}. ${style.prompt}` : "",
    o.refs?.length ? "The other attached pictures are references for the subject and style: make a new design, do not trace them." : "",
    o.transparent ? "Leave out the white background rectangle." : "",
    `Frame: viewBox="0 0 ${w} ${h}".`,
  ].filter(Boolean).join("\n\n");
  const pictures = [...(o.source ? [o.source] : []), ...(o.refs ?? [])].slice(0, 4);
  return [{ type: "text", text }, ...pictures.map((p) => ({ type: "file" as const, mediaType: p.mediaType, data: Buffer.from(p.data).toString("base64") }))];
}

/** Claude routes only: the vector engine needs a model that draws SVG well and can see pictures. */
export const vectorRoutes = (userId: string) => claudeFirstRoutes(userTag("ai-studio", userId), "ai-studio").filter((r) => r.id.startsWith("claude"));

/** Draws the picture as SVG with Claude and renders it; asks once more when the first drawing is weak. */
export async function drawVectorArt(o: VectorAsk, userId: string, signal: AbortSignal, model?: LanguageModel): Promise<VectorResult> {
  const routes: TextRoute[] = model ? [{ id: "claude-test", model, providerOptions: {} }] : vectorRoutes(userId);
  const aspect = o.aspect ?? "square";
  const { result, provider } = await withFallback(routes, async (r) => {
    const messages: ModelMessage[] = [{ role: "user", content: request(o) }];
    const ask = async () => {
      const { text } = await generateText({
        model: r.model, providerOptions: { ...r.providerOptions, anthropic: { effort: VECTOR_EFFORT } },
        system: VECTOR_SYSTEM, messages, maxOutputTokens: 16_000, abortSignal: signal,
      });
      return text;
    };
    const t0 = Date.now();
    let answer = await ask();
    let svg = cleanVectorSvg(answer, aspect);
    let drawn = svg ? renderVector(svg, aspect, o.transparent) : null;
    const problems = svg && drawn ? vectorProblems(svg, drawn.ink) : "There was no usable SVG in your answer: answer with the SVG document only.";
    // A second try only while it can still finish inside the route's time.
    if (problems && !signal.aborted && Date.now() - t0 < SECOND_TRY_MS) {
      // An empty answer (all thinking, no text) cannot be sent back as an assistant turn.
      if (answer.trim()) messages.push({ role: "assistant", content: answer.slice(0, 60_000) });
      messages.push({ role: "user", content: `${problems} Answer with one complete, improved SVG document.` });
      answer = await ask();
      const again = cleanVectorSvg(answer, aspect);
      const second = again ? renderVector(again, aspect, o.transparent) : null;
      if (again && second && (!svg || !drawn || shapeCount(again) >= shapeCount(svg))) { svg = again; drawn = second; }
    }
    if (!svg || !drawn) throw new Error("The model did not return a usable drawing.");
    return { png: drawn.png, svg };
  }, signal, (r, e) => console.warn(`AI Studio vector: ${r.id} failed:`, e instanceof Error ? e.message.slice(0, 200) : e));
  return { ...result, model: provider.id };
}
