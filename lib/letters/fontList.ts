/**
 * The bundled fonts and their categories: plain data, so pickers and checks can list fonts without
 * loading the font parser (opentype.js, about 65 kB gzipped). Loading a font is in fonts.ts.
 */
export type FontScript = "latin" | "arabic";
export type FontCategory = "sans" | "rounded" | "serif" | "script" | "display" | "stencil" | "calligraphy";

export interface FontInfo {
  id: string;
  name: string;
  /** File name inside /fonts. */
  file: string;
  scripts: FontScript[];
  /** Short hint shown in the font picker. */
  note: string;
  category: FontCategory;
  /** Strokes too fine to cut out cleanly at small sizes: best engraved. */
  thin?: boolean;
}

export const FONT_CATEGORIES: { id: FontCategory; name: string }[] = [
  { id: "sans", name: "Sans" },
  { id: "rounded", name: "Rounded" },
  { id: "serif", name: "Serif" },
  { id: "script", name: "Script" },
  { id: "display", name: "Display" },
  { id: "stencil", name: "Stencil" },
  { id: "calligraphy", name: "Calligraphy" },
];

const L: FontScript[] = ["latin"];
const FA: FontScript[] = ["arabic", "latin"];

/** Bundled fonts, all SIL Open Font License (see public/fonts/licenses). Persian fonts cover Latin too. */
export const BUNDLED_FONTS: FontInfo[] = [
  { id: "fredoka", name: "Fredoka Bold", file: "Fredoka-Bold.ttf", scripts: L, category: "rounded", note: "Rounded, best for hinge boxes" },
  { id: "baloo2", name: "Baloo 2 ExtraBold", file: "Baloo2-ExtraBold.ttf", scripts: L, category: "rounded", note: "Rounded, heavy" },
  { id: "archivo-black", name: "Archivo Black", file: "ArchivoBlack-Regular.ttf", scripts: L, category: "sans", note: "Heavy grotesque" },
  { id: "anton", name: "Anton", file: "Anton-Regular.ttf", scripts: L, category: "sans", note: "Tall condensed" },
  { id: "bebas-neue", name: "Bebas Neue", file: "BebasNeue-Regular.ttf", scripts: L, category: "display", note: "Condensed capitals" },
  { id: "pacifico", name: "Pacifico", file: "Pacifico-Regular.ttf", scripts: L, category: "script", note: "Script, for solid letters" },
  { id: "vazirmatn", name: "Vazirmatn Black", file: "Vazirmatn-Black.ttf", scripts: FA, category: "sans", note: "Persian, heavy" },
  { id: "lalezar", name: "Lalezar", file: "Lalezar-Regular.ttf", scripts: FA, category: "display", note: "Persian display" },
  { id: "noto-sans-arabic", name: "Noto Sans Arabic Black", file: "NotoSansArabic-Black.ttf", scripts: ["arabic"], category: "sans", note: "Persian / Arabic sans" },
  { id: "noto-naskh-arabic", name: "Noto Naskh Arabic Bold", file: "NotoNaskhArabic-Bold.ttf", scripts: ["arabic"], category: "calligraphy", note: "Persian / Arabic naskh" },
  { id: "montserrat", name: "Montserrat ExtraBold", file: "Montserrat-ExtraBold.ttf", scripts: L, category: "sans", note: "Geometric, clean signs" },
  { id: "poppins", name: "Poppins Bold", file: "Poppins-Bold.ttf", scripts: L, category: "sans", note: "Round geometric" },
  { id: "josefin-sans", name: "Josefin Sans Bold", file: "JosefinSans-Bold.ttf", scripts: L, category: "sans", note: "Elegant vintage" },
  { id: "oswald", name: "Oswald Bold", file: "Oswald-Bold.ttf", scripts: L, category: "sans", note: "Condensed, fits long words" },
  { id: "nunito", name: "Nunito Black", file: "Nunito-Black.ttf", scripts: L, category: "rounded", note: "Soft and friendly" },
  { id: "comfortaa", name: "Comfortaa Bold", file: "Comfortaa-Bold.ttf", scripts: L, category: "rounded", note: "Rounded, airy" },
  { id: "lilita-one", name: "Lilita One", file: "LilitaOne-Regular.ttf", scripts: L, category: "rounded", note: "Chunky, great cut out" },
  { id: "alfa-slab-one", name: "Alfa Slab One", file: "AlfaSlabOne-Regular.ttf", scripts: L, category: "serif", note: "Heavy slab serif" },
  { id: "abril-fatface", name: "Abril Fatface", file: "AbrilFatface-Regular.ttf", scripts: L, category: "serif", note: "Bold fashion serif" },
  { id: "playfair-display", name: "Playfair Display Black", file: "PlayfairDisplay-Black.ttf", scripts: L, category: "serif", note: "Classic high contrast" },
  { id: "merriweather", name: "Merriweather Black", file: "Merriweather-Black.ttf", scripts: L, category: "serif", note: "Sturdy book serif" },
  { id: "cinzel", name: "Cinzel Bold", file: "Cinzel-Bold.ttf", scripts: L, category: "serif", note: "Roman capitals, formal" },
  { id: "lobster", name: "Lobster", file: "Lobster-Regular.ttf", scripts: L, category: "script", note: "Bold joined script" },
  { id: "dancing-script", name: "Dancing Script Bold", file: "DancingScript-Bold.ttf", scripts: L, category: "script", note: "Lively joined script" },
  { id: "kaushan-script", name: "Kaushan Script", file: "KaushanScript-Regular.ttf", scripts: L, category: "script", note: "Brush script" },
  { id: "courgette", name: "Courgette", file: "Courgette-Regular.ttf", scripts: L, category: "script", note: "Friendly script" },
  { id: "caveat-brush", name: "Caveat Brush", file: "CaveatBrush-Regular.ttf", scripts: L, category: "script", note: "Handwritten marker" },
  { id: "great-vibes", name: "Great Vibes", file: "GreatVibes-Regular.ttf", scripts: L, category: "script", note: "Wedding script", thin: true },
  { id: "alex-brush", name: "Alex Brush", file: "AlexBrush-Regular.ttf", scripts: L, category: "script", note: "Calligraphy pen", thin: true },
  { id: "sacramento", name: "Sacramento", file: "Sacramento-Regular.ttf", scripts: L, category: "script", note: "Monoline script", thin: true },
  { id: "righteous", name: "Righteous", file: "Righteous-Regular.ttf", scripts: L, category: "display", note: "Retro display" },
  { id: "bangers", name: "Bangers", file: "Bangers-Regular.ttf", scripts: L, category: "display", note: "Comic book capitals" },
  { id: "amatic-sc", name: "Amatic SC Bold", file: "AmaticSC-Bold.ttf", scripts: L, category: "display", note: "Hand-drawn capitals", thin: true },
  { id: "black-ops-one", name: "Black Ops One", file: "BlackOpsOne-Regular.ttf", scripts: L, category: "stencil", note: "Military stencil look" },
  { id: "stardos-stencil", name: "Stardos Stencil Bold", file: "StardosStencil-Bold.ttf", scripts: L, category: "stencil", note: "Stencil serif, middles stay in" },
  { id: "allerta-stencil", name: "Allerta Stencil", file: "AllertaStencil-Regular.ttf", scripts: L, category: "stencil", note: "Stencil sans, middles stay in" },
  { id: "vazirmatn-bold", name: "Vazirmatn Bold", file: "Vazirmatn-Bold.ttf", scripts: FA, category: "sans", note: "Persian sans" },
  { id: "vazirmatn-regular", name: "Vazirmatn Regular", file: "Vazirmatn-Regular.ttf", scripts: FA, category: "sans", note: "Persian sans, light", thin: true },
  { id: "noto-kufi-arabic", name: "Noto Kufi Arabic Black", file: "NotoKufiArabic-Black.ttf", scripts: FA, category: "sans", note: "Heavy kufi, cuts well" },
  { id: "baloo-bhaijaan", name: "Baloo Bhaijaan ExtraBold", file: "BalooBhaijaan2-ExtraBold.ttf", scripts: FA, category: "rounded", note: "Persian, rounded and heavy" },
  { id: "lemonada", name: "Lemonada Bold", file: "Lemonada-Bold.ttf", scripts: FA, category: "rounded", note: "Persian, rounded and playful" },
  { id: "markazi-text", name: "Markazi Text Bold", file: "MarkaziText-Bold.ttf", scripts: FA, category: "serif", note: "Persian book serif" },
  { id: "jomhuria", name: "Jomhuria", file: "Jomhuria-Regular.ttf", scripts: FA, category: "display", note: "Persian display, very heavy" },
  { id: "katibeh", name: "Katibeh", file: "Katibeh-Regular.ttf", scripts: FA, category: "display", note: "Persian display, angular" },
  { id: "rakkas", name: "Rakkas", file: "Rakkas-Regular.ttf", scripts: FA, category: "display", note: "Persian, bold display" },
  { id: "el-messiri", name: "El Messiri Bold", file: "ElMessiri-Bold.ttf", scripts: FA, category: "display", note: "Persian, modern" },
  { id: "reem-kufi", name: "Reem Kufi Bold", file: "ReemKufi-Bold.ttf", scripts: FA, category: "display", note: "Geometric kufi" },
  { id: "noto-nastaliq", name: "Noto Nastaliq Bold", file: "NotoNastaliqUrdu-Bold.ttf", scripts: FA, category: "calligraphy", note: "Nastaliq" },
  { id: "mirza", name: "Mirza Bold", file: "Mirza-Bold.ttf", scripts: FA, category: "calligraphy", note: "Persian calligraphic" },
  { id: "amiri", name: "Amiri Bold", file: "Amiri-Bold.ttf", scripts: FA, category: "calligraphy", note: "Classic naskh" },
  { id: "aref-ruqaa", name: "Aref Ruqaa Bold", file: "ArefRuqaa-Bold.ttf", scripts: FA, category: "calligraphy", note: "Ruqaa" },
];

export const fontInfo = (id: string) => BUNDLED_FONTS.find(f => f.id === id);
