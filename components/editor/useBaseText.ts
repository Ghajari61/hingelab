"use client";

import { useEffect, useMemo, useState } from "react";
import { getLoadedFont, loadHarfBuzz } from "@/components/letters/runtime";
import { makeTextFn } from "@/lib/generators/text";
import type { BuildContext } from "@/lib/generators/types";
import { baseTextFont, hasBaseText } from "@/lib/hinge/baseText";
import type { Params } from "@/lib/hinge";
import type { HarfBuzz, LoadedFont } from "@/lib/letters/fonts";

/** The text shaper for the text under the box: loads HarfBuzz and the font only once text is typed. */
export function useBaseTextContext(p: Params): { ctx: BuildContext | undefined; error: string | null } {
  const want = hasBaseText(p) ? baseTextFont(p) : "";
  const [hb, setHb] = useState<HarfBuzz | null>(null);
  const [fonts, setFonts] = useState<Record<string, LoadedFont>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!want || hb) return;
    loadHarfBuzz().then(setHb, () => setError("The text shaper could not load. Reload the page to try again."));
  }, [want, hb]);
  useEffect(() => {
    if (!hb || !want || fonts[want]) return;
    let live = true;
    getLoadedFont(hb, want).then((f) => { if (live) setFonts((m) => ({ ...m, [want]: f })); }, (e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [hb, want, fonts]);
  const ctx = useMemo<BuildContext | undefined>(() => (hb && want && fonts[want] ? { text: makeTextFn(hb, (id) => fonts[id] ?? null) } : undefined), [hb, want, fonts]);
  return { ctx, error };
}
