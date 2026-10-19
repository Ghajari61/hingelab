/// <reference lib="webworker" />
/**
 * Builds and lays out a generator design off the page's thread, for designs slow enough to stall
 * typing and dragging (Shadow Box, signs, large puzzles). Same code as on the page: it loads the
 * generator, HarfBuzz and the fonts it needs, and asks for outline nests the page's nest worker makes.
 */
import { loadGenerator } from "@/lib/generators/registry";
import { arrangeGenerator } from "@/lib/generators/output";
import { makeTextFn } from "@/lib/generators/text";
import type { AnyGenerator, BuildContext } from "@/lib/generators/types";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";
import { putNest, withNestDeferral, type NestJob } from "@/lib/nest/deferred";
import { getLoadedFont, loadHarfBuzz } from "@/components/letters/runtime";
import type { BuildReply, BuildRequest } from "./buildProtocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const defs = new Map<string, Promise<AnyGenerator>>();
const fonts: Record<string, LoadedFont> = {};
let hb: HarfBuzz | null = null;
let latest = 0;

async function context(ids: string[]): Promise<BuildContext> {
  if (!ids.length) return hb ? { text: makeTextFn(hb, (fid) => fonts[fid] ?? null) } : {};
  hb ??= await loadHarfBuzz();
  await Promise.all(ids.filter((fid) => !fonts[fid]).map(async (fid) => { fonts[fid] = await getLoadedFont(hb!, fid); }));
  return { text: makeTextFn(hb, (fid) => fonts[fid] ?? null) };
}

scope.onmessage = async (e: MessageEvent<BuildRequest>) => {
  const m = e.data;
  if (m.type === "nests") {
    for (const r of m.results) putNest(r.job, r.res, r.ms);
    return;
  }
  latest = m.id;
  try {
    let d = defs.get(m.gen);
    if (!d) defs.set(m.gen, (d = loadGenerator[m.gen]()));
    const [def, ctx] = await Promise.all([d, context(m.fonts)]);
    if (m.id !== latest) return;
    const jobs: NestJob[] = [];
    const t0 = performance.now();
    const arranged = withNestDeferral((j) => { if (!jobs.some((q) => q.key === j.key)) jobs.push(j); }, () => arrangeGenerator(def, m.params as never, ctx));
    const reply: BuildReply = { type: "arranged", id: m.id, arranged, jobs, ms: performance.now() - t0 };
    scope.postMessage(reply);
  } catch (err) {
    const reply: BuildReply = { type: "error", id: m.id, message: err instanceof Error ? err.message : String(err) };
    scope.postMessage(reply);
  }
};
