"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/supabase/server";
import { isProduct, parseProjectFile } from "@/lib/projects";
import * as repo from "@/lib/projects/repo";
import { copyModelFile, deleteProjectFiles } from "@/lib/projects/files";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(fn: (db: NonNullable<Awaited<ReturnType<typeof getUser>>>["supabase"]) => Promise<T>): Promise<ActionResult<T>> {
  const session = await getUser();
  if (!session) return { ok: false, error: "Sign in to use cloud projects." };
  try {
    const out = await fn(session.supabase);
    revalidatePath("/app");
    return { ok: true, ...out };
  } catch (e) {
    return { ok: false, error: e instanceof repo.ProjectError ? e.message : "Something went wrong. Try again." };
  }
}

export async function createProjectAction(product: string, params?: unknown): Promise<ActionResult<{ id: string }>> {
  if (!isProduct(product)) return { ok: false, error: "Unknown product." };
  return run(async (db) => ({ id: (await repo.createProject(db, product, params)).id }));
}

/** File → Open project: a downloaded .hingelab.json becomes a new cloud project. */
export async function importProjectAction(text: string): Promise<ActionResult<{ id: string }>> {
  if (typeof text !== "string" || text.length > 1024 * 1024) return { ok: false, error: "That file is not a HingeLab project" };
  const parsed = parseProjectFile(text);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  return run(async (db) => ({ id: (await repo.createProject(db, parsed.product, parsed.params)).id }));
}

export async function duplicateProjectAction(id: string): Promise<ActionResult<{ id: string }>> {
  return run(async (db) => {
    const row = await repo.duplicateProject(db, id);
    const params = row.params as { source?: { fileId?: unknown } } | null;
    const from = params?.source?.fileId;
    if (row.product === "parametric" && typeof from === "string") {
      const fileId = await copyModelFile(db, from, row.user_id, row.id).catch(() => null);
      if (fileId) await repo.saveProject(db, row.id, row.product, { ...params, source: { ...params!.source, fileId } });
    }
    return { id: row.id };
  });
}

export async function renameProjectAction(id: string, name: string): Promise<ActionResult> {
  return run(async (db) => {
    await repo.renameProject(db, id, name);
    return {};
  });
}

export async function deleteProjectAction(id: string): Promise<ActionResult> {
  return run(async (db) => {
    const project = await repo.getProject(db, id);
    await repo.deleteProject(db, id);
    if (project?.product === "parametric") await deleteProjectFiles(db, project.user_id, id).catch(() => 0);
    return {};
  });
}
