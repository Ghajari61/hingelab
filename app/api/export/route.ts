import { NextResponse, type NextRequest } from "next/server";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { currentPlan } from "@/lib/billing/plan";

/**
 * Hinge Box SVG export with the caller's plan applied on the server: Free gets the
 * "Made with HingeLab" mark and cannot export Pro shapes or patterns.
 */
export async function POST(request: NextRequest) {
  let body: { params?: unknown };
  try {
    const text = await request.text();
    if (text.length > 256 * 1024) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { plan } = await currentPlan();
  const out = exportHingeForPlan(body.params, plan);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return new NextResponse(out.svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "x-hingelab-plan": plan },
  });
}
