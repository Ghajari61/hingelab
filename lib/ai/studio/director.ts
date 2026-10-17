import "server-only";
/**
 * AI Studio's Creative Director: one language-model call that turns the user's words (in any
 * language) and the Laser Brief into a precise English design brief for the image model, and one
 * that looks at a finished picture and says what to fix. Claude first, then OpenAI.
 */
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { claudeFirstRoutes, userTag, withFallback, type TextRoute } from "@/lib/ai/providers";
import { COSTS } from "./credits";
import { briefLine, METHOD_NAMES, PRODUCT_NAMES } from "./brief";
import type { CritiqueResponse, DirectorRequest, EnhanceResponse, LaserBrief } from "./request";
import { decodeDataUrl, StudioError } from "./server";
import { styleById } from "./styles";

const enhanceSchema = z.object({
  title: z.string().describe("A short English name for the design, 2 to 5 words."),
  prompt: z.string().describe("The full English prompt for the image model, 60 to 140 words."),
  elements: z.array(z.string()).describe("The distinct parts the design shows, 3 to 8 short items."),
  text: z.array(z.string()).describe("Exact words, names or dates the user wants on the piece, in their original language and script. Empty when there are none."),
});

const critiqueSchema = z.object({
  score: z.number().describe("0 to 100: how well the picture matches the request and suits the laser method."),
  issues: z.array(z.string()).describe("At most four short problems in plain English, most important first. Empty when the picture is good."),
  fix: z.string().describe("A complete improved prompt for the image model when the score is under 70, otherwise an empty string."),
});

export const DIRECTOR_SYSTEM = `You are the Creative Director of HingeLab AI Studio, which makes artwork for laser cutting and engraving.
Turn the user's idea (in any language) into one precise English prompt for an image model. Be specific and visual:
- name the subject, its pose and every distinct element, the composition and the framing;
- say the line weight, the level of detail and the symmetry;
- respect the laser brief exactly: what the piece is, how the laser treats it and the material;
- the image model draws letters badly, so never ask it for words: leave clean empty space where text will go and list the words separately;
- keep cultural motifs accurate (Persian girih, eslimi and Nastaliq panels, Celtic knots, Art Nouveau) and never use brand names, logos or copyrighted characters.
Write a prompt that a skilled illustrator could follow without questions. Do not mention the background colour; the app adds it.`;

export const CRITIC_SYSTEM = `You review artwork made for laser cutting and engraving at HingeLab AI Studio.
Look at the picture and judge it against the request and the laser brief: does it show what was asked, is it clean and striking, and will it cut or engrave well (contrast, line thickness at the final size, parts that float free, clutter, stray texture, text the image model garbled)?
Score strictly: 85 and above is ready to sell, 70 is usable, under 50 needs a new picture.`;

type Ask = { routes: TextRoute[]; signal: AbortSignal; model?: LanguageModel };

async function ask<T>(a: Ask, system: string, content: string | ModelMessage[], schema: z.ZodType<T>): Promise<T> {
  const routes: TextRoute[] = a.model ? [{ id: "test", model: a.model, providerOptions: {} }] : a.routes;
  if (!routes.length) throw new StudioError("AI Studio's cloud tools are not set up on this server.", 503);
  const messages: ModelMessage[] = typeof content === "string" ? [{ role: "user", content }] : content;
  const { result } = await withFallback(routes, async (r) => {
    const { output } = await generateText({ model: r.model, providerOptions: r.providerOptions, system, messages, output: Output.object({ schema }), abortSignal: a.signal });
    return output as T;
  }, a.signal, (r, e) => console.warn(`AI Studio director: ${r.id} failed:`, e instanceof Error ? e.message.slice(0, 200) : e));
  return result;
}

const briefText = (b: LaserBrief) => [
  `Piece: ${PRODUCT_NAMES[b.product]}. Laser: ${METHOD_NAMES[b.method]}.${b.material ? ` Material: ${b.material}.` : ""}${b.widthMm ? ` About ${Math.round(b.widthMm)} mm wide.` : ""}`,
  briefLine(b),
].filter(Boolean).join("\n");

const clean = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export async function directorTurn(req: DirectorRequest, userId: string, signal: AbortSignal, model?: LanguageModel): Promise<EnhanceResponse | CritiqueResponse> {
  const a: Ask = { routes: claudeFirstRoutes(userTag("ai-studio", userId), "ai-studio"), signal, model };
  try {
    if (req.op === "enhance") {
      const style = req.style ? styleById(req.style) : undefined;
      const o = await ask(a, DIRECTOR_SYSTEM, [
        `Idea: ${req.prompt}`,
        briefText(req.brief),
        style ? `Style: ${style.name}. ${style.prompt}` : "",
      ].filter(Boolean).join("\n\n"), enhanceSchema);
      return {
        title: clean(o.title, 60) || "AI design",
        prompt: clean(o.prompt, 1000) || req.prompt,
        elements: o.elements.map((e) => clean(e, 60)).filter(Boolean).slice(0, 8),
        text: o.text.map((t) => clean(t, 80)).filter(Boolean).slice(0, 4),
        credits: COSTS.enhance,
      };
    }
    const img = decodeDataUrl(req.image);
    const o = await ask(a, CRITIC_SYSTEM, [{
      role: "user",
      content: [
        { type: "text", text: [`Request: ${req.prompt || "(not given)"}`, briefText(req.brief)].join("\n\n") },
        { type: "file", mediaType: img.mediaType, data: Buffer.from(img.data).toString("base64") },
      ],
    }], critiqueSchema);
    return {
      score: Math.max(0, Math.min(100, Math.round(o.score))),
      issues: o.issues.map((i) => clean(i, 140)).filter(Boolean).slice(0, 4),
      fix: clean(o.fix, 1000),
      credits: COSTS.critique,
    };
  } catch (e) {
    if (e instanceof StudioError) throw e;
    if (signal.aborted) throw new StudioError("The Creative Director took too long. Try again.", 504);
    throw new StudioError("The Creative Director could not answer. Try again in a minute.");
  }
}
