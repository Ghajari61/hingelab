import "server-only";
/**
 * AI Studio on the server: credits, picture jobs through the image providers, and the assistant (a
 * language model with tools for laser settings, product designs and pictures). Routes call these
 * after their sign-in and size checks.
 */
import { generateText, stepCountIs, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { hasPro, type Plan } from "@/lib/plans";
import { LIMITS, rateLimit, type LimitResult } from "@/lib/security/rateLimit";
import { machineById, MATERIAL_PRESETS, STARTING_POINT_NOTE, type LaserType, type MaterialPreset } from "@/lib/studio/library";
import { aiAllowance, aiLimitMessage } from "@/lib/ai/request";
import { AIDesignError, designWithAI } from "@/lib/ai/design";
import { examplesFor } from "@/lib/ai/examples";
import { claudeFirstRoutes, imageProviders, isBillingError, userTag, withFallback, ProviderError, type ImageData, type ImageProvider, type ImageSize } from "@/lib/ai/providers";
import { COSTS, imageCost, STUDIO_DAILY, type CloudOp } from "./credits";
import { directorTurn } from "./director";
import { drawVectorArt, type VectorAsk, type VectorResult } from "./vectorArt";
import { DESIGN_KITS, kitById } from "./kits";
import { MAX_VARIATIONS, type AssistantAction, type AssistantRequest, type AssistantResponse, type ImageRequest, type ImageResponse } from "./request";
import { STYLE_PRESETS, stylePrompt } from "./styles";

export class StudioError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

/** Shown when the AI provider accounts behind HingeLab have run out of paid credit. */
export const SERVICE_UNPAID = "AI Studio's AI service has reached its usage limit, so nothing was made. Please try again later.";
/** Redraw, Expand and AI Cutout need a picture service; the vector engine cannot do them. */
export const RASTER_ONLY = "This tool needs the AI picture service, which is not available right now. Quick Cutout, Smart Adjust, Line art and the other tools on this computer still work.";
export const VECTOR_NOTE = "Drawn as clean vectors by the AI";

/** Spends `cost` credits: the burst limit once, then one daily hit per credit. */
export async function spendCredits(plan: Plan, userId: string, cost: number): Promise<LimitResult & { daily?: boolean }> {
  const burst = await rateLimit(LIMITS.aiStudio, `user:${userId}`);
  if (!burst.ok) return burst;
  const rule = hasPro(plan) ? LIMITS.aiStudioDayPro : LIMITS.aiStudioDayFree;
  let last: LimitResult = { ok: true, retryAfter: 0 };
  for (let i = 0; i < cost; i++) {
    last = await rateLimit(rule, `user:${userId}`);
    if (!last.ok) return { ...last, daily: true };
  }
  return last;
}

export function creditsMessage(plan: Plan, daily?: boolean): string {
  if (!daily) return "Too many AI Studio jobs in a short time. Wait a few minutes and try again.";
  return hasPro(plan)
    ? `You have used today's ${STUDIO_DAILY.pro} AI Studio credits. They renew tomorrow.`
    : `You have used today's ${STUDIO_DAILY.free} free AI Studio credits. Pro has ${STUDIO_DAILY.pro} a day, or try again tomorrow.`;
}

export function decodeDataUrl(url: string): ImageData {
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(url);
  if (!m) throw new StudioError("The picture could not be read.", 400);
  return { mediaType: m[1], data: Uint8Array.from(Buffer.from(m[2], "base64")) };
}

/** Width and height from a PNG or JPEG header, or null. */
export function imageDims(b: Uint8Array): { w: number; h: number } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      i += 2 + len;
    }
  }
  return null;
}

export const sizeFor = (w: number, h: number): ImageSize => (w / h > 1.2 ? "1536x1024" : h / w > 1.2 ? "1024x1536" : "1024x1024");

/** The words sent to the image model for each operation. */
export function imagePrompt(req: ImageRequest): string {
  switch (req.op) {
    case "generate": return generatePrompt(req);
    case "restyle": return stylePrompt([
      req.sketch ? "Turn this rough sketch into a finished, clean design. Keep its layout, proportions and every element it shows." : "Redraw this picture as a new design. Keep the subject, its pose and the composition.",
      req.prompt,
    ].filter(Boolean).join(" "), req.style);
    case "redraw": return `Repaint only the transparent (masked) area: ${req.prompt}. Keep everything else exactly as it is and match its style, lighting and line weight.`;
    case "expand": return `Extend the picture into the empty border so the scene continues naturally${req.prompt ? `: ${req.prompt}` : ""}. Keep the original area exactly as it is.`;
    case "cutout": return "Keep the main subject exactly as it is, every detail and colour unchanged, and replace the whole background with flat pure white (#FFFFFF). No shadow, no outline, no frame.";
  }
}

