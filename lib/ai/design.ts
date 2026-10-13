import "server-only";
/**
 * The AI designer. A description or a photo goes to a language model in two steps: it picks the
 * product and preset that can make the thing and writes a brief, then fills in that product's
 * settings. The model never draws geometry: its choices are checked field by field against the
 * product's own ranges and options, and the product code builds, checks and fixes the design.
 */
import { createHash } from "node:crypto";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, Output, type LanguageModel, type UserContent } from "ai";
import { z } from "zod";
import { coerce, designFromChanges, generateDesign } from "@/lib/desktop/products";
import type { DesktopProductId, DField, GenerateResponse } from "@/lib/desktop/types";
import { MATERIALS } from "@/lib/hinge";
import { mergeLetterParams, type LetterParams } from "@/lib/letters";
import { parseLetterRequest } from "@/lib/billing/exportLetters";
import { parametricRequestError } from "@/lib/billing/validate";
import { mergeParametricParams } from "@/lib/parametric/defaults";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import type { Plan } from "@/lib/plans";
import { aiMenu, fieldsText, LETTER_FIELDS, productsText, type MenuProduct } from "./menu";
import { artDesign, artSchema, drawArt, editArt, type ArtOptions } from "./art";
import { gatewayConfigured } from "./request";
import { AI_OPEN_PREFIX, AI_PRODUCTS, MAX_OPEN_PATH, type AIDesign, type AIDesignRequest, type AIOpen, type AIProduct, type AIRevise } from "./types";

/**
 * Gateway model ids (provider/model), tried in order; the deployment can override the first with
 * AI_DESIGN_MODEL. The last one is open to AI Gateway's free tier, which refuses the others.
 */
const MODEL = "google/gemini-3.8-flash";
const FALLBACK_MODELS = ["openai/gpt-5.6-luna", "openai/gpt-5-mini"];
const OPENAI_MODEL = "gpt-5.6-terra";
const TIMEOUT_MS = 50_000;
/** An original design: drawing, rendering and one look at the result (the routes allow 180 s). */
const ART_TIMEOUT_MS = 150_000;

export class AIDesignError extends Error {}

const pickSchema = z.object({
  product: z.enum(AI_PRODUCTS).describe("The product that makes it."),
  preset: z.string().describe("Id of the preset of that product closest to the request, or an empty string to start from the product's defaults."),
  name: z.string().describe("A short English name for the design, e.g. \"Walnut pen box\"."),
  match: z.enum(["exact", "close", "loose"]).describe("exact: the product makes this; close: a near version of it; loose: only a rough stand-in."),
  flat: z.boolean().describe("True when the object is flat or a few flat pieces slotted or stacked together: signs, plaques, name plates, stands (phone, tablet, book), frames, ornaments, keychains, coasters, toppers, trophies, wall art. False for containers with walls (boxes, jars, cups, trays, drawers, planters), slice sculptures, puzzles, QR codes and clocks."),
  brief: z.string().describe("Everything the next step needs: what the object is, its shape, every size in millimetres (estimate sizes in a photo from typical real sizes), the exact text on it in its original language and script, style and material."),
});

const settingsSchema = z.object({
  settings: z.array(z.object({ key: z.string(), value: z.string() })).describe("Settings to change, by key from the list; numbers as plain numbers in the listed unit, choices as the option value, toggles as true or false."),
  notes: z.array(z.string()).describe("At most two short English sentences for the user, under 25 words each, in plain words (no setting keys, ids or the word 'brief'): a size you had to guess, or something asked for that this product cannot do. Usually none."),
});

const editSchema = settingsSchema.extend({
  name: z.string().describe("A new short English name when the change makes the current one wrong (e.g. the text on it changed), otherwise an empty string."),
});

/** Products that are a preset layout with the user's words in it; new designs are drawn instead (old ones still edit). */
const TEMPLATED = new Set<AIProduct>(["sign", "trophy", "topper", "keyrack", "tablenum"]);
/** Flat presets of the engineered products (signs, stands, frames, stencils); drawn instead too. */
const FLAT_PRESETS: Partial<Record<AIProduct, Set<string>>> = {
  boxes: new Set(["desk-sign", "name-plate", "office-sign", "frame-10x15", "frame-square", "phone-stand", "tablet-stand", "key-holder"]),
  letters: new Set(["script-sign", "year-sign", "hello-sign", "open-stencil", "bar-stencil"]),
};
/** Engineered products that are right for flat things too. */
const FLAT_OK = new Set<AIProduct>(["art", "parametric", "puzzle", "qr", "clock"]);
const isFlat = (product: AIProduct, preset: string) => TEMPLATED.has(product) || !!FLAT_PRESETS[product]?.has(preset);

