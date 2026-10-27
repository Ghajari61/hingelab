"use server";

import { revalidatePath } from "next/cache";
import { serverFlags } from "@/lib/flags";
import { cleanEntry, GALLERY_PAGE, type GalleryItem } from "@/lib/gallery";
import { isShareProduct } from "@/lib/share";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type GalleryResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const CLOSED = "The gallery is not open yet.";

export async function publishDesignAction(raw: unknown): Promise<GalleryResult<{ id: string }>> {
  if (!serverFlags().has("gallery")) return { ok: false, error: CLOSED };
  const entry = cleanEntry(raw, isShareProduct);
  if ("error" in entry) return { ok: false, error: entry.error };
  const session = await getUser();
  if (!session) return { ok: false, error: "Sign in to publish to the gallery." };
  // Published only through here, after the flag and `cleanEntry`: users have no insert policy of their
  // own (migration 20261026000100), so the row goes in with the service role for the signed-in user.
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return { ok: false, error: "Could not publish the design. Try again." }; }
  const { data, error } = await admin
    .from("gallery_designs")
    .insert({ user_id: session.user.id, product: entry.product, name: entry.name, params: entry.params as Json, thumbnail: entry.thumb })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.code === "P0001" ? error.message : "Could not publish the design. Try again." };
  revalidatePath("/gallery");
  return { ok: true, id: data.id };
}

export async function removeDesignAction(id: string): Promise<GalleryResult> {
  if (!serverFlags().has("gallery")) return { ok: false, error: CLOSED };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown design." };
  const session = await getUser();
  if (!session) return { ok: false, error: "Sign in first." };
  const { error } = await session.supabase.from("gallery_designs").delete().eq("id", id).eq("user_id", session.user.id);
  if (error) return { ok: false, error: "Could not remove the design. Try again." };
  revalidatePath("/gallery");
  return { ok: true };
}

/** One page of published designs, newest first, with each one's settings for Remix. */
export async function listGallery(page = 0): Promise<GalleryResult<{ items: (GalleryItem & { params: Record<string, unknown> })[]; more: boolean }>> {
  if (!serverFlags().has("gallery")) return { ok: false, error: CLOSED };
  const db = await createClient();
  if (!db) return { ok: false, error: CLOSED };
  const from = Math.max(0, Math.floor(page)) * GALLERY_PAGE;
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from("gallery_designs")
    .select("id, user_id, product, name, params, thumbnail, created_at")
    .eq("hidden", false)
    .order("created_at", { ascending: false })
    .range(from, from + GALLERY_PAGE);
  if (error) return { ok: false, error: "Could not load the gallery." };
  const rows = (data ?? []).filter((r) => isShareProduct(r.product) && r.params && typeof r.params === "object" && !Array.isArray(r.params));
  return {
    ok: true,
    more: rows.length > GALLERY_PAGE,
    items: rows.slice(0, GALLERY_PAGE).map((r) => ({
      id: r.id, product: r.product, name: r.name, thumbnail: r.thumbnail, created_at: r.created_at,
      mine: !!auth.user && auth.user.id === r.user_id, params: r.params as Record<string, unknown>,
    })),
  };
}
