import "server-only";
/**
 * Original laser artwork, drawn by the model from scratch rather than from a product's presets.
 * The model writes closed paths in millimetres on three layers and text boxes; the server turns the
 * text into outlines with the bundled fonts, renders the drawing and shows the model its own picture
 * so it can fix what it sees, then checks the file (closed cuts, size) before handing it over.
 */
import { Resvg } from "@resvg/resvg-js";
import type { UserContent } from "ai";
import { z } from "zod";
import { bundledFont, serverHarfBuzz } from "@/lib/billing/letterFonts";
import { BUNDLED_FONTS, fontInfo } from "@/lib/letters/fonts";
import { shapeContours, unionShapes } from "@/lib/letters/polygon";
import { shapeText } from "@/lib/letters/shape";
import { addWatermark, needsWatermark, type Plan } from "@/lib/plans";
import { escapeXml, inertSvgMarkup } from "@/lib/security/svg";
import { importSvg, parsePathData } from "@/lib/studio/svgImport";
import type { AIDesign, AIMatch } from "./types";

/** LightBurn's first layers: C00 black fill engraves, C01 blue scores, C02 red cuts. */
export const ART_COLORS = { engrave: "#000000", score: "#0000FF", cut: "#FF0000" } as const;
type Layer = keyof typeof ART_COLORS;
const LAYERS = ["cut", "score", "engrave"] as const;

const FONT_IDS = BUNDLED_FONTS.map((f) => f.id) as [string, ...string[]];
const PERSIAN_FONT = "vazirmatn";

const MAX_SHAPES = 400;
const MAX_PATH_CHARS = 150_000;
const MIN_SIZE = 10;
const MAX_SIZE = 1200;

export const artSchema = z.object({
  name: z.string().describe("A short English name for the design."),
  summary: z.string().describe("One sentence for the user: what it is, its size and how it is made."),
  width: z.number().describe("Artboard width in mm; everything is drawn inside 0..width."),
  height: z.number().describe("Artboard height in mm; everything is drawn inside 0..height."),
  material: z.string().describe("Material and thickness, e.g. \"3 mm birch plywood\"."),
  thickness: z.number().describe("Material thickness in mm, used for slots and bridges."),
  shapes: z.array(z.object({
    layer: z.enum(LAYERS),
    d: z.string().describe("SVG path data in mm, closed with Z for cut and engrave."),
  })).describe("Every drawn shape: outlines, holes, pictures, patterns. Not letters."),
  texts: z.array(z.object({
    text: z.string(),
    font: z.enum(FONT_IDS),
    cx: z.number().describe("Centre x of the text, mm."),
    cy: z.number().describe("Centre y of the text, mm."),
    height: z.number().describe("Height of the text from its highest to its lowest point, mm."),
    maxWidth: z.number().describe("The text is made narrower to fit this width, mm."),
    layer: z.enum(LAYERS),
  })).describe("Words on the design; the app turns them into outlines in the font."),
  notes: z.array(z.string()).describe("At most two short plain English sentences for the user about what to check (usually none)."),
});
export type Art = z.infer<typeof artSchema>;

const reviewSchema = artSchema.extend({
  looksRight: z.boolean().describe("True when the drawing was already right and is returned unchanged."),
  problems: z.array(z.string()).describe("What you fixed, in short phrases."),
});

const fontList = BUNDLED_FONTS.map((f) => `- ${f.id}: ${f.name}, ${f.scripts.join(" + ")} (${f.note})`).join("\n");

