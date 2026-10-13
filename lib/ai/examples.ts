import "server-only";
import { randomUUID } from "node:crypto";
import type { UserContent } from "ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isImageDataURL } from "@/lib/security/svg";
import { cleanExampleSvg, exampleContent, ExampleError, pickExamples, renderExample, type ExampleShown } from "./exampleFiles";
import { MAX_EXAMPLE_DESCRIPTION, MAX_EXAMPLE_SVG, MAX_EXAMPLE_TAGS, MAX_EXAMPLE_TITLE, type AIExample } from "./exampleLimits";
import { MAX_IMAGE_CHARS } from "./types";

const BUCKET = "ai-examples";
/** How long a server instance reuses the list of examples, ms. */
const LIST_TTL_MS = 5 * 60_000;
/** Examples must not hold up a design: past this the drawing starts without them, ms. */
const LOAD_TIMEOUT_MS = 6000;

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const examplePath = (id: string, kind: "render" | "photo" | "svg") =>
  `${id}/${kind === "render" ? "render.png" : kind === "photo" ? "photo.jpg" : "drawing.svg"}`;

type Row = { id: string; title: string; description: string; tags: string; width_mm: number; height_mm: number; render_path: string; svg_path: string; photo_path: string | null; created_at: string };
let cache: { at: number; rows: Row[] } | null = null;

/** Whether this user curates the example library. */
export async function isCurator(userId: string): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  try {
    const { data, error } = await createAdminClient().rpc("ai_is_curator", { p_user: userId });
    if (error) throw error;
    return data === true;
  } catch (e) {
    console.error("ai examples: curator check failed", e);
    return false;
  }
}

async function rows(fresh = false): Promise<Row[]> {
  if (!fresh && cache && Date.now() - cache.at < LIST_TTL_MS) return cache.rows;
  const { data, error } = await createAdminClient().rpc("ai_examples_list", {});
  if (error) throw error;
  cache = { at: Date.now(), rows: data ?? [] };
  return cache.rows;
}

export async function listExamples(): Promise<AIExample[]> {
  return (await rows(true)).map((r) => ({
    id: r.id, title: r.title, description: r.description, tags: r.tags, width: r.width_mm, height: r.height_mm, hasPhoto: !!r.photo_path, created: r.created_at,
  }));
}

export interface ExampleInput { title: string; description: string; tags: string; svg: string; photo: string | null }

/** Reads an upload; a message for the curator when something is wrong. */
export function parseExampleInput(text: string): ExampleInput | { error: string } {
  let o: Record<string, unknown>;
  try { o = JSON.parse(text) as Record<string, unknown>; } catch { return { error: "Send JSON." }; }
  if (!o || typeof o !== "object") return { error: "Send JSON." };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(o.title), description = str(o.description), tags = str(o.tags), svg = typeof o.svg === "string" ? o.svg : "";
  const photo = o.photo == null || o.photo === "" ? null : o.photo;
  if (!title || title.length > MAX_EXAMPLE_TITLE) return { error: `Give the example a title of up to ${MAX_EXAMPLE_TITLE} characters.` };
  if (description.length > MAX_EXAMPLE_DESCRIPTION) return { error: `Keep the description under ${MAX_EXAMPLE_DESCRIPTION} characters.` };
  if (tags.length > MAX_EXAMPLE_TAGS) return { error: `Keep the tags under ${MAX_EXAMPLE_TAGS} characters.` };
  if (!svg) return { error: "Add the cut file (SVG)." };
  if (svg.length > MAX_EXAMPLE_SVG) return { error: "The SVG is too large (2.5 MB at most)." };
  if (photo !== null && (!isImageDataURL(photo) || !photo.startsWith("data:image/jpeg;") || photo.length > MAX_IMAGE_CHARS)) return { error: "The photo must be a JPEG under 1 MB." };
  return { title, description, tags, svg, photo: photo as string | null };
}

/** Stores a new example (clean drawing, its picture and the photo) and returns its id and import warnings. */
export async function addExample(userId: string, input: ExampleInput): Promise<{ id: string; warnings: string[] }> {
  const clean = cleanExampleSvg(input.svg, input.title);
  const png = renderExample(clean.svg, clean.width, clean.height);
  const id = randomUUID();
  const db = createAdminClient();
  const store = db.storage.from(BUCKET);
  const files: [string, Buffer, string][] = [
    [examplePath(id, "render"), png, "image/png"],
    [examplePath(id, "svg"), Buffer.from(clean.svg, "utf8"), "image/svg+xml"],
  ];
  if (input.photo) files.push([examplePath(id, "photo"), Buffer.from(input.photo.slice(input.photo.indexOf(",") + 1), "base64"), "image/jpeg"]);
  const done: string[] = [];
  try {
    for (const [path, bytes, type] of files) {
      const { error } = await store.upload(path, bytes, { contentType: type, upsert: false });
      if (error) throw error;
      done.push(path);
    }
    const { error } = await db.rpc("ai_example_add", {
      p_user: userId, p_id: id, p_title: input.title, p_description: input.description, p_tags: input.tags,
      p_width: clean.width, p_height: clean.height, p_render_path: examplePath(id, "render"), p_svg_path: examplePath(id, "svg"),
      p_photo_path: input.photo ? examplePath(id, "photo") : null,
    });
    if (error) throw error;
  } catch (e) {
    if (done.length) await store.remove(done);
    throw e;
  }
  cache = null;
  return { id, warnings: clean.warnings };
}

export async function deleteExample(userId: string, id: string): Promise<boolean> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("ai_example_delete", { p_user: userId, p_id: id });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return false;
  await db.storage.from(BUCKET).remove([row.render_path, row.svg_path, ...(row.photo_path ? [row.photo_path] : [])]);
  cache = null;
  return true;
}

/** One stored file of an example, or null when it does not exist. */
export async function exampleFile(id: string, kind: "render" | "photo" | "svg"): Promise<Buffer | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).download(examplePath(id, kind));
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function shown(r: Row): Promise<ExampleShown | null> {
  const [render, photo] = await Promise.all([exampleFile(r.id, "render"), r.photo_path ? exampleFile(r.id, "photo") : Promise.resolve(null)]);
  if (!render) return null;
  return { title: r.title, description: r.description, width: r.width_mm, height: r.height_mm, render: render.toString("base64"), ...(photo ? { photo: photo.toString("base64") } : {}) };
}

/** Up to two examples that fit the request, as message parts; none when nothing fits or the library cannot be reached in time. */
export async function examplesFor(query: string): Promise<UserContent | undefined> {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return undefined;
  const load = async () => {
    const picked = pickExamples(await rows(), query);
    if (!picked.length) return undefined;
    const list = (await Promise.all(picked.map(shown))).filter((x): x is ExampleShown => !!x);
    return list.length ? exampleContent(list) : undefined;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([load(), new Promise<undefined>((res) => { timer = setTimeout(() => res(undefined), LOAD_TIMEOUT_MS); })]);
  } catch (e) {
    console.error("ai examples: loading failed", e);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export { ExampleError };
