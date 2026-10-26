/**
 * Catalogue metadata for the public Make / Community / Learn pages.
 * Reads the existing generator lists. It does not build geometry.
 */
import { GENERATORS } from "./catalog";
import { GENERATOR_INFO, type GeneratorId } from "./ids";
import { START_LAZY, START_PRESETS } from "./startPresets";

export interface NavLink { href: string; label: string }

export const MAKE: NavLink[] = [
  { href: "/generators", label: "Generators" },
  { href: "/templates", label: "Templates" },
  { href: "/tools", label: "Free tools" },
  { href: "/home", label: "Free-form Studio" },
];

export const COMMUNITY: NavLink[] = [
  { href: "/gallery", label: "Gallery" },
  { href: "/collections", label: "Collections" },
  { href: "/graphics", label: "Graphics" },
  { href: "/materials", label: "Materials" },
];

export const LEARN: NavLink[] = [
  { href: "/help", label: "Guides" },
  { href: "/learn/kerf", label: "Kerf & fit tools" },
  { href: "/changelog", label: "Changelog" },
  { href: "/developers", label: "For developers" },
];

export const NAV_GROUPS: { id: string; label: string; links: NavLink[] }[] = [
  { id: "make", label: "Make", links: MAKE },
  { id: "community", label: "Community", links: COMMUNITY },
  { id: "learn", label: "Learn", links: LEARN },
];

export type CatalogueProcess = "laser" | "engrave" | "paper";

export interface CataloguePreset { id: string; name: string; href: string }

export interface CatalogueEntry {
  slug: string;
  name: string;
  blurb: string;
  category: string;
  plan: "free" | "pro";
  href: string;
  presetCount: number | null;
  presets: CataloguePreset[];
  /** Help articles use this product id. */
  helpProduct: string;
  process: CatalogueProcess;
  /** A preset picture under public/presets (the 3D-shaded drawing), or null. */
  picture: string | null;
}

const editor = (product: string, preset?: string) =>
  `/app/editor/local?p=${product}${preset ? `&preset=${encodeURIComponent(preset)}` : ""}`;

function fromGenerator(id: GeneratorId, process: CatalogueProcess, category: string): Omit<CatalogueEntry, "picture"> {
  const info = GENERATOR_INFO[id];
  const lazy = START_LAZY[id];
  const list = START_PRESETS[id] ?? [];
  const featured = id === "shadowbox"
    ? [
        { id: "star-tunnel", name: "Star tunnel" },
        { id: "lotus-mandala", name: "Lotus mandala" },
        { id: "mountain-range", name: "Mountain range" },
      ]
    : [];
  const presets = (list.length ? list.slice(0, 6).map((p) => ({ id: p.id, name: p.name })) : featured)
    .map((p) => ({ ...p, href: editor(id, p.id) }));
  return {
    slug: id,
    name: info.name,
    blurb: info.blurb,
    category,
    plan: id === "shadowbox" || id === "puzzle" || id === "boxes" || id === "paperbox" ? "free" : "pro",
    href: editor(id),
    presetCount: lazy?.count ?? list.length,
    presets,
    helpProduct: id,
    process,
  };
}

const CATALOGUE_BY_ID = new Map(GENERATORS.map((g) => [g.id, g]));

function fromCatalog(id: string, product: string, helpProduct: string, process: CatalogueProcess): Omit<CatalogueEntry, "picture"> {
  const g = CATALOGUE_BY_ID.get(id);
  return {
    slug: id,
    name: g?.name ?? id,
    blurb: g?.blurb ?? "",
    category: g?.category ?? "Tools",
    plan: g?.plan ?? "pro",
    href: editor(product),
    presetCount: null,
    presets: [],
    helpProduct,
    process,
  };
}

const CORE_PICTURE: Record<string, string> = { hinge: "gift-box", letters: "hello-sign", parametric: "head-stack" };

/** The picture of the preset a card opens: its own preset, else the product's featured or first one. */
export function pictureOf(href: string, cover?: string): string | null {
  const u = new URL(href, "https://hingelab.local");
  const product = u.searchParams.get("p");
  if (!product) return null;
  const id = u.searchParams.get("preset") ?? cover ?? CORE_PICTURE[product] ?? START_LAZY[product as GeneratorId]?.cover ?? START_PRESETS[product as GeneratorId]?.[0]?.id;
  return id ? `/presets/${product}/${id}.svg` : null;
}