/** Each variation of one prompt asks for a different take, so a set of four is not four copies. */
export const VARIATION_HINTS = [
  "",
  "Variation: a different composition and viewpoint from the obvious one.",
  "Variation: simpler and bolder, fewer and larger shapes.",
  "Variation: richer and more ornate, with more fine detail that still holds together.",
];

/** Text-to-image prompt with its variation hint and reference note. */
export function generatePrompt(req: Extract<ImageRequest, { op: "generate" }>): string {
  const words = [req.prompt, VARIATION_HINTS[req.variation ?? 0], req.refs?.length ? "Use the attached pictures as references for the subject and style; make a new design, do not copy them." : ""]
    .filter(Boolean).join("\n");
  const styled = stylePrompt(words, req.style);
  return req.transparent ? styled.replace("Pure white background", "Transparent background") : styled;
}

/** Draws with the vector engine instead of a picture service (generate and restyle). */
export type VectorDraw = (o: VectorAsk, userId: string, signal: AbortSignal) => Promise<VectorResult>;

async function vectorImage(req: ImageRequest, userId: string, signal: AbortSignal, draw: VectorDraw, plan: Plan): Promise<ImageResponse> {
  if (req.op !== "generate" && req.op !== "restyle") throw new StudioError(RASTER_ONLY, 503);
  const quality = req.quality === "high" && hasPro(plan) ? "high" : "medium";
  try {
    const r = req.op === "generate"
      ? await draw({ prompt: [req.prompt, VARIATION_HINTS[req.variation ?? 0]].filter(Boolean).join("\n"), style: req.style, aspect: req.aspect ?? "square", refs: req.refs?.map(decodeDataUrl), transparent: !!req.transparent }, userId, signal)
      : await draw({ prompt: req.prompt ?? "", style: req.style, source: decodeDataUrl(req.image), sketch: !!req.sketch }, userId, signal);
    return { image: `data:image/png;base64,${Buffer.from(r.png).toString("base64")}`, credits: imageCost(req.op, quality), provider: "claude-vector", model: r.model, note: VECTOR_NOTE };
  } catch (e) {
    if (signal.aborted) throw new StudioError("The picture took too long. Try again.", 504);
    if (e instanceof StudioError) throw e;
    console.error("AI Studio vector failed", e instanceof Error ? e.message.slice(0, 300) : e);
    if (isBillingError(e)) throw new StudioError(SERVICE_UNPAID, 503);
    throw new StudioError("The picture could not be made. Try again in a minute.");
  }
}

export async function studioImage(req: ImageRequest, userId: string, signal: AbortSignal, providers: ImageProvider[] = imageProviders(), plan: Plan = "pro", draw: VectorDraw = drawVectorArt): Promise<ImageResponse> {
  if (!providers.length) return vectorImage(req, userId, signal, draw, plan);
  const user = userTag("ai-studio", userId);
  let size: ImageSize = req.op === "generate" ? (req.aspect === "wide" ? "1536x1024" : req.aspect === "tall" ? "1024x1536" : "1024x1024") : "1024x1024";
  const images: ImageData[] = [];
  let mask: ImageData | undefined;
  const quality = (req.op === "generate" || req.op === "restyle") && req.quality === "high" && hasPro(plan) ? "high" : "medium";
  const transparent = req.op === "generate" && req.transparent;
  if (req.op === "generate" && req.refs?.length) for (const r of req.refs) images.push(decodeDataUrl(r));
  if (req.op !== "generate") {
    const img = decodeDataUrl(req.image);
    const d = imageDims(img.data);
    if (d) size = sizeFor(d.w, d.h);
    images.push(img);
    if (req.op === "redraw" || req.op === "expand") mask = decodeDataUrl(req.mask);
  }
  try {
    const { result } = await withFallback(providers, (p) => p.image({ prompt: imagePrompt(req), images, mask, size, user, signal, quality, ...(transparent ? { transparent } : {}) }), signal,
      (p, e) => console.warn(`AI Studio: ${p.id} image failed:`, e instanceof Error ? e.message.slice(0, 200) : e));
    return { image: `data:${result.mediaType};base64,${Buffer.from(result.data).toString("base64")}`, credits: imageCost(req.op, quality), provider: result.provider, model: result.model };
  } catch (e) {
    if (signal.aborted) throw new StudioError("The picture took too long. Try again.", 504);
    if (e instanceof ProviderError && !e.retry) throw new StudioError("The AI provider refused this request. Change the words or the picture and try again.", 422);
    // No credit, an outage or a broken key: Claude draws it instead (Redraw, Expand and Cutout say they need the picture service).
    return vectorImage(req, userId, signal, draw, plan);
  }
}

