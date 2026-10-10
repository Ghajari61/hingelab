import { NextResponse, type NextRequest } from "next/server";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { exportLettersForPlan, parseLetterRequest } from "@/lib/billing/exportLetters";
import { bundledFont, serverHarfBuzz, uploadedFont } from "@/lib/billing/letterFonts";
import { currentPlan } from "@/lib/billing/plan";
import type { Plan } from "@/lib/plans";

/** Hinge Box and Letters settings are a few kB; a Letters request may carry an uploaded font. */
const MAX_PARAMS_BODY = 256 * 1024;
const MAX_FONT_BODY = 4.4 * 1024 * 1024;

type Body = { product?: unknown; params?: unknown; font?: { name?: unknown; data?: unknown } };

/**
 * SVG export with the caller's plan applied on the server. Hinge Box: Free gets the
 * "Made with HingeLab" mark and cannot export Pro shapes or patterns. Letters: Free can export
 * only a single-letter Letter Box, with the mark.
 */
export async function POST(request: NextRequest) {
  let body: Body;
  try {
    const text = await request.text();
    if (text.length > MAX_FONT_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(text);
    if (!body || typeof body !== "object") throw new Error();
    if (!(body.product === "letters" && body.font) && text.length > MAX_PARAMS_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { plan } = await currentPlan();
  const out = body.product === "letters" ? await exportLetters(body, plan) : exportHingeForPlan(body.params, plan);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return new NextResponse(out.svg, {
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "no-store", "x-hingelab-plan": plan },
  });
}

async function exportLetters(body: Body, plan: Plan) {
  const p = parseLetterRequest(body.params);
  if ("error" in p) return { ok: false as const, status: 400, error: p.error };
  try {
    const hb = await serverHarfBuzz();
    let font;
    if (body.font && typeof body.font.data === "string") {
      font = uploadedFont(hb, p.fontId, typeof body.font.name === "string" ? body.font.name : "", body.font.data);
    } else {
      const f = bundledFont(hb, p.fontId);
      if (!f) return { ok: false as const, status: 400, error: "This project uses an uploaded font. Pick it again or upload it again, then export." };
      font = await f;
    }
    return exportLettersForPlan(p, plan, font, hb);
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : "Export failed. Try again.";
    return { ok: false as const, status: 422, error: msg };
  }
}
