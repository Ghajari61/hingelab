import { NextResponse, type NextRequest } from "next/server";
import { exportGeneratorForPlan, fontUploads } from "@/lib/billing/exportGenerator";
import { exportHingeForPlan } from "@/lib/billing/exportHinge";
import { exportLettersForPlan, parseLetterRequest } from "@/lib/billing/exportLetters";
import { exportParametricForPlan, parseParametricRequest } from "@/lib/billing/exportParametric";
import { serverManifold } from "@/lib/billing/serverManifold";
import { bundledFont, FontError, serverHarfBuzz, uploadedFont } from "@/lib/billing/letterFonts";
import { currentPlan } from "@/lib/billing/plan";
import { isGeneratorId } from "@/lib/generators/ids";
import type { Plan } from "@/lib/plans";
import { LIMITS, rateLimit, tooManyRequests } from "@/lib/security/rateLimit";
import { clientIP, declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";
import { downloadHeaders } from "@/lib/security/headers";

/** Heavy requests (Parametric re-slicing) stop here instead of holding a server for minutes. */
export const maxDuration = 60;

/** Hinge Box and Letters settings are a few kB; a Letters request may carry an uploaded font. */
const MAX_PARAMS_BODY = 256 * 1024;
const MAX_FONT_BODY = 4.4 * 1024 * 1024;
/** A generator design may carry an engraved picture (a grey JPEG of at most 700 kB), and uploaded fonts. */
const MAX_GENERATOR_BODY = 1.2 * 1024 * 1024;

type Body = { product?: unknown; params?: unknown; what?: unknown; font?: { name?: unknown; data?: unknown }; fonts?: unknown };

/**
 * SVG export with the caller's plan applied on the server. Hinge Box: Free gets the
 * "Made with HingeLab" mark and cannot export Pro shapes or patterns. Letters: Free can export
 * only a single-letter Letter Box, with the mark. Parametric: Free can export library shapes as
 * parallel fins with up to 30 parts, with the mark (a ZIP, one sheet, or the assembly guide).
 * Generators: the editor exports free designs itself and sends only Pro ones here to be checked.
 * The plan always comes from the session, never from the request.
 */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return NextResponse.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  if (!isJSONRequest(request)) return NextResponse.json({ error: "Send JSON." }, { status: 415 });
  const length = declaredLength(request);
  if (length !== null && length > MAX_FONT_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  let body: Body;
  try {
    const text = await request.text();
    if (text.length > MAX_FONT_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    body = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    if (isGeneratorId(body.product) && !Array.isArray(body.fonts) && text.length > MAX_GENERATOR_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
    if (!(body.product === "letters" && body.font) && !isGeneratorId(body.product) && text.length > MAX_PARAMS_BODY) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { plan, userId } = await currentPlan();
  const limited = await rateLimit(body.product === "parametric" ? LIMITS.exportHeavy : LIMITS.export, userId ? `user:${userId}` : `ip:${clientIP(request)}`);
  if (!limited.ok) return tooManyRequests(limited);

  if (isGeneratorId(body.product)) {
    const out = await exportGeneratorForPlan(body.product, body.params, plan, fontUploads(body.fonts));
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    return new NextResponse(out.svg, { headers: { ...downloadHeaders("image/svg+xml; charset=utf-8", out.fileName), "x-hingelab-plan": plan } });
  }
  if (body.product === "parametric") {
    const req = parseParametricRequest(body.params, body.what);
    if ("error" in req) return NextResponse.json({ error: req.error }, { status: 400 });
    const out = await exportParametricForPlan(req.p, req.what, plan, await serverManifold());
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
    return new NextResponse(out.body as BodyInit, { headers: { ...downloadHeaders(out.type, out.fileName), "x-hingelab-plan": plan } });
  }
  const out = body.product === "letters" ? await exportLetters(body, plan) : exportHingeForPlan(body.params, plan);
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return new NextResponse(out.svg, { headers: { ...downloadHeaders("image/svg+xml; charset=utf-8"), "x-hingelab-plan": plan } });
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
    if (e instanceof FontError) return { ok: false as const, status: 422, error: e.message };
    console.error("letters export failed", e);
    return { ok: false as const, status: 422, error: "The font or text could not be built. Try another font, then export." };
  }
}
