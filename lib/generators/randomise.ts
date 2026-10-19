/**
 * Randomise design and preset search: pure helpers for the generator editor. Choices go first
 * (a new pattern brings its own starting values), then toggles and fonts, then the numbers that
 * the new design shows.
 */
import { BUNDLED_FONTS } from "@/lib/letters/fontList";
import { setPath } from "./path";
import type { AnyGenerator, ChoiceSpec, FontSpec, GenBase, NumberSpec, ToggleSpec } from "./types";

type P = GenBase & Record<string, unknown>;
type Shuffled = NumberSpec<P> | ChoiceSpec<P> | ToggleSpec<P> | FontSpec<P>;

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Fields Randomise design may change, in section order. */
export function shuffleFields(def: AnyGenerator): Shuffled[] {
  const out: Shuffled[] = [];
  for (const s of def.sections) {
    for (const f of s.fields) {
      if ((f.kind === "number" || f.kind === "choice" || f.kind === "toggle" || f.kind === "font") && f.shuffle) out.push(f as Shuffled);
    }
  }
  return out;
}

/** Bundled fonts for random picks: whole strokes only, and the script the text needs. */
export function shuffleFonts(sample: string): string[] {
  const script = ARABIC.test(sample) ? "arabic" : "latin";
  return BUNDLED_FONTS.filter((f) => !f.thin && f.scripts.includes(script)).map((f) => f.id);
}

/** A new design: every unlocked shuffle field that shows gets a random value; the rest stay. */
export function randomiseParams(def: AnyGenerator, params: P, locked: ReadonlySet<string>, rnd: () => number = Math.random): P {
  const fields = shuffleFields(def).filter((f) => !locked.has(f.key));
  const shows = (f: Shuffled, q: P) => {
    const sec = def.sections.find((s) => s.fields.includes(f as never));
    return (!sec?.show || sec.show(q)) && (!f.show || f.show(q));
  };
  const pick = <T,>(list: readonly T[]) => list[Math.min(list.length - 1, Math.floor(rnd() * list.length))];
  let q = params;
  for (const f of fields) {
    if (f.kind !== "choice" || !shows(f, q)) continue;
    const opts = f.options.filter((o) => !o.pro && !o.input);
    if (!opts.length) continue;
    const v = pick(opts).v;
    q = f.apply ? (f.apply(q, v) as P) : setPath(q, f.key, v);
  }
  for (const f of fields) {
    if (f.kind === "toggle" && shows(f, q)) q = setPath(q, f.key, rnd() < 0.5);
    else if (f.kind === "font" && shows(f, q)) {
      const ids = shuffleFonts(f.sample?.(q) ?? "");
      if (ids.length) q = setPath(q, f.key, pick(ids));
    }
  }
  const done = new Set<string>();
  for (const f of fields) {
    if (f.kind !== "number" || done.has(f.key) || !shows(f, q)) continue;
    done.add(f.key);
    const [lo, hi] = Array.isArray(f.shuffle) ? f.shuffle : [f.min, f.max];
    const a = Math.max(f.min, Math.min(lo, hi)), b = Math.min(f.max, Math.max(lo, hi));
    let v = a + rnd() * (b - a);
    v = f.int ? Math.round(v) : Math.round(v / f.step) * f.step;
    q = setPath(q, f.key, Math.round(Math.min(b, Math.max(a, v)) * 1000) / 1000);
  }
  return def.merge(q) as P;
}

/** Whether a preset matches a search: every word of the query appears in its name, note or id. */
export function presetMatches(query: string, pr: { id: string; name: string; note?: string }): boolean {
  const hay = `${pr.name} ${pr.note ?? ""} ${pr.id.replace(/[-_]/g, " ")}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/** Most recent first, without repeats, at most `max`. */
export function pushRecent(list: readonly string[], id: string, max = 4): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}

/** Adds the id, or removes it when it is there. */
export function toggleIn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** Only what looks like a list of ids comes back from storage. */
export function readIds(raw: string | null, max = 60): string[] {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 80).slice(0, max) : [];
  } catch {
    return [];
  }
}
