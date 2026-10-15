/**
 * Free vs Pro groundwork: the features that are candidates for Pro, each behind a `gate.*` flag
 * (see `lib/flags.ts`). With its gate off a feature is open to every plan, as it is today.
 * No payment logic lives here; `plan` comes from the account as everywhere else.
 */
import type { FlagId } from "./flags";
import type { Plan } from "./plans";

export type ProFeature = "batch" | "lbrn2" | "nesting" | "photoEngrave" | "customFonts";

/** Uploaded fonts a Free account keeps when the custom-font gate is on. */
export const FREE_FONT_UPLOADS = 2;

export const PRO_FEATURES: Record<ProFeature, { flag: FlagId; name: string; why: string }> = {
  batch: { flag: "gate.batch", name: "Batch personalisation", why: "Batch personalisation (a ZIP of files for a list of names) is a Pro feature." },
  lbrn2: { flag: "gate.lbrn2", name: "LightBurn project export", why: "LightBurn project files (.lbrn2) are a Pro feature. SVG, DXF and PDF stay free." },
  nesting: { flag: "gate.nesting", name: "Nesting by outline", why: "Nesting by outline is a Pro feature; packing by box stays free." },
  photoEngrave: { flag: "gate.photoEngrave", name: "Photo engraving", why: "Engraving photos is a Pro feature. You can design with a photo freely; exporting it needs Pro." },
  customFonts: { flag: "gate.customFonts", name: "Unlimited custom fonts", why: `The Free plan keeps up to ${FREE_FONT_UPLOADS} uploaded fonts on this device; more need Pro.` },
};

/** Why `feature` is locked for `plan` with these flags, or null when it is open. */
export function gateLock(feature: ProFeature, plan: Plan, flags: ReadonlySet<FlagId>): string | null {
  if (plan === "pro") return null;
  const f = PRO_FEATURES[feature];
  return flags.has(f.flag) ? f.why : null;
}

/** Locks a generator design meets with these settings: outline nesting and photos to engrave. */
export function designGates(p: { sheet?: { nest?: unknown } }, photos: number, plan: Plan, flags: ReadonlySet<FlagId>): string[] {
  const out: string[] = [];
  if (p.sheet?.nest === "outline") { const l = gateLock("nesting", plan, flags); if (l) out.push(l); }
  if (photos > 0) { const l = gateLock("photoEngrave", plan, flags); if (l) out.push(l); }
  return out;
}