/** The products a new design may come from: no template products or flat presets. */
const pickMenu = (menu: MenuProduct[]) => menu
  .filter((p) => !TEMPLATED.has(p.id))
  .map((p) => (FLAT_PRESETS[p.id] ? { ...p, presets: p.presets.filter((x) => !FLAT_PRESETS[p.id]!.has(x.id)) } : p));

const PICK_SYSTEM = `You are the design assistant of HingeLab, a web app that makes laser-cut files. A user describes something they want to laser cut, or shows a photo of one, possibly in Persian or another language. Choose the one product below that can make it and the preset closest to it. Text that must appear on the product keeps its original language and script.
Which product: art is the default. It draws an original design from scratch for anything flat or made of a few flat pieces: signs, name plates, logos, ornaments, coasters, keychains, wall art, cake toppers, key holders, table numbers, trophies, phone and tablet stands, decorations, engraved pictures. Choose another product only for what needs its engineering and that it makes exactly (match "exact"); anything it would only approximate is art: round, oval or curved containers with bending walls are hinge; boxes, trays, drawers, money boxes and bird houses with finger joints are boxes; hollow letter boxes with walls are letters; sculptures made of many slices are parametric; jigsaw puzzles are puzzle; QR codes are qr; clocks with a movement hole are clock. Also choose a product when the user names it.
The brief describes only what the user asked for or the photo shows, in under 80 words; do not add features. When the user writes about the photo (what it is, its size, text or changes they want), that wins over what the photo seems to show.

`;

const SETTINGS_SYSTEM = `You set the settings of one HingeLab product so the design matches a brief. Use only keys from the list below, values inside the ranges and options from the lists. Set what the brief decides (sizes in millimetres, shape, style, material) and leave everything else out, so it keeps the starting value.
Words that appear on the product: put the exact words from the brief, in their original script, into the matching text fields, replacing the starting text; leave out text fields the brief gives no words for. Never put measurements or explanations into those fields.
The app makes the cut file and the 3D preview itself; notes are only for guesses the user should check, never about settings you left alone, things nobody asked for, material, fit or testing.

Settings (key | type and range | label - help):
`;

function userContent(req: AIDesignRequest, extra?: string): UserContent {
  const note = req.image && req.imageNote?.trim();
  const text = [
    `Request: ${req.prompt.trim() || (note ? "(see the photo and the note about it)" : "(no description; see the photo)")}`,
    note ? `About the photo: ${note}` : "",
    extra,
  ].filter(Boolean).join("\n\n");
  const parts: Exclude<UserContent, string> = [{ type: "text", text }];
  if (req.image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(req.image);
    if (m) parts.push({ type: "file", mediaType: m[1], data: m[2] });
  }
  return parts;
}

const userTag = (userId: string) => createHash("sha256").update(`ai-design:${userId}`).digest("hex").slice(0, 24);

type Route = { model: LanguageModel; providerOptions: NonNullable<Parameters<typeof generateText>[0]["providerOptions"]> };

/** OpenAI directly when the deployment has its own OPENAI_API_KEY (model OPENAI_MODEL), then the AI Gateway. */
function routes(ask: Ask): Route[] {
  const gateway: Route = {
    model: ask.model ?? (process.env.AI_DESIGN_MODEL || MODEL),
    providerOptions: { gateway: { models: FALLBACK_MODELS, user: userTag(ask.userId), tags: ["ai-design"] } },
  };
  const key = process.env.OPENAI_API_KEY;
  if (ask.model || !key) return [gateway];
  const openai: Route = {
    model: createOpenAI({ apiKey: key })(process.env.OPENAI_MODEL || OPENAI_MODEL),
    providerOptions: { openai: { safetyIdentifier: userTag(ask.userId) } },
  };
  return gatewayConfigured() ? [openai, gateway] : [openai];
}

type Ask = { model?: LanguageModel; userId: string; signal: AbortSignal };

async function askModel<T>(ask: Ask, system: string, content: UserContent, schema: z.ZodType<T>, reasoning: "low" | "medium" = "low"): Promise<T> {
  const list = routes(ask);
  for (let i = 0; ; i++) {
    try {
      const { output } = await generateText({
        ...list[i],
        system,
        messages: [{ role: "user", content }],
        output: Output.object({ schema }),
        reasoning,
        abortSignal: ask.signal,
      });
      return output as T;
    } catch (e) {
      if (i + 1 >= list.length || ask.signal.aborted) throw e;
      console.warn("AI designer: OpenAI failed, trying the gateway:", e instanceof Error ? e.message.slice(0, 200) : e);
    }
  }
}

