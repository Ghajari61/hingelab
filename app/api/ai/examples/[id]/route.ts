import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { deleteExample, isCurator, UUID } from "@/lib/ai/examples";
import { isCrossSite, siteOrigins } from "@/lib/security/request";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** Removes an example and its files (curators only). */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  const { id } = await params;
  const session = await getUser();
  if (!session || !(await isCurator(session.user.id)) || !UUID.test(id)) return json({ error: "Not found." }, 404);
  try {
    return (await deleteExample(session.user.id, id)) ? json({ ok: true }) : json({ error: "Not found." }, 404);
  } catch (e) {
    console.error("ai examples: delete failed", e);
    return json({ error: "The example could not be removed. Try again." }, 500);
  }
}
