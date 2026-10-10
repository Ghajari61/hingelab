/**
 * Files behind cloud projects (Parametric imported models and photo depth maps) in the private
 * `models` bucket, one folder per user and project: {user id}/{project id}/{unique}-{name}.
 * Storage policies allow each user only their own folder, and only Pro users can upload.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const MODELS_BUCKET = "models";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

const safeName = (name: string) => name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";

export function modelFilePath(userId: string, projectId: string, fileName: string, unique = crypto.randomUUID()): string {
  return `${userId}/${projectId}/${unique}-${safeName(fileName)}`;
}

export async function uploadModelFile(db: Client, userId: string, projectId: string, fileName: string, bytes: ArrayBuffer): Promise<string> {
  const path = modelFilePath(userId, projectId, fileName);
  const { error } = await db.storage.from(MODELS_BUCKET).upload(path, new Blob([bytes]), { contentType: "application/octet-stream", upsert: false });
  if (error) throw new Error(/row-level security|policy|403|Unauthorized/i.test(error.message) ? "Keeping models in the cloud needs Pro." : "The file could not be saved to the cloud.");
  return path;
}

export async function downloadModelFile(db: Client, path: string): Promise<ArrayBuffer> {
  const { data, error } = await db.storage.from(MODELS_BUCKET).download(path);
  if (error || !data) throw new Error("The project's file could not be loaded from the cloud.");
  return data.arrayBuffer();
}

/** Copies a file into another project's folder (Duplicate), returning the new path. */
export async function copyModelFile(db: Client, from: string, userId: string, projectId: string): Promise<string> {
  const to = modelFilePath(userId, projectId, from.split("/").pop()!.replace(/^[0-9a-f-]{36}-/, ""));
  const { error } = await db.storage.from(MODELS_BUCKET).copy(from, to);
  if (error) throw new Error("The project's file could not be copied.");
  return to;
}

/** Removes every file of a project (when the project is deleted). */
export async function deleteProjectFiles(db: Client, userId: string, projectId: string): Promise<number> {
  const folder = `${userId}/${projectId}`;
  const { data } = await db.storage.from(MODELS_BUCKET).list(folder, { limit: 1000 });
  if (!data?.length) return 0;
  const { error } = await db.storage.from(MODELS_BUCKET).remove(data.map((f) => `${folder}/${f.name}`));
  return error ? 0 : data.length;
}
