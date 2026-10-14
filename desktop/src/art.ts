/**
 * Preset pictures for the desktop products: the same small renders the website shows, bundled with
 * the app because the window's CSP only allows local images. Pictures only, no geometry code.
 */
import type { DProduct } from "../../lib/desktop/types";

const FILES = import.meta.glob<string>("../../public/presets/{hinge,clock,puzzle,qr,boxes,topper,keyrack,sign,tablenum,trophy,shadowbox}/*.svg", { query: "?url", import: "default", eager: true });

export const presetArt = (product: string, preset: string): string | undefined => FILES[`../../public/presets/${product}/${preset}.svg`];

/** Pictures for the editors that only exist online (they open inside the window). */
const ONLINE = import.meta.glob<string>("../../public/presets/{letters/hello-sign,parametric/head-stack,boxes/organiser,sign/layered-name}.svg", { query: "?url", import: "default", eager: true });
export const onlineArt = (product: string, preset: string): string | undefined => ONLINE[`../../public/presets/${product}/${preset}.svg`];

const FEATURED: Record<string, string[]> = {
  hinge: ["wave-box", "hex-jewel", "card-box"],
  clock: ["sunburst", "station", "gear"],
  puzzle: ["heart-24", "round-36", "kids-12"],
  qr: ["coaster", "wifi-card", "table-sign"],
  boxes: ["bird-house", "phone-stand", "organiser"],
  topper: ["happy-birthday", "mr-mrs", "eid-mubarak"],
  keyrack: ["home-sweet-home", "house-hooks", "family-keys"],
  sign: ["welcome-arch", "layered-name", "cafe-hanging"],
  tablenum: ["wedding-arch", "number-stand", "round-acrylic"],
  trophy: ["star-award", "champion-cup", "medal-acrylic"],
  shadowbox: ["star-tunnel", "lotus-mandala", "mountain-range"],
};

/** The picture that stands for a product. */
export function productArt(p: Pick<DProduct, "id" | "presets">): string | undefined {
  for (const id of [...(FEATURED[p.id] ?? []), ...p.presets.map((x) => x.id)]) {
    const src = presetArt(p.id, id);
    if (src) return src;
  }
  return undefined;
}

/** A few presets from every product, alternating, for the dashboard. */
export function showcase(products: DProduct[], count: number) {
  const picks: { product: DProduct; preset: DProduct["presets"][number]; src: string }[] = [];
  const queues = products.map((p) => {
    const order = [...(FEATURED[p.id] ?? []).slice(1), ...p.presets.map((x) => x.id)];
    return [...new Set(order)].flatMap((id) => {
      const preset = p.presets.find((x) => x.id === id);
      const src = presetArt(p.id, id);
      return preset && src ? [{ product: p, preset, src }] : [];
    });
  });
  for (let round = 0; picks.length < count && queues.some((q) => q.length > round); round++) {
    for (const q of queues) if (q[round] && picks.length < count) picks.push(q[round]);
  }
  return picks;
}
