"use client";

import { createProjectAction, importProjectAction } from "@/app/app/actions";
import type { ProductId } from "@/lib/supabase/types";

/** Creates a cloud project and opens it. Returns an error message, or null when navigating away. */
export async function openNewCloudProject(product: ProductId, params?: unknown): Promise<string | null> {
  const r = await createProjectAction(product, params);
  if (!r.ok) return r.error;
  window.location.assign(`/app/editor/${r.id}`);
  return null;
}

/** File → Open project in a cloud project: the file becomes a new cloud project. */
export async function importIntoCloud(text: string): Promise<string | null> {
  const r = await importProjectAction(text);
  if (!r.ok) return r.error;
  window.location.assign(`/app/editor/${r.id}`);
  return null;
}
