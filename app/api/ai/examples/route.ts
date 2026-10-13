import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { addExample, ExampleError, isCurator, listExamples, parseExampleInput } from "@/lib/ai/examples";
import { MAX_EXAMPLE_BODY } from "@/lib/ai/exampleLimits";
import { declaredLength, isCrossSite, isJSONRequest, siteOrigins } from "@/lib/security/request";

/** Reading the drawing, drawing its picture and three uploads. */
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/** The signed-in curator's id; anyone else is told the page does not exist. */
async function curator(): Promise<string | null> {
  const session = await getUser();
  if (!session) return null;
  return (await isCurator(session.user.id)) ? session.user.id : null;
}

/** The AI designer's example library (curators only). */
export async function GET() {
  if (!(await curator())) return json({ error: "Not found." }, 404);
  try {
    return json({ examples: await listExamples() });
  } catch (e) {
    console.error("ai examples: list failed", e);
    return json({ error: "The example library could not be read." }, 500);
  }
}

/** Adds an example: its title, description, tags, the cut file (SVG) and a photo of the product. */
export async function POST(request: NextRequest) {
  if (isCrossSite(request, siteOrigins())) return json({ error: "Cross-site requests are not allowed." }, 403);
  if (!isJSONRequest(request)) return json({ error: "Send JSON." }, 415);
  const length = declaredLength(request);
  if (length !== null && length > MAX_EXAMPLE_BODY) return json({ error: "The upload is too large." }, 413);
  const userId = await curator();
  if (!userId) return json({ error: "Not found." }, 404);
  const text = await request.text();
  if (text.length > MAX_EXAMPLE_BODY) return json({ error: "The upload is too large." }, 413);
  const input = parseExampleInput(text);
  if ("error" in input) return json({ error: input.error }, 400);
  try {
    return json(await addExample(userId, input), 201);
  } catch (e) {
    if (e instanceof ExampleError) return json({ error: e.message }, 400);
    console.error("ai examples: add failed", e);
    return json({ error: "The example could not be saved. Try again." }, 500);
  }
}