/** What the model knows about making laser files; shared by drawing, reviewing and editing. */
const HANDBOOK = `Units are millimetres, origin top-left, y down. The artboard is the size of the finished piece (or of all pieces laid out side by side). Name, summary and notes are in English whatever the language of the request; words on the design keep their language and script.

Layers:
- cut (red line): the laser cuts through. Every part's outer outline is one closed path; holes and cut-outs are closed paths inside it, and everything inside a closed cut falls out. So a border line, frame or decorative outline on a part is never cut: it is score or an engraved band.
- engrave (black fill): filled areas burned into the surface: pictures, patterns, text. All engrave shapes and engraved text are filled together even-odd, as the laser software does: anything inside a filled engrave shape (text, a picture) becomes an unburned hole in it, and two overlapping shapes leave their overlap unburned. A frame or border is a band: two closed paths, the outer edge and the inner edge. Never put a big filled shape behind other engraving unless you want them knocked out of it; most of the piece should stay unburned.
- score (blue line): thin lines marked on the surface: fine details, outlines, borders, guide lines. Prefer score for line art and thin borders.

Making it real:
- Everything cut must stay in one piece unless it is meant to be separate. Bridges and thin necks at least 2 × the thickness (6 mm in 3 mm plywood); gaps between two cuts at least 1.5 × the thickness; holes at least 2.5 mm.
- Cut-out letters in a board lose their inner parts (O, A, R, ...): engrave text, use a stencil style with bridges, or make free-standing letters touch and overlap each other or a base bar so the word is one piece.
- Interlocking parts (stands, trophies, 3D assemblies): slot width = thickness, slot depth = half the height where two parts cross; tabs as deep as the thickness. Lay separate parts side by side on the artboard, 5 mm apart, never overlapping, and make sure they really fit together and stand.
- Hanging: holes 4-5 mm across, at least 6 mm from the edge, or a keyhole.
- Engraved details at least 0.6 mm wide, and 3 mm inside the cut outline.
- Real sizes: keychain 40-60 mm, coaster 90-100 mm, ornament 70-100 mm, phone stand base about 80 × 100 mm for 3 mm material, desk sign 150-250 mm wide, wall art 300-600 mm.

Design quality:
- Design something a shop would be proud to sell, never a plain rectangle with words. A clear idea, a strong silhouette that reads from a distance, balanced composition, generous negative space, 1-3 focal elements, consistent line weight, details that read at real size, typography that fits the theme.
- Draw with smooth curves (C, S, Q and A commands): organic shapes, flourishes, leaves, waves, borders, frames. Use symmetry where it suits (mandalas, ornaments, frames).
- A photo shows what the user wants: keep its idea, layout and style, simplified for the laser.

Paths: SVG path data (M L H V C S Q T A Z), numbers with at most 2 decimals, each closed shape its own subpath, every cut and engrave subpath closed with Z, everything inside the artboard.
Notes: at most two short plain sentences for the user, only about something they should check (a guessed size, the material). Never about fonts, kerf, machine settings or what was fixed. Usually none.

Text: never draw letters as paths; put words in texts. The app turns texts into outlines in the font, so the file needs no fonts. Words in other scripts need a font that covers them. Fonts:
${fontList}`;

const DRAW_SYSTEM = `You are a senior laser-cut product designer and illustrator. You design original, attractive, production-ready laser cut and engrave files from scratch, never generic clip art or template layouts.
Study the request and any photo before you draw. A plain rectangle, rounded rectangle or circle with text on it is a failed design: redraw it. The outline itself must be the idea (arch, banner, badge, scallop, leaf, crest or ornament), with the motif drawn as smooth curves and the words in texts.
A photo or a description of a specific picture is the design. Reproduce its layout: many separate closed curves for leaves, petals, veins, branches and cut-outs, not one plain disc or ring that stands in for them. Keep the working parts too: a clock needs a centre hole about 8 mm and its hands as separate parts; a sign keeps its words in texts. Every group of shapes named in the brief must appear. Simplify only enough to cut, and do not drop a whole group of shapes you can see. The result should be something a shop would sell.

${HANDBOOK}`;

