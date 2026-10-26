import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import { hangs, type CharmOutput } from "./build";
import type { CharmParams } from "./params";

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Smallest letters that still read once cut or engraved, mm. */
export const MIN_LETTER = { engrave: 3, score: 4, cutout: 5, layered: 4, letters: 4 } as const;
/** Least material round a hole that survives a ring pulling on it, mm. */
export const minWall = (p: CharmParams) => (p.kind.kind === "earrings" ? 1.5 : /acr|mirror|leather/.test(p.material) ? 2 : 2.5);
/** Smallest hole a split ring threads through, mm. */
export const SPLIT_RING_HOLE = 3.5;
/** Earrings heavier than this pull on the ear, g. */
export const HEAVY_EARRING = 5;

export function checkCharm(p: CharmParams, out: CharmOutput): Issue<CharmParams>[] {
  const issues: Issue<CharmParams>[] = [];
  const info = out.info;
  issues.push(...missingGlyphs<CharmParams>(out.missing, p.names.fontId, (q, f) => ({ ...q, names: { ...q.names, fontId: f, subFontId: f } })));
  if (!info) return issues;
  const kind = p.kind.kind;
  const grow = (q: CharmParams, k: number): CharmParams => ({ ...q, shape: { ...q.shape, width: Math.ceil(q.shape.width * k), height: Math.ceil(q.shape.height * k) } });

  const hanging = (p.hang.kind !== "none" && hangs(p)) || kind === "bagtag";
  if (hanging && Number.isFinite(info.wall) && info.wall < Math.min(p.hang.wall, minWall(p)) - 0.05) {
    issues.push({
      code: "CHARM_HOLE_WALL", level: "warn",
      message: `Only ${r1(info.wall)} mm of material is left round the ${kind === "bagtag" ? "strap slot" : "hole"}; it can tear out. Keep at least ${minWall(p)} mm.`,
      fixes: [
        { id: "grow", label: "Make the charm 20 % bigger", safe: true, apply: (q) => grow(q, 1.2) },
        ...(p.hang.kind === "hole" ? [{ id: "loop", label: "Hang it from a loop on the edge", safe: true, apply: (q: CharmParams) => ({ ...q, hang: { ...q.hang, kind: "loop" as const } }) }] : []),
      ],
    });
  } else if (hanging && p.hang.wall < minWall(p)) {
    issues.push({
      code: "CHARM_THIN_WALL", level: "info",
      message: `A ${p.hang.wall} mm wall round the hole is thin for ${/acr|mirror/.test(p.material) ? "acrylic" : "this stock"}; ${minWall(p)} mm holds a ring safely.`,
      fixes: [{ id: "wall", label: `Wall ${minWall(p)} mm`, safe: true, apply: (q) => ({ ...q, hang: { ...q.hang, wall: minWall(q) } }) }],
    });
  }
  if (kind === "keychain" && p.hang.kind !== "none" && p.hang.hole < SPLIT_RING_HOLE) {
    issues.push({
      code: "CHARM_RING_HOLE", level: "warn",
      message: `A ${p.hang.hole} mm hole is too small for a split ring; ${SPLIT_RING_HOLE + 1.5} mm or more threads easily.`,
      fixes: [{ id: "hole", label: `Hole ${SPLIT_RING_HOLE + 1.5} mm`, safe: true, apply: (q) => ({ ...q, hang: { ...q.hang, hole: SPLIT_RING_HOLE + 1.5 } }) }],
    });
  }
  if (kind === "earrings" && p.hang.kind !== "none" && p.hang.hole > 3) {
    issues.push({ code: "CHARM_EAR_HOLE", level: "info", message: `A ${p.hang.hole} mm hole is large for a jump ring; about 1.8 mm looks neater.`, fixes: [{ id: "hole", label: "Hole 1.8 mm", safe: true, apply: (q) => ({ ...q, hang: { ...q.hang, hole: 1.8, wall: Math.max(q.hang.wall, 1.5) } }) }] });
  }
  if (kind === "earrings" && info.grams > HEAVY_EARRING) {
    const k = Math.sqrt(HEAVY_EARRING / info.grams) * 0.95;
    issues.push({
      code: "CHARM_HEAVY", level: "warn",
      message: `Each earring weighs about ${r1(info.grams)} g; over ${HEAVY_EARRING} g pulls on the ear.`,
      fixes: [{ id: "smaller", label: `Earrings ${Math.round(k * 100)} % of the size`, safe: true, apply: (q) => ({ ...q, shape: { ...q.shape, width: r1(q.shape.width * k), height: r1(q.shape.height * k) } }) }],
    });
  }
  if (kind === "drink") {
    const c = p.clip;
    if (c.opening >= c.stem - 0.3) {
      issues.push({ code: "CLIP_LOOSE", level: "warn", message: "The clip's opening is as wide as the stem, so it will not grip.", fixes: [{ id: "grip", label: `Opening ${r1(c.stem * 0.75)} mm`, safe: true, apply: (q) => ({ ...q, clip: { ...q.clip, opening: r1(q.clip.stem * 0.75) } }) }] });
    } else if (info.clipStrain > info.allowed) {
      // Widest opening change the arms take: δ = ε·L² / (1.5·w).
      const L = Math.PI * (c.stem / 2 + c.ring / 2) * 0.75, d = (info.allowed * 0.9 * L * L) / (1.5 * c.ring);
      const open = r1(Math.max(1, c.stem - 2 * d));
      issues.push({
        code: "CLIP_STRAIN", level: "warn",
        message: `Opening the clip bends its arms ${r1(info.clipStrain * 100)} %, past the ${r1(info.allowed * 100)} % this stock takes: it can snap. A wider opening or a thinner ring flexes less.`,
        fixes: [
          { id: "open", label: `Opening ${open} mm`, safe: true, apply: (q) => ({ ...q, clip: { ...q.clip, opening: open } }) },
          { id: "ring", label: `Ring ${r1(Math.max(1.5, c.ring * 0.7))} mm`, safe: true, apply: (q) => ({ ...q, clip: { ...q.clip, ring: r1(Math.max(1.5, q.clip.ring * 0.7)) } }) },
        ],
      });
    }
  }
  if (p.style.kind !== "letters" && info.letter > 0 && info.letter < MIN_LETTER[p.style.kind]) {
    const k = Math.min(2, MIN_LETTER[p.style.kind] / info.letter * 1.05);
    issues.push({
      code: "CHARM_SMALL_TEXT", level: "warn",
      message: `The names come out only ${r1(info.letter)} mm high to fit; under ${MIN_LETTER[p.style.kind]} mm they ${p.style.kind === "cutout" ? "break up when cut through" : "are hard to read"}.`,
      fixes: [
        { id: "grow", label: `Charm ${Math.round(k * 100)} % of the size`, safe: true, apply: (q) => grow(q, k) },
        { id: "margin", label: "Smaller margin", safe: true, apply: (q) => ({ ...q, shape: { ...q.shape, margin: Math.max(1.5, r1(q.shape.margin * 0.6)) } }) },
      ],
    });
  } else if (info.squeezed.length && p.style.kind !== "letters") {
    issues.push({
      code: "CHARM_SQUEEZED", level: "info",
      message: `${info.squeezed.slice(0, 3).join(", ")}${info.squeezed.length > 3 ? ` and ${info.squeezed.length - 3} more` : ""} shrank to less than half the letter height to fit; a wider charm keeps all the names the same size.`,
      fixes: [{ id: "wide", label: "Charm 30 % wider", safe: true, apply: (q) => ({ ...q, shape: { ...q.shape, width: Math.ceil(q.shape.width * 1.3) } }) }],
    });
  }
  if ((p.style.kind === "letters" || p.style.kind === "layered") && p.style.weld < 0.5) {
    issues.push({ code: "CHARM_THIN_WELD", level: "info", message: "Thin welds snap where the letters join; 0.8 mm or more holds a name together.", fixes: [{ id: "weld", label: "Weld 0.8 mm", safe: true, apply: (q) => ({ ...q, style: { ...q.style, weld: 0.8 } }) }] });
  }
  if (p.style.kind === "cutout" && p.textForm.stencil === 0) {
    issues.push({ code: "CHARM_CUTOUT_MIDDLES", level: "info", message: "Cut-through names lose the middles of O, A and B.", fixes: [{ id: "stencil", label: "Stencil bridges 0.8 mm", safe: true, apply: (q) => ({ ...q, textForm: { ...q.textForm, stencil: 0.8 } }) }] });
  }
  if (kind === "placecard" && p.stand.clearance < 0) {
    issues.push({ code: "CHARM_TIGHT_SLOT", level: "info", message: "The slots are narrower than the stock: the card and foot press together tightly and may split thin wood.", fixes: [{ id: "fit", label: "Clearance 0.1 mm", safe: true, apply: (q) => ({ ...q, stand: { ...q.stand, clearance: 0.1 } }) }] });
  }
  return issues;
}
