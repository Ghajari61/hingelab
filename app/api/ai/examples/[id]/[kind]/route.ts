import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { exampleFile, isCurator, UUID } from "@/lib/ai/examples";

const TYPES = { render: "image/png", photo: "image/jpeg", svg: "image/svg+xml" } as const;

/** An example's picture of the cut file, its photo or its clean SVG (curators only). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404, headers: { "cache-control": "no-store" } });
  if (!UUID.test(id) || !(kind in TYPES)) return notFound();
  const session = await getUser();
  if (!session || !(await isCurator(session.user.id))) return notFound();
  const bytes = await exampleFile(id, kind as keyof typeof TYPES);
  if (!bytes) return notFound();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": TYPES[kind as keyof typeof TYPES],
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      ...(kind === "svg" ? { "content-disposition": `attachment; filename="example-${id.slice(0, 8)}.svg"` } : {}),
    },
  });
}
