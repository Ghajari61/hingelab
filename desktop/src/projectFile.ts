/**
 * Project files (.oclc) in the app: the same JSON the website's editors save, so a file moves
 * freely between the two. Designs the app edits itself open here; Letters, Parametric and Studio
 * projects open in the website view.
 */
import type { Params } from "./design";

export type ReadProject =
  | { kind: "native"; product: string; params: Params; version: number }
  | { kind: "web"; section: string }
  | { kind: "error"; message: string };

const NOT_A_PROJECT = "That file is not a HingeLab project.";

/** The app's product for a file's `product` field (Hinge Box files may have none). */
function productOf(p: unknown): string | null {
  if (p === undefined || p === "hinge-box" || p === "hinge") return "hinge";
  return typeof p === "string" ? p : null;
}

/** What a project file holds, and where it opens. `native` lists the products the app edits itself. */
export function readProject(text: string | null, native: ReadonlySet<string>): ReadProject {
  if (text === null) return { kind: "web", section: "studio" };
  let j: unknown;
  try {
    j = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return { kind: "error", message: NOT_A_PROJECT };
  }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { kind: "error", message: NOT_A_PROJECT };
  const o = j as Record<string, unknown>;
  if (!o.params || typeof o.params !== "object" || Array.isArray(o.params)) return { kind: "error", message: NOT_A_PROJECT };
  const product = productOf(o.product);
  if (product === "testcard") return { kind: "error", message: "That file is a Test Cards design. Test Cards was removed from HingeLab, so it can't be opened." };
  const version = typeof o.version === "number" && Number.isFinite(o.version) ? o.version : 1;
  if (product && native.has(product) && product !== "art") return { kind: "native", product, params: o.params as Params, version };
  // Letters, Parametric and anything newer than this app: the website knows every section.
  if (product && product !== "art") return { kind: "web", section: product };
  return { kind: "error", message: NOT_A_PROJECT };
}

/** The project file for a design, as the website writes it. */
export function projectText(product: string, params: Params, version = 1): string {
  return JSON.stringify({ app: "HingeLab", product: product === "hinge" ? "hinge-box" : product, version, params }, null, 2);
}