const REVIEW_SYSTEM = `You check and improve a laser design you drew. The picture shows it rendered on the sheet: red lines are cuts, blue lines scores, black areas engraving.

${HANDBOOK}

Look closely at the picture and the request, including any photo of the object. Measured problems given with the picture are real and must be fixed. A plain disc, ring or rectangle where the request shows leaves, flowers or another ornament is not done: draw those shapes. If the request names several groups of shapes and the drawing has only a handful of simple outlines, it is not done. Fix every problem: anything that would fall apart or fall out when cut, open or crossing outlines, parts that overlap, cut text with loose inner parts, details too small or too close, elements outside the outline or the artboard, text that overflows or is hard to read, an unbalanced or empty layout, or a design that does not look like what was asked or is not attractive enough to sell. Return the whole design (all shapes and texts). If it is already right, return it unchanged with looksRight true.`;

const EDIT_SYSTEM = `You change a laser design you drew, as the user asks. The picture shows it rendered on the sheet: red lines are cuts, blue lines scores, black areas engraving. Its full description is in the request.

${HANDBOOK}

Change what the user asks and keep the rest of the design as it is. A size asked for is the size of the result. Return the whole design (all shapes and texts).`;

/** Asks the model for an object of the schema; the caller decides the model, route and time limit. */
export type ArtAsk = <T>(system: string, content: UserContent, schema: z.ZodType<T>, reasoning?: "low" | "medium") => Promise<T>;

const round = (n: number) => Math.round(n * 100) / 100;
const PATH_CHARS = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/;

/** The model's answer made safe: known layers, valid path data, sane sizes and counts. */
export function cleanArt(a: Art): Art {
  let budget = MAX_PATH_CHARS;
  const shapes = a.shapes.slice(0, MAX_SHAPES).filter((s) => {
    const d = s.d.trim();
    if (!d || d.length > budget || !PATH_CHARS.test(d)) return false;
    try { if (!parsePathData(d).length) return false; } catch { return false; }
    budget -= d.length;
    return true;
  }).map((s) => ({ layer: s.layer, d: s.d.trim() }));
  const texts = a.texts.slice(0, 24)
    .map((t) => ({ ...t, text: t.text.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120) }))
    .filter((t) => t.text && t.height > 0.5 && Number.isFinite(t.cx) && Number.isFinite(t.cy));
  const size = (n: number) => round(Math.min(MAX_SIZE, Math.max(MIN_SIZE, Number.isFinite(n) ? n : 100)));
  return {
    name: a.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80) || "Laser design",
    summary: a.summary.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300),
    width: size(a.width), height: size(a.height),
    material: a.material.trim().slice(0, 60) || "3 mm plywood",
    thickness: Math.min(20, Math.max(0.5, Number.isFinite(a.thickness) ? a.thickness : 3)),
    shapes, texts,
    notes: a.notes.slice(0, 2).map((n) => n.trim().slice(0, 240)).filter(Boolean),
  };
}

const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/u;

/** The texts as closed outlines in mm, centred on their boxes and narrowed to their widths. */
async function textShapes(texts: Art["texts"]): Promise<{ shapes: { layer: Layer; d: string }[]; lost: string[] }> {
  const out: { layer: Layer; d: string }[] = [];
  const lost: string[] = [];
  if (!texts.length) return { shapes: out, lost };
  const hb = await serverHarfBuzz();
  for (const t of texts) {
    const info = fontInfo(t.font);
    const id = ARABIC.test(t.text) && !info?.scripts.includes("arabic") ? PERSIAN_FONT : info ? t.font : "fredoka";
    const font = await bundledFont(hb, id);
    const shaped = font ? shapeText(hb, font, t.text, { direction: "auto", size: t.height, sizeMode: "totalHeight", letterSpacing: 0 }) : null;
    // Joined and script letters overlap; merged, so the even-odd engraving leaves no seams.
    const contours = shaped ? shapeContours(unionShapes(shaped.glyphs.flatMap((g) => g.contours).filter((c) => c.length > 2))) : [];
    if (!contours.length) { lost.push(t.text); continue; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of contours) for (const [x, y] of c) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const s = t.maxWidth > 0 && x1 - x0 > t.maxWidth ? t.maxWidth / (x1 - x0) : 1;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const d = contours.map((c) => c.map(([x, y], i) => `${i ? "L" : "M"}${round(t.cx + (x - mx) * s)} ${round(t.cy + (y - my) * s)}`).join("") + "Z").join("");
    out.push({ layer: t.layer, d });
  }
  return { shapes: out, lost };
}