const ENTRIES: Omit<CatalogueEntry, "picture">[] = [
  fromCatalog("hinge-box", "hinge", "hinge", "laser"),
  fromCatalog("letters", "letters", "letters", "laser"),
  fromCatalog("parametric", "parametric", "parametric", "laser"),
  fromGenerator("shadowbox", "paper", "Home"),
  fromGenerator("boxes", "laser", "Boxes"),
  fromGenerator("paperbox", "paper", "Boxes"),
  fromGenerator("sign", "laser", "Lettering"),
  fromGenerator("topper", "laser", "Lettering"),
  fromGenerator("charm", "laser", "Lettering"),
  fromGenerator("popup", "laser", "Home"),
  fromGenerator("clock", "laser", "Home"),
  fromGenerator("puzzle", "laser", "Games"),
  fromGenerator("qr", "engrave", "Tools"),
  fromGenerator("keyrack", "laser", "Home"),
  fromGenerator("tablenum", "laser", "Lettering"),
  fromGenerator("trophy", "laser", "Home"),
  {
    slug: "name-tunnel",
    name: "Name & logo tunnel",
    blurb: "Repeat a shape through the layers of a shadow box. Type words in the Words panel, or trace a picture on this device.",
    category: "Home",
    plan: "free",
    href: editor("shadowbox", "star-tunnel"),
    presetCount: null,
    presets: [
      { id: "star-tunnel", name: "Star tunnel", href: editor("shadowbox", "star-tunnel") },
      { id: "heart-tunnel", name: "Heart tunnel", href: editor("shadowbox", "heart-tunnel") },
      { id: "lotus-mandala", name: "Lotus mandala", href: editor("shadowbox", "lotus-mandala") },
    ],
    helpProduct: "shadowbox",
    process: "paper",
  },
  {
    slug: "photo-layers",
    name: "Layered art from a photo",
    blurb: "Turn a picture into stacked cut layers on this device. The photo is not uploaded.",
    category: "Home",
    plan: "free",
    href: editor("shadowbox"),
    presetCount: null,
    presets: [{ id: "photo", name: "Your picture", href: editor("shadowbox") }],
    helpProduct: "shadowbox",
    process: "paper",
  },
  {
    slug: "mandala",
    name: "Layered mandala",
    blurb: "Parametric mandala layers already in the Shadow Box: petals, rings and a frame you can change.",
    category: "Home",
    plan: "free",
    href: editor("shadowbox", "lotus-mandala"),
    presetCount: null,
    presets: [
      { id: "lotus-mandala", name: "Lotus mandala", href: editor("shadowbox", "lotus-mandala") },
      { id: "mini-mandala", name: "Mini mandala", href: editor("shadowbox", "mini-mandala") },
    ],
    helpProduct: "shadowbox",
    process: "paper",
  },
  {
    slug: "gift-box",
    name: "Gift box",
    blurb: "Finger-joint boxes with a lift-off, sliding or pin lid, sized from the inside.",
    category: "Boxes",
    plan: "free",
    href: editor("boxes", "keepsake"),
    presetCount: null,
    presets: [
      { id: "keepsake", name: "Keepsake box", href: editor("boxes", "keepsake") },
      { id: "wine-box", name: "Wine box", href: editor("boxes", "wine-box") },
      { id: "jewellery-box", name: "Jewellery box", href: editor("boxes", "jewellery-box") },
    ],
    helpProduct: "boxes",
    process: "laser",
  },
  {
    slug: "phone-stand",
    name: "Phone and tablet stand",
    blurb: "A slot-together stand with a lean angle, from the Boxes generator.",
    category: "Home",
    plan: "free",
    href: editor("boxes", "phone-stand"),
    presetCount: null,
    presets: [
      { id: "phone-stand", name: "Phone stand", href: editor("boxes", "phone-stand") },
      { id: "tablet-stand", name: "Tablet stand", href: editor("boxes", "tablet-stand") },
    ],
    helpProduct: "boxes",
    process: "laser",
  },
  {
    slug: "photo-frame",
    name: "Photo frame",
    blurb: "A frame with a photo slot, a stand or a hanger.",
    category: "Home",
    plan: "free",
    href: editor("boxes", "frame-10x15"),
    presetCount: null,
    presets: [
      { id: "frame-10x15", name: "Photo frame 10 × 15", href: editor("boxes", "frame-10x15") },
      { id: "frame-square", name: "Square wall frame", href: editor("boxes", "frame-square") },
    ],
    helpProduct: "boxes",
    process: "laser",
  },
  {
    slug: "organizer",
    name: "Desk organizer",
    blurb: "Trays with cross-halved dividers.",
    category: "Home",
    plan: "free",
    href: editor("boxes", "organiser"),
    presetCount: null,
    presets: [{ id: "organiser", name: "Drawer organiser", href: editor("boxes", "organiser") }],
    helpProduct: "boxes",
    process: "laser",
  },
  {
    slug: "engrave-prep",
    name: "Engrave prep",
    blurb: "Turn a photo into an engrave-ready picture in the Shadow Box photo look: Floyd–Steinberg, Jarvis, Atkinson, ordered or halftone. It stays on this device.",
    category: "Tools",
    plan: "free",
    href: editor("shadowbox"),
    presetCount: null,
    presets: [],
    helpProduct: "shadowbox",
    process: "engrave",
  },
  {
    slug: "earrings",
    name: "Earrings",
    blurb: "There is no separate earring generator. A mirrored pair is a small layered cut: start from a Shadow Box mandala or a Sign, then check the minimum width before you cut.",
    category: "Jewelry",
    plan: "free",
    href: editor("shadowbox", "mini-mandala"),
    presetCount: null,
    presets: [{ id: "mini-mandala", name: "Mini mandala", href: editor("shadowbox", "mini-mandala") }],
    helpProduct: "shadowbox",
    process: "laser",
  },
];

