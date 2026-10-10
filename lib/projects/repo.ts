/**
 * Project queries. Every function takes a Supabase client acting as the user, so Row Level
 * Security decides what is visible; nothing here bypasses it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, ProductId, ProjectRow } from "@/lib/supabase/types";
import { defaultParams, ENGINE_VERSION, MAX_PARAMS_BYTES, projectName } from "./index";

type DB = SupabaseClient<Database>;

export type ProjectSummary = Pick<ProjectRow, "id" | "name" | "product" | "thumbnail_svg" | "updated_at">;

export class ProjectError extends Error {}

function checkParams(params: unknown): asserts params is Record<string, unknown> {
  if (!params || typeof params !== "object" || Array.isArray(params)) throw new ProjectError("That is not a project.");
  if (JSON.stringify(params).length > MAX_PARAMS_BYTES) throw new ProjectError("That project is too large.");
}

/** Database errors raised by our own triggers carry a readable message (plan limits, Phase 4). */
function fail(error: { message: string; code?: string } | null, fallback: string): never {
  if (error?.code === "P0001") throw new ProjectError(error.message);
  throw new ProjectError(fallback);
}

export async function listProjects(db: DB): Promise<ProjectSummary[]> {
  const { data, error } = await db
    .from("projects")
    .select("id, name, product, thumbnail_svg, updated_at")
    .order("updated_at", { ascending: false });
  if (error) fail(error, "Could not load your projects.");
  return data ?? [];
}

export async function getProject(db: DB, id: string): Promise<ProjectRow | null> {
  const { data, error } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) return null;
  return data;
}

export async function createProject(
  db: DB,
  product: ProductId,
  params?: unknown,
  thumbnail?: string | null,
): Promise<ProjectRow> {
  const p = params ?? defaultParams(product);
  checkParams(p);
  const { data, error } = await db
    .from("projects")
    .insert({ product, params: p as Json, name: projectName(p, product), thumbnail_svg: thumbnail ?? null, engine_version: ENGINE_VERSION })
    .select("*")
    .single();
  if (error || !data) fail(error, "Could not create the project.");
  return data;
}

/** Saves the editor state; the name column follows params.name. Returns the server's updated_at. */
export async function saveProject(db: DB, id: string, product: ProductId, params: unknown, thumbnail?: string | null): Promise<string> {
  checkParams(params);
  const patch: Database["public"]["Tables"]["projects"]["Update"] = { params: params as Json, name: projectName(params, product) };
  if (thumbnail !== undefined) patch.thumbnail_svg = thumbnail;
  const { data, error } = await db.from("projects").update(patch).eq("id", id).select("updated_at").single();
  if (error || !data) fail(error, "Could not save to the cloud.");
  return data.updated_at ?? new Date().toISOString();
}

export async function renameProject(db: DB, id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 200);
  if (!clean) throw new ProjectError("Enter a name.");
  const current = await getProject(db, id);
  if (!current) throw new ProjectError("That project no longer exists.");
  const params = { ...(current.params as Record<string, unknown>), name: clean };
  const { error } = await db.from("projects").update({ name: clean, params: params as Json }).eq("id", id);
  if (error) fail(error, "Could not rename the project.");
}

export async function duplicateProject(db: DB, id: string): Promise<ProjectRow> {
  const src = await getProject(db, id);
  if (!src) throw new ProjectError("That project no longer exists.");
  const name = `${src.name} copy`.slice(0, 200);
  const params = { ...(src.params as Record<string, unknown>), name };
  return createProject(db, src.product, params, src.thumbnail_svg);
}

export async function deleteProject(db: DB, id: string): Promise<void> {
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) fail(error, "Could not delete the project.");
}
