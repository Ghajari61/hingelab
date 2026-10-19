/**
 * Box styles are plugins: each registers its id, name, icon, defaults, the schema the settings
 * panel is made from, and its `build`. Adding a style is one file in styles/ and one line in
 * styles/index.ts.
 */
import type { BoxParams, BoxStyle, ParamField } from "./types";

const STYLES = new Map<string, BoxStyle>();

export function registerBoxStyle<P extends BoxParams>(style: BoxStyle<P>): BoxStyle<P> {
  if (STYLES.has(style.id)) throw new Error(`Box style "${style.id}" is registered twice.`);
  STYLES.set(style.id, style as unknown as BoxStyle);
  return style;
}

export const getBoxStyle = (id: string) => STYLES.get(id);
export const listBoxStyles = () => [...STYLES.values()];

/** Every field of a style, flat. */
export const fieldsOf = (s: BoxStyle) => s.paramSchema.flatMap((g) => g.fields);

/**
 * The style's defaults with `raw` laid over them, each value checked against the schema: numbers
 * clamped to their range, choices kept to their options, toggles to booleans. Unknown keys go.
 */
export function cleanParams(s: BoxStyle, raw: unknown): BoxParams {
  const p: BoxParams = { ...s.defaultParams };
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fields = new Map<string, ParamField>(fieldsOf(s).map((f) => [f.key, f]));
  for (const [k, v] of Object.entries(r)) {
    if (!(k in p)) continue;
    const f = fields.get(k);
    if (typeof p[k] === "number" && typeof v === "number" && Number.isFinite(v)) {
      p[k] = f && (f.kind === "length" || f.kind === "number") ? Math.min(f.max, Math.max(f.min, v)) : v;
    } else if (typeof p[k] === "boolean" && typeof v === "boolean") p[k] = v;
    else if (typeof p[k] === "string" && typeof v === "string") {
      if (f?.kind !== "select" || f.options.some((o) => o.v === v)) p[k] = v;
    }
  }
  return p;
}
