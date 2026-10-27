import type { Issue } from "@/lib/issues";
import { missingGlyphs } from "../common";
import type { FamilyOutput } from "./build";
import { familyNames, type FamilyParams } from "./params";

const r1 = (v: number) => Math.round(v * 10) / 10;
/** Smallest letters that still read once cut or marked, mm. */
const MIN = { engrave: 3.5, score: 4, cutout: 5, layered: 4 } as const;
/** Welded names (tree, snowflake) need sturdier letters. */
const MIN_WELDED = 5;

/** The same design this much bigger. */
export function growFamily(q: FamilyParams, k: number): FamilyParams {
  const r = (v: number) => Math.ceil(v * k);
  return {
    ...q,
    crossword: { ...q.crossword, tile: r(q.crossword.tile) },
    tree: { ...q.tree, width: r(q.tree.width), maxLine: r(q.tree.maxLine) },
    snowflake: { ...q.snowflake, diameter: r(q.snowflake.diameter) },
    ring: { ...q.ring, diameter: r(q.ring.diameter), nameSize: r(q.ring.nameSize) },
    monogram: { ...q.monogram, size: r(q.monogram.size) },
    bunting: { ...q.bunting, width: r(q.bunting.width), height: r(q.bunting.height) },
  };
}

export function checkFamily(p: FamilyParams, out: FamilyOutput): Issue<FamilyParams>[] {
  const issues: Issue<FamilyParams>[] = [];
  const info = out.info;
  issues.push(...missingGlyphs<FamilyParams>(out.missing, p.names.fontId, (q, f) => ({ ...q, names: { ...q.names, fontId: f } })));
  if (!info) return issues;
  const kind = p.layout.kind;
  const welded = kind === "tree" || kind === "snowflake";
  const min = welded ? MIN_WELDED : MIN[p.mark.kind];

  if (kind === "crossword" && info.skipped.length) {
    issues.push({
      code: "FAMILY_UNCROSSED", level: "warn",
      message: `${info.skipped.join(", ")} share${info.skipped.length === 1 ? "s" : ""} no letter where it can cross, so ${info.skipped.length === 1 ? "it is" : "they are"} left out. Add a longer name, or use the tree.`,
      fixes: [{ id: "tree", label: "Make a name tree", safe: true, apply: (q) => ({ ...q, layout: { kind: "tree" } }) }],
    });
  }
  if (info.letter > 0 && info.letter < min) {
    const k = Math.min(2.5, (min / info.letter) * 1.05);
    issues.push({
      code: "FAMILY_SMALL", level: "warn",
      message: `The smallest letters come out ${r1(info.letter)} mm high; under ${min} mm they ${welded || p.mark.kind === "cutout" ? "break when cut" : "are hard to read"}.`,
      fixes: [{ id: "grow", label: `Make it ${Math.round(k * 100)} % of the size`, safe: true, apply: (q) => growFamily(q, k) }],
    });
  }
  if (kind === "snowflake" && familyNames(p).length > 12) {
    issues.push({ code: "FAMILY_ARMS", level: "info", message: "A snowflake has at most 12 arms: the names after the twelfth are left out.", fixes: [{ id: "ring", label: "Put them round a ring", safe: true, apply: (q) => ({ ...q, layout: { kind: "ring" } }) }] });
  }
  if (kind === "tree" && !p.tree.noWeld && p.tree.operation !== "score" && p.tree.weld < 0.5) {
    issues.push({ code: "FAMILY_WELD", level: "info", message: "Thin welds snap where the names join; 0.7 mm or more holds the tree together.", fixes: [{ id: "weld", label: "Weld 0.8 mm", safe: true, apply: (q) => ({ ...q, tree: { ...q.tree, weld: 0.8 } }) }] });
  }
  if (Number.isFinite(info.wall) && info.wall < 2 - 0.05) {
    issues.push({ code: "FAMILY_WALL", level: "warn", message: `Only ${r1(info.wall)} mm of material is left round a hole; keep 2.5 mm so it does not tear.`, fixes: [{ id: "wall", label: "Wall 2.5 mm", safe: true, apply: (q) => ({ ...q, hang: { ...q.hang, wall: 2.5 } }) }] });
  }
  return issues;
}
