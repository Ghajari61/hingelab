/**
 * The Laser Readiness Score: how ready a picture is for the laser, 0–100, measured on the user's
 * computer (free, no model call). It looks at the background, the contrast and, for cuts, the
 * traced result's cut safety (thin parts, loose pieces, detail), and says what would fix each problem.
 */
import { fitWithin, greyOf, type Img } from "./image";
import { cutSafety, safeFeature } from "./safety";
import { cleanVectorize, inkBitmap, vectorizeBitmap } from "./vectorize";

export type ReadinessMethod = "cut" | "engrave" | "score" | "layers";

export interface ReadinessCheck {
  id: "background" | "contrast" | "ink" | "thin" | "islands" | "detail";
  label: string;
  ok: boolean;
  detail: string;
}

export interface Readiness {
  score: number;
  grade: "ready" | "good" | "fix" | "redo";
  checks: ReadinessCheck[];
  /** One sentence to add to the prompt when the picture is made again. */
  promptFix: string;
}

export interface ReadinessOptions {
  method: ReadinessMethod;
  widthMm: number;
  /** Sheet thickness, mm (sets the thinnest safe part). */
  thicknessMm?: number;
}

/** Analysed at most this many pixels on the long side, so the score takes well under a second. */
const SIDE = 480;

export const gradeOf = (score: number): Readiness["grade"] => (score >= 85 ? "ready" : score >= 70 ? "good" : score >= 50 ? "fix" : "redo");

export function readiness(src: Img, o: ReadinessOptions): Readiness {
  const img = fitWithin(src, SIDE);
  const g = greyOf(img), w = img.width, h = img.height, n = w * h;
  const checks: ReadinessCheck[] = [];
  const fixes: string[] = [];
  let score = 100;

  // Background: the border should be white (or transparent, which greyOf turns white).
  let edge = 0, edgeWhite = 0;
  for (let x = 0; x < w; x++) for (const y of [0, h - 1]) { edge++; if (g[y * w + x] > 225) edgeWhite++; }
  for (let y = 0; y < h; y++) for (const x of [0, w - 1]) { edge++; if (g[y * w + x] > 225) edgeWhite++; }
  const white = edge ? edgeWhite / edge : 1;
  const bgOk = white > 0.9;
  if (!bgOk) { score -= Math.round((0.9 - white) * 40); fixes.push("plain pure white background"); }
  checks.push({ id: "background", label: "Clean background", ok: bgOk, detail: `${Math.round(white * 100)}% of the edge is white.` });

  // Contrast: share of pixels that are clearly dark or clearly light.
  let dark = 0, light = 0, mid = 0;
  for (let i = 0; i < n; i++) { const v = g[i]; if (v < 70) dark++; else if (v > 190) light++; else mid++; }
  const midShare = mid / n, inkShare = dark / n;
  if (o.method === "engrave") {
    const spread = 1 - Math.abs(dark - light) / n;
    const ok = midShare > 0.08 || spread > 0.25;
    if (!ok) { score -= 12; fixes.push("clear mid-tones and detail"); }
    checks.push({ id: "contrast", label: "Tones for engraving", ok, detail: `${Math.round(midShare * 100)}% mid-tones.` });
  } else {
    const ok = midShare < 0.12;
    if (!ok) { score -= Math.min(30, Math.round((midShare - 0.12) * 120)); fixes.push("solid black and white only, no grey shading"); }
    checks.push({ id: "contrast", label: "Crisp black and white", ok, detail: `${Math.round(midShare * 100)}% grey pixels.` });
  }
  const inkOk = inkShare > 0.02 && inkShare < 0.75;
  if (!inkOk) { score -= 15; fixes.push(inkShare <= 0.02 ? "bolder, larger shapes" : "more open white space"); }
  checks.push({ id: "ink", label: "Balanced ink", ok: inkOk, detail: `${Math.round(inkShare * 100)}% of the picture is ink.` });

  if (o.method !== "engrave" && inkShare > 0.005) {
    const p = cleanVectorize({ widthMm: o.widthMm, lines: o.method === "score" });
    const v = vectorizeBitmap(inkBitmap(img, p), p);
    const min = o.method === "score" ? 0 : safeFeature(o.thicknessMm ?? 3);
    const issues = cutSafety(v, p, { bedW: 10_000, bedH: 10_000, minFeatureMm: min, use: o.method === "layers" ? "engrave" : "cut" });
    const thin = issues.find((i) => i.code === "thin"), islands = issues.find((i) => i.code === "islands"), dense = issues.find((i) => i.code === "dense");
    if (o.method === "cut") {
      if (thin) { score -= 15; fixes.push(`no lines thinner than ${min} mm at ${Math.round(o.widthMm)} mm wide`); }
      checks.push({ id: "thin", label: "Strong enough to cut", ok: !thin, detail: thin ? thin.message : `No part thinner than ${min} mm.` });
      const pieces = islands ? Number(/\d+/.exec(islands.message)?.[0] ?? 2) : 1;
      if (islands) { score -= Math.min(20, 4 + pieces); fixes.push("every part connected in one piece"); }
      checks.push({ id: "islands", label: "One connected piece", ok: !islands, detail: islands ? islands.message : "Everything holds together." });
    }
    const nodes = v.subpaths.reduce((a, s) => a + s.nodes.length, 0);
    const busy = !!dense || nodes > 6000;
    if (busy) { score -= 8; fixes.push("simpler shapes with less clutter"); }
    checks.push({ id: "detail", label: "Clean detail", ok: !busy, detail: `${nodes.toLocaleString("en")} nodes when traced.` });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, grade: gradeOf(score), checks, promptFix: fixes.length ? `Make sure of: ${[...new Set(fixes)].join("; ")}.` : "" };
}
