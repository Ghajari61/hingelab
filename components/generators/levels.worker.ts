/** Traces a picture or SVG into brightness levels off the main thread, so the editor stays responsive. */
import { PictureError, svgLevels, traceLevels } from "@/lib/imaging/levels";
import type { LevelsRequest, LevelsResponse } from "./levelsClient";

self.onmessage = (e: MessageEvent<LevelsRequest>) => {
  const m = e.data;
  const post = (r: LevelsResponse) => (self as unknown as { postMessage(r: LevelsResponse): void }).postMessage(r);
  try {
    post({ id: m.id, ...(m.kind === "svg" ? svgLevels(m.text) : traceLevels({ width: m.width, height: m.height, data: m.rgba })) });
  } catch (err) {
    post({ id: m.id, error: err instanceof Error ? err.message : String(err), friendly: err instanceof PictureError });
  }
};