const pick = (req: AIDesignRequest, menu: MenuProduct[], ask: Ask) =>
  askModel(ask, PICK_SYSTEM + productsText(menu), userContent(req), pickSchema);

function settings(req: AIDesignRequest, product: MenuProduct, brief: string, start: Record<string, unknown>, ask: Ask, editing?: string) {
  const current = Object.fromEntries(product.fields.map((f) => [f.key, f.key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), start)]));
  const content = userContent(req, `Product: ${product.name}\n${editing ? `Current name: ${editing}\n` : ""}Brief: ${brief}\nStarting values: ${JSON.stringify(current)}`);
  const system = SETTINGS_SYSTEM + fieldsText(product);
  return editing ? askModel(ask, system, content, editSchema) : askModel(ask, system, content, settingsSchema).then((o) => ({ ...o, name: "" }));
}

const TO_MM: Record<string, number> = { mm: 1, cm: 10, m: 1000, in: 25.4, inch: 25.4, inches: 25.4, '"': 25.4 };

/** A model's value as the field's type: "true" for toggles; for numbers the first number, with cm, m and inches turned into mm on mm fields. */
export function valueOf(raw: string, field: DField | undefined): unknown {
  const s = raw.trim();
  if (field?.kind === "toggle") return /^(true|yes|on)$/i.test(s) ? true : /^(false|no|off)$/i.test(s) ? false : s;
  if (field?.kind !== "number") return raw;
  const m = /(-?\d+(?:[.,]\d+)?)\s*(mm|cm|m|inches|inch|in|")?(?![a-z])/i.exec(s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
  if (!m) return NaN;
  const n = Number(m[1].replace(",", "."));
  return field.unit === "mm" && m[2] ? n * TO_MM[m[2].toLowerCase()] : n;
}

const cleanName = (s: string, fallback: string) => s.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) || fallback;

function startParams(product: AIProduct, preset: string | null): Record<string, unknown> {
  if (product === "letters") return mergeLetterParams(LETTER_PRESETS.find((p) => p.id === preset)?.params ?? {}) as unknown as Record<string, unknown>;
  if (product === "parametric") return mergeParametricParams(PARAMETRIC_PRESETS.find((p) => p.id === preset)?.params ?? {}) as unknown as Record<string, unknown>;
  return {};
}

const ignoredNote = (keys: string[]) => (keys.length ? [`Left at their starting values (not available or out of range): ${[...new Set(keys)].slice(0, 6).join(", ")}.`] : []);

async function buildDesktopProduct(id: DesktopProductId, preset: string | null, changes: { key: string; value: unknown }[], name: string, plan: Plan, from?: Record<string, unknown>) {
  const { params, skipped } = await designFromChanges(id, preset, changes, from);
  const res = await generateDesign({ product: id, params: { ...params, name }, autofix: true }, plan);
  const body = res.body as Partial<GenerateResponse> & { error?: string };
  return {
    params: body.params ?? { ...params, name },
    summary: body.summary ?? "",
    skipped,
    applied: body.applied ?? [],
    svg: body.svg, width: body.width, height: body.height,
    locked: body.locked?.replace(" in the desktop app", ""),
    error: body.svg ? undefined : body.error, stats: body.stats,
  };
}

function buildLetters(preset: string | null, changes: { key: string; value: unknown }[], name: string, from?: Record<string, unknown>) {
  let p = (from ? mergeLetterParams(from as Partial<LetterParams>) : startParams("letters", preset)) as unknown as LetterParams;
  const skipped: string[] = [];
  for (const c of changes) {
    const f = LETTER_FIELDS.find((x) => x.key === c.key);
    const v = f ? coerce(f, c.value) : { error: "" };
    if ("error" in v) { skipped.push(c.key); continue; }
    if (c.key === "material") {
      const m = MATERIALS[v.v as string];
      p = { ...p, material: v.v as string, ...(m && m.T != null && m.K != null ? { T: m.T, K: m.K } : {}) };
    } else {
      p = { ...p, [c.key]: v.v } as LetterParams;
    }
  }
  const checked = parseLetterRequest({ ...p, name });
  if ("error" in checked) return { params: { ...p, name } as unknown as Record<string, unknown>, summary: "", skipped, error: checked.error };
  const kind = checked.mode === "box" ? "Letter box" : checked.mode === "solid" ? "Solid letters" : "Stencil";
  return { params: checked as unknown as Record<string, unknown>, summary: `${kind} · "${checked.text}" · ${checked.size} mm`, skipped };
}

