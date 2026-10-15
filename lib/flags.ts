/**
 * Feature flags. The build turns flags on with NEXT_PUBLIC_FLAGS (a comma list, e.g.
 * "gallery,gate.batch"); the server reads HINGELAB_FLAGS first so a flag can be opened there
 * without a new client build. On a device, `hingelab-flags` in localStorage can only switch more
 * flags on (for trying a feature); it never switches off one the build turned on, so a Pro gate
 * cannot be lifted from the browser.
 *
 * `gate.*` flags are the groundwork for Free vs Pro: with a gate on, that feature needs the Pro
 * plan. Every gate is off today, so nothing changes until one is turned on.
 */

export const FLAG_IDS = ["gallery", "gate.batch", "gate.lbrn2", "gate.nesting", "gate.photoEngrave", "gate.customFonts"] as const;
export type FlagId = (typeof FLAG_IDS)[number];

export const FLAG_INFO: Record<FlagId, string> = {
  gallery: "Community gallery: publish designs with a thumbnail; others can remix them.",
  "gate.batch": "Batch personalisation (ZIP) needs Pro.",
  "gate.lbrn2": "LightBurn project export needs Pro.",
  "gate.nesting": "Nesting by outline needs Pro.",
  "gate.photoEngrave": "Photo engraving needs Pro.",
  "gate.customFonts": "More than the free number of uploaded fonts needs Pro.",
};

export const FLAGS_KEY = "hingelab-flags";

const isFlag = (s: string): s is FlagId => (FLAG_IDS as readonly string[]).includes(s);

export function parseFlags(raw: string | null | undefined): Set<FlagId> {
  const out = new Set<FlagId>();
  for (const s of String(raw ?? "").split(/[\s,]+/)) if (isFlag(s)) out.add(s);
  return out;
}

/** Flags the build turned on. */
export function buildFlags(): Set<FlagId> {
  return parseFlags(process.env.NEXT_PUBLIC_FLAGS);
}

/** Flags on the server (server code only). */
export function serverFlags(): Set<FlagId> {
  return parseFlags(process.env.HINGELAB_FLAGS ?? process.env.NEXT_PUBLIC_FLAGS);
}

/** Flags in this browser: the build's, plus any the device switched on. */
export function clientFlags(): Set<FlagId> {
  const out = buildFlags();
  try {
    const raw = localStorage.getItem(FLAGS_KEY);
    const extra = raw?.trim().startsWith("[") ? (JSON.parse(raw) as unknown[]).filter((x): x is string => typeof x === "string").join(",") : raw;
    for (const f of parseFlags(extra)) out.add(f);
  } catch { /* storage off */ }
  return out;
}