// ------------------------------------------------------------------ assistant

const findMaterial = (q: string): MaterialPreset | undefined => {
  const s = q.toLowerCase();
  return MATERIAL_PRESETS.find((m) => m.id === s)
    ?? MATERIAL_PRESETS.find((m) => m.name.toLowerCase().includes(s))
    ?? MATERIAL_PRESETS.find((m) => s.split(/\W+/).some((w) => w.length > 3 && m.name.toLowerCase().includes(w)));
};

/** Starting power and speed from the Studio's material library (never invented by the model). */
export function laserSettings(material: string, laser: LaserType, operation: "cut" | "score" | "engrave") {
  const m = findMaterial(material);
  if (!m) return { found: false as const, materials: MATERIAL_PRESETS.map((x) => x.name) };
  const cut = m.cut[laser], engrave = m.engrave[laser];
  const base = operation === "engrave" ? engrave : cut;
  if (!base) return { found: true as const, material: m.name, possible: false as const, note: operation === "engrave" ? `No engraving settings for ${m.name} on a ${laser} laser.` : `${m.name} cannot be cut on a ${laser} laser. ${m.notes}`.trim() };
  const s = operation === "score" ? { speed: Math.round(base.speed * 4), power: Math.round(base.power * 0.5), passes: 1 } : base;
  return {
    found: true as const, material: m.name, possible: true as const, operation, laser, ...s,
    ...(operation === "engrave" ? { interval: 0.1 } : {}),
    note: [STARTING_POINT_NOTE, m.notes].filter(Boolean).join(". "),
  };
}

export const ASSISTANT_SYSTEM = `You are the creative partner in HingeLab AI Studio, a laser-cutting design editor. You are an expert laser maker and a gifted illustrator. Help the user plan and make laser-cut and engraved things that look professional and sell well.
Answer in the user's language, short and plain (at most 120 words). Be concrete: sizes in mm, the material, the method and one good idea the user did not think of.
Tools:
- laser_settings: power and speed for a material and operation, from HingeLab's tested library. Use it whenever settings are asked for; never invent numbers. Say they are a starting point to test.
- make_design: a complete, ready-to-cut product (boxes, hinge boxes, signs, letters, toppers, puzzles, clocks, trophies, original drawings) from a description with sizes in mm and any text. Use it when the user wants a finished product.
- make_image: artwork from the image model in a laser style, for engraving or tracing. Write a rich, specific English prompt (subject, every element, composition, line weight, detail level) and never ask the image model for words. Offer 2 to 4 variations when the user is exploring.
- use_recipe: one of the ready AI Studio recipes, when the request matches it closely; give the subject words and any names or dates.
- review_selection: judge the picture selected on the canvas for the laser and say what to fix. Use it when the user asks whether the selected picture is good.
After a tool, tell the user what is ready and that they can apply it with the button under your message. Never mention tool names.`;

