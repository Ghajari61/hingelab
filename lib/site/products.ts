/** Every product the site offers, for the landing page and the header's Products menu. */
import { GENERATOR_IDS, GENERATOR_INFO, type GeneratorInfo } from "@/lib/generators/ids";
import { GENERATOR_PRESETS } from "@/lib/generators/presets";
import { HINGE_PRESETS } from "@/lib/hinge/presets";
import { LETTER_PRESETS } from "@/lib/letters/presets";
import { PARAMETRIC_PRESETS } from "@/lib/parametric/presets";

export type SiteIcon = GeneratorInfo["icon"] | "hinge" | "letters" | "parametric";

export interface SiteProduct {
  id: string;
  name: string;
  blurb: string;
  icon: SiteIcon;
  /** Opens the editor on this product. */
  href: string;
  /** A preset picture (public/presets). */
  picture: string;
  presets: number;
}

const FEATURED: Record<string, string> = {
  hinge: "gift-box", letters: "hello-sign", parametric: "head-stack",
  clock: "wall-roman", puzzle: "kids-12", qr: "keychain", boxes: "organiser",
};

const pic = (id: string, ids: string[]) => `/presets/${id}/${ids.includes(FEATURED[id]) ? FEATURED[id] : ids[0]}.svg`;

export function siteProducts(): SiteProduct[] {
  const core: SiteProduct[] = [
    { id: "hinge", name: "Hinge Box", blurb: "Living-hinge boxes in rounded, pill, polygon and cylinder shapes, with a bend check.", icon: "hinge", href: "/app/editor/local?p=hinge", picture: pic("hinge", HINGE_PRESETS.map((p) => p.id)), presets: HINGE_PRESETS.length },
    { id: "letters", name: "Letters", blurb: "Letter boxes, solid name signs and stencils from any text and font, Persian included.", icon: "letters", href: "/app/editor/local?p=letters", picture: pic("letters", LETTER_PRESETS.map((p) => p.id)), presets: LETTER_PRESETS.length },
    { id: "parametric", name: "Parametric", blurb: "Sliced sculptures from 3D files, photos or text: fins, stacks, waffles and papercraft.", icon: "parametric", href: "/app/editor/local?p=parametric", picture: pic("parametric", PARAMETRIC_PRESETS.map((p) => p.id)), presets: PARAMETRIC_PRESETS.length },
  ];
  const gens: SiteProduct[] = GENERATOR_IDS.map((id) => {
    const list = GENERATOR_PRESETS[id];
    return { id, name: GENERATOR_INFO[id].name, blurb: GENERATOR_INFO[id].blurb, icon: GENERATOR_INFO[id].icon, href: `/app/editor/local?p=${id}`, picture: pic(id, list.map((p) => p.id)), presets: list.length };
  });
  return [...core, ...gens];
}

export const totalPresets = () => siteProducts().reduce((n, p) => n + p.presets, 0);