export type ArtShape = { layer: Layer; d: string };
export type ArtBox = { x: number; y: number; w: number; h: number };

/** The finished SVG; `preview` draws thicker lines so a small picture still shows the cuts. */
export function svgOf(a: Pick<Art, "name" | "material">, all: ArtShape[], box: ArtBox, preview = false): string {
  const line = preview ? round(Math.max(0.3, Math.max(box.w, box.h) / 300)) : 0.1;
  const group = (layer: Layer) => {
    const mine = all.filter((s) => s.layer === layer);
    if (!mine.length) return "";
    // LightBurn fills a layer's shapes together, even-odd, so the engraving is one path here as well.
    const paths = layer === "engrave" ? `<path d="${mine.map((s) => s.d).join(" ")}"/>` : mine.map((s) => `<path d="${s.d}"/>`).join("");
    const paint = layer === "engrave" ? `fill="${ART_COLORS.engrave}" fill-rule="evenodd" stroke="none"` : `fill="none" stroke="${ART_COLORS[layer]}" stroke-width="${line}" stroke-linejoin="round"`;
    return `<g id="${layer}" ${paint}>${paths}</g>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(box.w)}mm" height="${round(box.h)}mm" viewBox="${round(box.x)} ${round(box.y)} ${round(box.w)} ${round(box.h)}">`
    + `<title>${escapeXml(a.name)}</title><desc>${escapeXml(`HingeLab AI design. ${a.material}. Red cuts, blue scores, black engraves; cut the inner shapes before the outlines.`)}</desc>`
    + group("engrave") + group("score") + group("cut") + "</svg>";
}

export interface BuiltArt {
  art: Art;
  svg: string;
  preview: string;
  /** Every shape in the file, the texts as outlines, and the artboard they are drawn on. */
  shapes: ArtShape[];
  box: ArtBox;
  width: number;
  height: number;
  cuts: number;
  openCuts: number;
  /** Something was drawn outside the artboard, which grew to fit it. */
  outside: boolean;
  /** Texts the fonts could not draw. */
  lostTexts: string[];
  /** Large closed cuts inside a part with engraving inside them, which would fall out with it. */
  dropOuts: number;
}

type BBox = { x0: number; y0: number; x1: number; y1: number };

function subBoxes(d: string): BBox[] {
  return parsePathData(d).map((s) => {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const n of s.nodes) { b.x0 = Math.min(b.x0, n.x); b.y0 = Math.min(b.y0, n.y); b.x1 = Math.max(b.x1, n.x); b.y1 = Math.max(b.y1, n.y); }
    return b;
  }).filter((b) => Number.isFinite(b.x0));
}

const area = (b: BBox) => (b.x1 - b.x0) * (b.y1 - b.y0);
const within = (a: BBox, b: BBox) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1 && area(a) < area(b);

/** Counts closed cuts that take a large part of a part's area out together with engraving inside them (a frame drawn as a cut). */
function countDropOuts(all: { layer: Layer; d: string }[]): number {
  const cuts = all.filter((s) => s.layer === "cut").flatMap((s) => subBoxes(s.d));
  const marks = all.filter((s) => s.layer !== "cut").flatMap((s) => subBoxes(s.d));
  return cuts.filter((h) => {
    const parent = cuts.find((p) => p !== h && within(h, p));
    if (!parent || area(h) < 0.2 * area(parent)) return false;
    return marks.some((m) => { const x = (m.x0 + m.x1) / 2, y = (m.y0 + m.y1) / 2; return x > h.x0 && x < h.x1 && y > h.y0 && y < h.y1; });
  }).length;
}