/** Every public generator card. Alias cards open an existing editor and preset. */
export const CATALOGUE: CatalogueEntry[] = ENTRIES.map((e) => ({ ...e, picture: e.slug === "photo-layers" || e.slug === "engrave-prep" ? null : pictureOf(e.href) }));

export const catalogueBySlug = (slug: string) => CATALOGUE.find((c) => c.slug === slug);

const COLLECTION_ENTRIES: { slug: string; name: string; blurb: string; href: string }[] = [
  { slug: "birthday", name: "Birthday", blurb: "Cake toppers and number signs.", href: editor("topper", "happy-birthday") },
  { slug: "wedding", name: "Wedding", blurb: "Names, table numbers and a heart tunnel.", href: editor("topper", "mr-mrs") },
  { slug: "eid", name: "Eid and Ramadan", blurb: "Greeting toppers and layered art.", href: editor("topper", "eid-mubarak") },
  { slug: "christmas", name: "Christmas", blurb: "Seasonal toppers and ornaments in the Shadow Box.", href: editor("topper", "merry-christmas") },
  { slug: "halloween", name: "Halloween", blurb: "Layered scenes in the Shadow Box.", href: editor("shadowbox", "rabbit-hole") },
  { slug: "baby", name: "Baby", blurb: "Shower toppers.", href: editor("topper", "baby-shower") },
];

/** Seasonal starting points, each with the picture of the preset it opens. */
export const COLLECTIONS: { slug: string; name: string; blurb: string; href: string; picture: string | null }[] =
  COLLECTION_ENTRIES.map((c) => ({ ...c, picture: pictureOf(c.href) }));

export const GRAPHICS: { id: string; name: string; src: string }[] = [
  { id: "star-tunnel", name: "Star tunnel", src: "/presets/shadowbox/star-tunnel.svg" },
  { id: "lotus-mandala", name: "Lotus mandala", src: "/presets/shadowbox/lotus-mandala.svg" },
  { id: "heart-tunnel", name: "Heart tunnel", src: "/presets/shadowbox/heart-tunnel.svg" },
  { id: "mini-mandala", name: "Mini mandala", src: "/presets/shadowbox/mini-mandala.svg" },
];

export const BOOKMARKS_KEY = "hingelab-bookmarks";
export const EXPORT_HISTORY_KEY = "hingelab-export-history";

export interface ExportHistoryItem { name: string; at: string }

export function readBookmarks(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOKMARKS_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function toggleBookmark(slug: string): string[] {
  const cur = readBookmarks();
  const next = cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug];
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next));
  return next;
}

export function readExportHistory(): ExportHistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(EXPORT_HISTORY_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((x) => x && typeof x.name === "string" && typeof x.at === "string").slice(0, 30);
  } catch {
    return [];
  }
}

export function recordExport(name: string): void {
  try {
    const next = [{ name, at: new Date().toISOString() }, ...readExportHistory()].slice(0, 30);
    localStorage.setItem(EXPORT_HISTORY_KEY, JSON.stringify(next));
  } catch { /* storage blocked */ }
}