export async function assistantTurn(req: AssistantRequest, plan: Plan, userId: string, signal: AbortSignal): Promise<AssistantResponse> {
  const actions: AssistantAction[] = [];
  const laser: LaserType = (req.context.machine && machineById(req.context.machine)?.laser) || "co2";
  const layers = req.context.layers ?? [];
  const layerFor = (op: "cut" | "score" | "engrave") => layers.find((l) => l.mode === (op === "engrave" ? "fill" : op));
  const tools = {
    laser_settings: tool({
      description: "Starting power (%), speed (mm/s) and passes for a material and operation on the user's laser.",
      inputSchema: z.object({
        material: z.string().describe("Material name or id, e.g. birch plywood 3 mm, acrylic, leather, MDF, card, anodised aluminium."),
        operation: z.enum(["cut", "score", "engrave"]),
      }),
      execute: async ({ material, operation }) => {
        const r = laserSettings(material || req.context.material || "birch3", laser, operation);
        const layer = layerFor(operation);
        if (r.found && r.possible && layer) {
          actions.push({ kind: "layer", layer: layer.index, name: layer.name, power: r.power, speed: r.speed, passes: r.passes, ...(r.interval ? { interval: r.interval } : {}), note: `${r.material}, ${operation} on ${laser.toUpperCase()}` });
        }
        return r;
      },
    }),
    make_design: tool({
      description: "Designs a complete laser-cut product from a description and returns its summary.",
      inputSchema: z.object({ request: z.string().max(1200).describe("What to make: the object, sizes in mm, material and the exact text on it.") }),
      execute: async ({ request }) => {
        const allowed = await aiAllowance(plan, userId);
        if (!allowed.ok) return { error: aiLimitMessage(plan, allowed.daily) };
        try {
          const d = await designWithAI({ prompt: request }, plan, userId, undefined, { examples: examplesFor });
          actions.push({ kind: "design", name: d.name, productName: d.productName, summary: d.summary, product: d.product, preset: d.preset, params: d.params, notes: d.notes,
            ...(d.svg ? { svg: d.svg, width: d.width, height: d.height } : {}), ...(d.open ? { open: d.open } : {}), ...(d.error ? { error: d.error } : {}), ...(d.locked ? { locked: d.locked } : {}) });
          return { made: d.name, product: d.productName, summary: d.summary, notes: d.notes, ...(d.error ? { problem: d.error } : {}) };
        } catch (e) {
          return { error: e instanceof AIDesignError ? e.message : "The design could not be made." };
        }
      },
    }),
    make_image: tool({
      description: "Prepares pictures for the image model; the user starts them with one click.",
      inputSchema: z.object({
        prompt: z.string().max(1000),
        style: z.enum(STYLE_PRESETS.map((s) => s.id) as [string, ...string[]]).optional(),
        count: z.number().int().min(1).max(MAX_VARIATIONS).optional().describe("How many variations, 1 to 4."),
      }),
      execute: async ({ prompt, style, count }) => {
        actions.push({ kind: "image", prompt, ...(style ? { style } : {}), ...(count && count > 1 ? { count } : {}) });
        return { ready: true };
      },
    }),
    use_recipe: tool({
      description: `Starts one of AI Studio's ready recipes. Recipes: ${DESIGN_KITS.map((k) => `${k.id} (${k.name}: ${k.blurb})`).join("; ")}.`,
      inputSchema: z.object({
        recipe: z.enum(DESIGN_KITS.map((k) => k.id) as [string, ...string[]]),
        words: z.string().max(200).describe("The subject words the recipe asks for."),
        text: z.string().max(120).optional().describe("Names, dates or a message to set as real text on the piece."),
      }),
      execute: async ({ recipe, words, text }) => {
        actions.push({ kind: "recipe", recipe, words, ...(text ? { fields: { text } } : {}) });
        return { ready: true, recipe: kitById(recipe)?.name };
      },
    }),
    review_selection: tool({
      description: "Reviews the picture selected on the canvas for laser use: a score and what to fix.",
      inputSchema: z.object({ request: z.string().max(600).describe("What the picture is meant to be.") }),
      execute: async ({ request }) => {
        if (!req.context.image) return { error: "No picture is selected. Ask the user to select one first." };
        try {
          const r = await directorTurn({ op: "critique", image: req.context.image, prompt: request, brief: { product: "canvas", method: "cut", material: req.context.material ?? "" } }, userId, signal);
          return r;
        } catch (e) {
          return { error: e instanceof StudioError ? e.message : "The picture could not be reviewed." };
        }
      },
    }),
  };
  const ctx = [
    req.context.material && `Material on the sheet: ${req.context.material}`,
    `Laser: ${laser}`,
    req.context.sheet && `Sheet: ${Math.round(req.context.sheet.w)} × ${Math.round(req.context.sheet.h)} mm`,
    layers.length && `Cut layers: ${layers.map((l) => `${l.index} ${l.name} (${l.mode})`).join(", ")}`,
    req.context.selection && `Selected: ${req.context.selection}`,
    req.context.image && "A picture is selected; review_selection can look at it.",
  ].filter(Boolean).join("\n");
  const messages: ModelMessage[] = req.messages.map((m) => ({ role: m.role, content: m.text }));
  const user = userTag("ai-studio", userId);
  try {
    const { result } = await withFallback(claudeFirstRoutes(user, "ai-studio"), async (r) => {
      actions.length = 0;
      return generateText({
        model: r.model, providerOptions: r.providerOptions,
        system: `${ASSISTANT_SYSTEM}\n\nThe user's Studio:\n${ctx}`,
        messages, tools, stopWhen: stepCountIs(4), maxRetries: 1, abortSignal: signal,
      });
    }, signal, (r, e) => console.warn(`AI Studio assistant: ${r.id} failed:`, e instanceof Error ? e.message.slice(0, 200) : e));
    const reply = result.text.trim() || (actions.length ? "Done. Apply it with the button below." : "I could not answer that. Try asking differently.");
    return { reply: reply.slice(0, 2000), actions: actions.slice(0, 6), credits: COSTS.assistant };
  } catch (e) {
    if (signal.aborted) throw new StudioError("The assistant took too long. Try again.", 504);
    console.error("AI Studio assistant failed", e);
    if (isBillingError(e)) throw new StudioError(SERVICE_UNPAID, 503);
    throw new StudioError("The assistant could not answer. Try again in a minute.");
  }
}

export const costOf = (op: CloudOp) => COSTS[op];