/** Builds the SVG of a design: text outlines, the artboard grown to fit anything drawn outside it, and its cut checks. */
export async function buildArt(a: Art): Promise<BuiltArt> {
  const text = await textShapes(a.texts);
  const all = [...a.shapes, ...text.shapes];
  const box = { x: 0, y: 0, w: a.width, h: a.height };
  const first = importSvg(svgOf(a, all, box));
  const b = first.box;
  const outside = Number.isFinite(b.minX) && (b.minX < -0.5 || b.minY < -0.5 || b.maxX > a.width + 0.5 || b.maxY > a.height + 0.5);
  if (outside) {
    box.x = Math.min(0, b.minX); box.y = Math.min(0, b.minY);
    box.w = Math.max(a.width, b.maxX) - box.x; box.h = Math.max(a.height, b.maxY) - box.y;
  }
  const svg = svgOf(a, all, box);
  if (!inertSvgMarkup(svg)) throw new Error("art svg is not inert");
  const check = importSvg(svg);
  return {
    art: a, svg, preview: svgOf(a, all, box, true), shapes: all, box, width: round(box.w), height: round(box.h),
    cuts: all.filter((s) => s.layer === "cut").reduce((n, s) => n + (s.d.match(/[Mm]/g)?.length ?? 0), 0),
    openCuts: check.openCuts,
    outside, lostTexts: text.lost, dropOuts: countDropOuts(all),
  };
}

/** The drawing as a PNG the model can look at (base64), and the share of it that is engraved. */
export function renderArt(b: BuiltArt, px = 900): { png: string; engraved: number } {
  const img = new Resvg(b.preview, { fitTo: { mode: b.width >= b.height ? "width" : "height", value: px }, background: "#ffffff" }).render();
  const p = img.pixels;
  let dark = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i] < 90 && p[i + 1] < 90 && p[i + 2] < 90) dark++;
  return { png: Buffer.from(img.asPng()).toString("base64"), engraved: dark / Math.max(1, p.length / 4) };
}

/** Measured problems the model should know about when it looks at its drawing. */
export function artFacts(b: BuiltArt, engraved: number): string[] {
  const f: string[] = [];
  if (engraved > 0.45) f.push(`Engraving covers ${Math.round(engraved * 100)}% of the sheet, which is far too much: a big filled engrave shape is probably covering the rest, so text and pictures inside it disappear.`);
  if (b.dropOuts) f.push(`${b.dropOuts} closed cut${b.dropOuts > 1 ? "s" : ""} inside a part would cut out a large piece together with the engraving or text inside it: a border or frame line on a part must be score (or an engraved band), never cut.`);
  if (b.openCuts) f.push(`${b.openCuts} cut path${b.openCuts > 1 ? "s are" : " is"} not closed.`);
  if (!b.cuts) f.push("There is no cut outline.");
  if (b.outside) f.push("Some shapes are outside the artboard.");
  if (b.lostTexts.length) f.push(`These texts could not be drawn in their font: ${b.lostTexts.join(", ")}.`);
  return f;
}

function picture(b: BuiltArt): UserContent {
  const r = renderArt(b);
  const facts = artFacts(b, r.engraved);
  return [
    { type: "text", text: `The drawing, ${b.width} × ${b.height} mm${facts.length ? `. Measured problems: ${facts.join(" ")}` : ""}` },
    { type: "file", mediaType: "image/png", data: r.png },
  ];
}

const describe = (a: Art) => `The design now (JSON): ${JSON.stringify(a)}`;

