/**
 * The app's routes, the same on the website and in the Windows app (the app keeps them in the
 * address hash: #/editor/hinge). A product id after /editor/ opens that editor; any other id is a
 * Studio project (DECISIONS.md D186, R3).
 */
import { GENERATOR_IDS, LEGACY_GENERATOR_IDS } from "@/lib/generators/ids";

export const CORE_PRODUCTS = ["hinge", "letters", "parametric"] as const;
export const EDITOR_PRODUCTS: readonly string[] = [...CORE_PRODUCTS, ...GENERATOR_IDS, ...LEGACY_GENERATOR_IDS];

export const ROUTES = {
  generators: "/generators",
  projects: "/projects",
  account: "/account",
  editor: (id: string) => `/editor/${encodeURIComponent(id)}`,
} as const;

/** The start gallery inside the editor (no product open yet). */
export const START_PATH = "/app/editor/local";

export const isEditorProduct = (id: string) => EDITOR_PRODUCTS.includes(id);

export const editorPath = (product: string) => ROUTES.editor(product);

/**
 * Where a product's editor lives on each platform: `/editor/<product>` in the Windows app; the
 * website keeps `/app/editor/local?p=<product>`, where it needs no Studio styles (and redirects
 * `/editor/<product>` there).
 */
export const productHref = (product: string | null, kind: "web" | "tauri") =>
  !product ? START_PATH : kind === "tauri" ? editorPath(product) : `${START_PATH}?p=${encodeURIComponent(product)}`;

/** The product named by an editor path (/editor/clock), or null for Studio project ids and other pages. */
export function productFromPath(path: string): string | null {
  const m = /^\/editor\/([^/?#]+)\/?$/.exec(path);
  if (!m) return null;
  const id = decodeURIComponent(m[1]);
  return isEditorProduct(id) ? id : null;
}

/** What a path shows: a product editor, a Studio project, or a named page. */
export type RouteMatch =
  | { page: "editor"; product: string }
  | { page: "studio"; projectId: string }
  | { page: "generators" | "projects" | "account" | "start" }
  | { page: "other"; path: string };

export function matchRoute(path: string): RouteMatch {
  // A retired generator id is not a Studio project id.
  if (/^\/editor\/photoproduct\/?$/.test(path)) return { page: "other", path };
  const product = productFromPath(path);
  if (product) return { page: "editor", product };
  const studio = /^\/editor\/([^/?#]+)\/?$/.exec(path);
  if (studio) return { page: "studio", projectId: decodeURIComponent(studio[1]) };
  if (path === ROUTES.generators) return { page: "generators" };
  if (path === ROUTES.projects || path === "/app") return { page: "projects" };
  if (path === ROUTES.account) return { page: "account" };
  if (path === START_PATH || path === "/" || path === "") return { page: "start" };
  return { page: "other", path };
}
