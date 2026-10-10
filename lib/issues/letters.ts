/** Letters checks: missing glyphs, bends, and parts that do not fit, with fixes. */
import { autoFit, cutWidth, r3 } from "@/lib/hinge";
import { arrangeLetters, type LettersArranged } from "@/lib/fit/letters";
import { cleanFit } from "@/lib/fit/fitToSheets";
import { BUNDLED_FONTS, hingeParamsOf, wallHeightOf, type HarfBuzz, type LetterModel, type LetterParams, type LoadedFont } from "@/lib/letters";
import type { Fix, Issue } from "./index";

type LIssue = Issue<LetterParams>;
/** Fonts that are already loaded (a fix that needs another font is checked once it has loaded). */
export type FontSource = (id: string) => LoadedFont | null;

const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN = /[A-Za-z\u00C0-\u024F]/;

/** A bundled font for the scripts in the text, other than the current one. */
export function fontFor(text: string, current: string): string | null {
  const needArabic = ARABIC.test(text), needLatin = LATIN.test(text);
  const ok = BUNDLED_FONTS.filter((f) => f.id !== current && (!needArabic || f.scripts.includes("arabic")) && (!needLatin || f.scripts.includes("latin")));
  return ok[0]?.id ?? null;
}

function fitted(p: LetterParams, m: LetterModel): LetterParams | null {
  const tight = m.box ? Math.min(...m.box.letters.map((s) => s.rTight)) : Infinity;
  if (!Number.isFinite(tight)) return null;
  const res = autoFit(hingeParamsOf(p), wallHeightOf(p), tight);
  if (!res.ok) return null;
  const q = { ...p, pitch: res.q.pitch, bridge: res.q.bridge };
  if (p.pattern !== "serpentine") q.slit = res.q.slit;
  return q;
}

const COVERED = [/has no glyph for/, /bends tighter \(R/, /^Torsion bars are under/];

/** `pre`: the editor's own build of `p`, to save building it twice. */
export function lettersIssues(p: LetterParams, fonts: FontSource, hb: HarfBuzz, pre?: LettersArranged): LIssue[] {
  const font = fonts(p.fontId);
  if (!font) return [];
  const arranged = pre ?? arrangeLetters(p, font, hb);
  const res = arranged.result;
  if ("error" in res) {
    const id = /has none of these characters/.test(res.error) ? fontFor(p.text, p.fontId) : null;
    const name = BUNDLED_FONTS.find((f) => f.id === id)?.name;
    return [{ code: "BUILD", level: "error", message: res.error, fixes: id && name ? [{ id: "font", label: `Use ${name}`, safe: true, apply: (q) => ({ ...q, fontId: id }) }] : [] }];
  }
  const m = res;
  const out: LIssue[] = [];

  if (m.shaped.missing.length) {
    const id = fontFor(m.shaped.missing.join("") + p.text, p.fontId);
    const name = BUNDLED_FONTS.find((f) => f.id === id)?.name;
    out.push({
      code: "MISSING_GLYPHS", level: "warn",
      message: `${font.name} has no ${m.shaped.missing.map((c) => `“${c}”`).join(" ")}, so ${m.shaped.missing.length > 1 ? "they are" : "it is"} left out.`,
      fixes: id && name ? [{ id: "font", label: `Use ${name}`, safe: true, apply: (q) => ({ ...q, fontId: id }) }] : [],
    });
  }

  const cracks = m.box?.style === "hinge" ? m.box.letters.filter((s) => s.verdict === "crack") : [];
  if (cracks.length) {
    const q = fitted(p, m);
    out.push({
      code: "BEND", level: "error",
      message: `${cracks.map((s) => `“${s.letter}”`).join(" ")} bend${cracks.length === 1 ? "s" : ""} tighter than this hinge allows (about R ${r3(m.box!.rMin)} mm).`,
      fixes: q ? [{ id: "autofit", label: "Auto-fit the hinge", safe: true, apply: (x) => fitted(x, m) ?? x }] : [],
    });
  }

  if (m.box?.style === "hinge" && p.pitch - cutWidth(hingeParamsOf(p)) < 0.9) {
    const q = fitted(p, m);
    out.push({
      code: "WEAK_BARS", level: "warn",
      message: "Torsion bars are under 0.9 mm wide and may char or snap.",
      fixes: q ? [{ id: "autofit", label: "Auto-fit the hinge", safe: true, apply: (x) => fitted(x, m) ?? x }] : [],
    });
  }

  const fitsOf = (q: LetterParams) => {
    const a = q === p ? arranged : arrangeLetters(q, font, hb);
    if ("error" in a.result) return false;
    if (a.fit) return a.fit.fits;
    return !!a.lay && a.lay.width <= q.bedW + 1e-6 && a.lay.height <= q.bedH + 1e-6;
  };
  if (!fitsOf(p)) {
    const fit = cleanFit(p.fit);
    const fixes: Fix<LetterParams>[] = [];
    if (p.bedW !== p.bedH && fitsOf({ ...p, bedW: p.bedH, bedH: p.bedW })) fixes.push({ id: "turn", label: "Turn the sheet", safe: true, apply: (q) => ({ ...q, bedW: q.bedH, bedH: q.bedW }) });
    if (fit.mode === "off") fixes.push({ id: "fit1", label: "Fit to 1 sheet", safe: true, apply: (q) => ({ ...q, fit: { mode: "sheets", sheets: 1 } }) });
    else if (fit.mode === "sheets" && fitsOf({ ...p, fit: { mode: "auto", sheets: fit.sheets } })) fixes.push({ id: "auto", label: "Use as many sheets as needed", safe: true, apply: (q) => ({ ...q, fit: { mode: "auto", sheets: fit.sheets } }) });
    out.push({ code: "TOO_BIG", level: "warn", message: `The parts do not fit the ${fit.mode === "off" ? "bed" : "sheets"} (${p.bedW} × ${p.bedH} mm).`, fixes });
  }

  for (const i of m.issues) {
    if (COVERED.some((re) => re.test(i.msg))) continue;
    out.push({ code: "NOTE", level: i.lvl, message: i.msg, fixes: [] });
  }
  return out;
}