async function review(b: BuiltArt, request: UserContent, ask: ArtAsk): Promise<BuiltArt> {
  const content: UserContent = [...asParts(request), { type: "text", text: describe(b.art) }, ...asParts(picture(b))];
  const r = await ask(REVIEW_SYSTEM, content, reviewSchema);
  if (r.looksRight) return b;
  const next = await buildArt(cleanArt(r));
  return drawn(next) ? next : b;
}

const drawn = (b: BuiltArt) => b.art.shapes.length + b.art.texts.length > 0;

const asParts = (c: UserContent): Exclude<UserContent, string> => (typeof c === "string" ? [{ type: "text", text: c }] : c);

/** Time left for a review after drawing; below it the first drawing is used. */
const REVIEW_MIN_MS = 35_000;

export interface ArtOptions {
  ask: ArtAsk;
  /** When the whole job must be done, ms since epoch. */
  deadline: number;
}

/** Reviews a drawing while there is time: once, and a second time when measured problems are left. */
async function improve(b: BuiltArt, request: UserContent, o: ArtOptions): Promise<BuiltArt> {
  for (let i = 0; i < 2 && Date.now() < o.deadline - REVIEW_MIN_MS; i++) {
    if (i && !artFacts(b, renderArt(b, 300).engraved).length) break;
    try {
      const next = await review(b, request, o.ask);
      if (next === b) break;
      b = next;
    } catch (e) {
      console.error("ai art: review failed", e);
      break;
    }
  }
  return b;
}

/**
 * Draws a new design for the request (description, photo and the planner's brief), then reviews it.
 * Examples from the shop's library go only with the first drawing; the review judges the request alone.
 */
export async function drawArt(request: UserContent, o: ArtOptions, examples?: UserContent): Promise<BuiltArt> {
  const content = examples && examples.length ? [...asParts(examples), ...asParts(request)] : request;
  const first = await buildArt(cleanArt(await o.ask(DRAW_SYSTEM, content, artSchema, "medium")));
  if (!drawn(first)) throw new Error("the model drew nothing");
  return improve(first, request, o);
}

/** Changes a design as asked, then reviews it when there is time. */
export async function editArt(current: Art, change: string, o: ArtOptions): Promise<BuiltArt> {
  const now = await buildArt(cleanArt(current));
  const content: UserContent = [{ type: "text", text: `Change: ${change}` }, { type: "text", text: describe(now.art) }, ...asParts(picture(now))];
  const next = await buildArt(cleanArt(await o.ask(EDIT_SYSTEM, content, artSchema, "medium")));
  if (!drawn(next)) throw new Error("the model drew nothing");
  return improve(next, [{ type: "text", text: `Change asked for: ${change}` }], o);
}

/** The designer's answer for a drawn design. */
export function artDesign(b: BuiltArt, plan: Plan, match: AIMatch, extraNotes: string[] = []): AIDesign {
  const a = b.art;
  const notes = [...a.notes, ...extraNotes];
  if (b.openCuts) notes.push(`${b.openCuts} cut line${b.openCuts > 1 ? "s are" : " is"} not closed; check ${b.openCuts > 1 ? "them" : "it"} in Studio before cutting.`);
  if (!b.cuts) notes.push("There is no cut outline yet; add one in Studio or ask for it with Edit with AI.");
  return {
    product: "art", productName: "Original design", name: a.name, preset: null, match,
    params: { art: a }, summary: a.summary || `${b.width} × ${b.height} mm`,
    notes: notes.slice(0, 4),
    svg: needsWatermark(plan) ? addWatermark(b.svg) : b.svg, width: b.width, height: b.height,
    stats: [
      { label: "Size", value: `${Math.round(b.width)} × ${Math.round(b.height)} mm` },
      { label: "Material", value: a.material },
      { label: "Cut shapes", value: String(b.cuts) },
    ],
    fileName: `${a.name.replace(/[^\p{L}\p{N} ._-]+/gu, " ").trim().slice(0, 60) || "design"}.svg`,
  };
}