const LETTER_KEYS = [...LETTER_FIELDS.map((f) => f.key), "T", "K"];

/** The short website link to a Letters or Parametric design; a long name is cut to fit. */
function openLink(product: "letters" | "parametric", preset: string | null, name: string, params: Record<string, unknown>): string | undefined {
  const start = startParams(product, preset);
  const chosen = product === "letters" ? Object.fromEntries(LETTER_KEYS.filter((k) => params[k] !== undefined && params[k] !== start[k]).map((k) => [k, params[k]])) : {};
  for (const n of [name, name.slice(0, 24), ""]) {
    const open: AIOpen = { product, preset, name: n, params: chosen };
    const path = AI_OPEN_PREFIX + Buffer.from(JSON.stringify(open)).toString("base64url");
    if (path.length <= MAX_OPEN_PATH) return path;
  }
  return undefined;
}

function buildParametric(preset: string | null, name: string) {
  const pr = PARAMETRIC_PRESETS.find((p) => p.id === preset) ?? PARAMETRIC_PRESETS[0];
  const p = mergeParametricParams({ ...pr.params, name });
  const error = parametricRequestError(p) ?? undefined;
  return { params: p as unknown as Record<string, unknown>, summary: `${pr.name} · ${pr.note}`, style: pr.name, skipped: [], error, preset: pr.id };
}

/** Runs an original design job with its own, longer time limit (drawing, then looking at the drawing). */
async function withArt(model: LanguageModel | undefined, userId: string, job: (o: ArtOptions) => Promise<AIDesign>): Promise<AIDesign> {
  const deadline = Date.now() + ART_TIMEOUT_MS;
  const ask: Ask = { model, userId, signal: AbortSignal.timeout(ART_TIMEOUT_MS) };
  try {
    return await job({ deadline, ask: (system, content, schema, reasoning) => askModel(ask, system, content, schema, reasoning) });
  } catch (e) {
    if (e instanceof AIDesignError) throw e;
    console.error("ai design: art failed", e);
    throw new AIDesignError("The design could not be drawn. Try again or describe it differently.");
  }
}

/** What the design being edited makes now (summary and sizes), so an edit can scale from it. */
async function currentResult(rev: AIRevise, plan: Plan): Promise<string> {
  try {
    if (rev.product === "letters") return buildLetters(rev.preset, [], rev.name, rev.params).summary;
    if (rev.product === "parametric") return "";
    const r = await buildDesktopProduct(rev.product as DesktopProductId, rev.preset, [], rev.name, plan, rev.params);
    return [r.summary, ...(r.stats ?? []).map((s) => `${s.label} ${s.value}`)].filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

/** Designs one product from a description and/or photo, on the caller's plan. */
export interface DesignOptions {
  photoRelief?: boolean;
  /** Examples from the shop's library that fit the request, shown with a new original drawing. */
  examples?: (query: string) => Promise<UserContent | undefined>;
}

export async function designWithAI(req: AIDesignRequest, plan: Plan, userId: string, model?: LanguageModel, opts: DesignOptions = {}): Promise<AIDesign> {
  const menu = await aiMenu();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const ask: Ask = { model, userId, signal };
  const rev = req.revise;
  if (rev?.product === "art") {
    const current = artSchema.safeParse((rev.params as { art?: unknown }).art);
    if (!current.success) throw new AIDesignError("This design cannot be edited. Start over and try again.");
    return withArt(model, userId, async (o) => artDesign(await editArt(current.data, req.prompt, o), plan, rev.match));
  }
  const revising = rev ? menu.find((p) => p.id === rev.product) : undefined;
  if (rev && !revising) throw new AIDesignError("This design cannot be edited here. Start over and try again.");
  /** Settings the design starts from when one is being edited. */
  const from = rev && revising?.fields.length ? rev.params : undefined;
  let choice: z.infer<typeof pickSchema>;
  if (rev && from) {
    const now = await currentResult(rev, plan);
    choice = {
      product: rev.product, preset: rev.preset ?? "", name: rev.name, match: rev.match, flat: false,
      brief: `Edit the current design. Change only this and keep everything else as it is: ${req.prompt}\n${now ? `The current result: ${now}.\n` : ""}A size asked for here must be the size of the result: work out the settings that give it from the current values and the current result, and switch off any setting that fits or sizes it automatically and would change that size.`,
    };
  } else {
    try {
      // A sculpture has no settings to edit, so an edit picks its style again from the request.
      const current = rev ? `Current design: "${rev.name}", preset ${rev.preset ?? "none"}. Pick the preset that best fits the design with this change.` : undefined;
      choice = await pick(current ? { prompt: `${req.prompt}\n\n${current}` } : req, revising ? [revising] : pickMenu(menu), ask);
    } catch (e) {
      console.error("ai design: pick failed", e);
      throw new AIDesignError("The AI designer could not read the request. Try again or describe it differently.");
    }
    if (rev) choice = { ...choice, name: rev.name || choice.name, match: rev.match };
    else if (isFlat(choice.product, choice.preset) || choice.match !== "exact" || (choice.flat && !FLAT_OK.has(choice.product))) choice = { ...choice, product: "art", preset: "", match: "exact" };
  }
  const product = revising ?? menu.find((p) => p.id === choice.product) ?? menu[0];
  if (product.id === "art") {
    return withArt(model, userId, async (o) => {
      const query = [req.prompt, req.image ? req.imageNote : "", choice.name, choice.brief].filter(Boolean).join("\n");
      const examples = opts.examples ? await opts.examples(query).catch(() => undefined) : undefined;
      const b = await drawArt(userContent(req, `Name: ${choice.name}\nBrief: ${choice.brief}`), o, examples);
      return artDesign(b, plan, choice.match);
    });
  }
  const preset = product.presets.some((p) => p.id === choice.preset) ? choice.preset : null;
  let name = cleanName(choice.name, product.name);

  let changes: { key: string; value: unknown }[] = [];
  let notes: string[] = [];
  if (product.fields.length) {
    try {
      const start = product.id === "letters"
        ? (from ? mergeLetterParams(from as Partial<LetterParams>) as unknown as Record<string, unknown> : startParams("letters", preset))
        : (await designFromChanges(product.id as DesktopProductId, preset, [], from)).params;
      const out = await settings(req, product, choice.brief, start, ask, from ? name : undefined);
      if (out.name.trim()) name = cleanName(out.name, name);
      changes = out.settings.slice(0, 60).map((s) => ({ key: s.key, value: valueOf(s.value, product.fields.find((f) => f.key === s.key)) }));
      notes = out.notes.slice(0, 2).map((n) => n.slice(0, 240));
    } catch (e) {
      console.error("ai design: settings failed", e);
      notes = [from ? "The change could not be made, so the design is as it was. Try saying it differently." : "The settings could not be filled in, so the design keeps the preset's values."];
    }
  }

  const base = { product: product.id, productName: product.name, name, match: choice.match } as const;
  if (product.id === "parametric") {
    const r = buildParametric(preset, name);
    const open = openLink("parametric", r.preset, name, r.params);
    const photo = opts.photoRelief && req.image;
    const summary = photo ? `Your photo as a relief, built like the "${r.style}" design` : r.summary;
    const extra = photo
      ? ["Your photo becomes the relief: the editor reads its depth when the design opens, which takes a few seconds."]
      : preset ? [] : ["No preset matched closely, so the first sculpture preset was used."];
    return { ...base, preset: r.preset, params: r.params, summary, notes: [...notes, ...extra], ...(r.error ? { error: r.error } : {}), ...(open ? { open } : {}) };
  }
  if (product.id === "letters") {
    const r = buildLetters(preset, changes, name, from);
    const open = r.error ? undefined : openLink("letters", preset, name, r.params);
    return { ...base, preset, params: r.params, summary: r.summary, notes: [...notes, ...ignoredNote(r.skipped)], ...(r.error ? { error: r.error } : {}), ...(open ? { open } : {}) };
  }
  const r = await buildDesktopProduct(product.id as DesktopProductId, preset, changes, name, plan, from);
  const fixed = r.applied.length ? [`Fixed automatically: ${r.applied.slice(0, 4).join("; ")}.`] : [];
  return {
    ...base, preset, params: r.params, summary: r.summary, notes: [...notes, ...ignoredNote(r.skipped), ...fixed],
    ...(r.svg ? { svg: r.svg, width: r.width, height: r.height } : {}),
    ...(r.locked ? { locked: r.locked } : {}), ...(r.error ? { error: r.error } : {}), ...(r.stats?.length ? { stats: r.stats } : {}),
  };
}
