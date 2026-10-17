/**
 * AI Studio recipes: ready designs that fill in a prompt, pick a style, and say what happens to the
 * picture after it is made (traced, engraved, or sent to a generator). The user only names the
 * subject, plus any words for the piece: those are set afterwards as real text in the Studio's fonts,
 * because image models draw letters badly.
 */
import type { BriefProduct } from "./request";
import type { StyleId } from "./styles";

export type KitTarget = "canvas" | "topper" | "sign" | "trophy" | "lamp" | "puzzle" | "relief";

export type KitCategory = "Celebrations" | "Weddings" | "Kids" | "Home decor" | "Persian and Nowruz" | "Business" | "Pets" | "Holidays";

/** A line of real text the recipe adds after the picture. */
export interface KitField {
  key: string;
  label: string;
  placeholder: string;
}

export interface DesignKit {
  id: string;
  name: string;
  blurb: string;
  category: KitCategory;
  /** What the user types, e.g. "your dog's breed". */
  ask: string;
  placeholder: string;
  /** The prompt, with {x} where the user's words go. */
  prompt: string;
  style: StyleId;
  /** How many variations to make. */
  count: 1 | 2 | 3 | 4;
  /** Width on the material, mm. */
  widthMm: number;
  then: "vectorize" | "engrave" | "layers";
  target: KitTarget;
  /** The Laser Brief product the recipe makes. */
  product?: BriefProduct;
  /** Words to set as real text under the picture, and the font for them. */
  fields?: KitField[];
  font?: string;
}

const NAME: KitField = { key: "text", label: "Name or words", placeholder: "Sara & Ali" };
const DATE: KitField = { key: "date", label: "Date (optional)", placeholder: "21.03.2027" };

export const KIT_CATEGORIES: KitCategory[] = ["Celebrations", "Weddings", "Kids", "Home decor", "Persian and Nowruz", "Business", "Pets", "Holidays"];

export const DESIGN_KITS: DesignKit[] = [
  // Celebrations
  { id: "topper", name: "Cake topper", blurb: "A welded silhouette on a stake", category: "Celebrations", ask: "What is it for?", placeholder: "30th birthday with balloons",
    prompt: "Cake topper silhouette for {x}", style: "silhouette", count: 2, widthMm: 140, then: "vectorize", target: "topper", product: "topper" },
  { id: "birthday-sign", name: "Birthday sign", blurb: "Party motif with the name in real letters", category: "Celebrations", ask: "Theme", placeholder: "balloons and confetti",
    prompt: "Festive birthday motif: {x}, framing an empty space in the middle", style: "flat", count: 2, widthMm: 300, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Name", placeholder: "Happy birthday Mia" }], font: "lilita-one" },
  { id: "graduation", name: "Graduation plaque", blurb: "Cap, laurel and a name", category: "Celebrations", ask: "Field of study", placeholder: "medicine",
    prompt: "Graduation emblem for {x}: mortarboard cap, laurel wreath and a scroll, symmetric", style: "line-art", count: 2, widthMm: 180, then: "vectorize", target: "sign", product: "sign",
    fields: [NAME, DATE], font: "cinzel" },
  { id: "anniversary", name: "Anniversary frame", blurb: "Two hearts and a date", category: "Celebrations", ask: "What do they love?", placeholder: "travel and mountains",
    prompt: "Romantic anniversary ornament inspired by {x}, two intertwined hearts, room for a date below", style: "line-art", count: 2, widthMm: 200, then: "vectorize", target: "canvas", product: "wall-art",
    fields: [NAME, DATE], font: "great-vibes" },
  // Weddings
  { id: "wedding-topper", name: "Wedding topper", blurb: "Couple silhouette for the cake", category: "Weddings", ask: "The couple", placeholder: "bride and groom dancing",
    prompt: "Elegant wedding cake topper silhouette of {x}", style: "silhouette", count: 3, widthMm: 150, then: "vectorize", target: "topper", product: "topper" },
  { id: "wedding-welcome", name: "Wedding welcome sign", blurb: "Floral frame with names", category: "Weddings", ask: "Flowers or theme", placeholder: "eucalyptus and roses",
    prompt: "Wedding welcome sign frame of {x}, a wreath around a large empty centre", style: "botanical", count: 2, widthMm: 400, then: "vectorize", target: "sign", product: "sign",
    fields: [NAME, DATE], font: "great-vibes" },
  { id: "place-cards", name: "Place card motif", blurb: "Small motif for table names", category: "Weddings", ask: "Motif", placeholder: "olive branch",
    prompt: "Small delicate motif: {x}", style: "one-line", count: 2, widthMm: 50, then: "vectorize", target: "canvas", product: "ornament" },
  { id: "wedding-card-box", name: "Card box lid", blurb: "Ornament for a card box lid", category: "Weddings", ask: "Theme", placeholder: "lace and doves",
    prompt: "Lid ornament for a wedding card box: {x}, rectangular composition with a margin", style: "kirigami", count: 2, widthMm: 180, then: "vectorize", target: "canvas", product: "box-lid",
    fields: [NAME], font: "dancing-script" },
  // Kids
  { id: "kids-puzzle", name: "Kids' puzzle picture", blurb: "A bright scene engraved on a puzzle", category: "Kids", ask: "What scene?", placeholder: "dinosaurs in a jungle",
    prompt: "Bright friendly children's illustration of {x}", style: "flat", count: 2, widthMm: 280, then: "engrave", target: "puzzle", product: "puzzle" },
  { id: "name-plaque", name: "Kids' name plaque", blurb: "Cute animal and the child's name", category: "Kids", ask: "Favourite animal", placeholder: "a sleepy fox",
    prompt: "Cute {x} for a children's room, simple bold shapes, room for a name beside it", style: "sticker", count: 2, widthMm: 250, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Child's name", placeholder: "Leo" }], font: "fredoka" },
  { id: "growth-chart", name: "Growth chart art", blurb: "A tall animal for a height ruler", category: "Kids", ask: "Which animal?", placeholder: "a giraffe",
    prompt: "Tall friendly {x} standing upright, simple line art for a children's height chart", style: "line-art", count: 2, widthMm: 200, then: "vectorize", target: "canvas", product: "wall-art" },
  { id: "night-light", name: "Night light panel", blurb: "Lamp perforations for a child's room", category: "Kids", ask: "Motif", placeholder: "stars, moons and clouds",
    prompt: "One small simple motif: {x}", style: "silhouette", count: 2, widthMm: 35, then: "vectorize", target: "lamp", product: "lamp" },
  // Home decor
  { id: "mandala-set", name: "Mandala coaster set", blurb: "Four matching mandalas to cut", category: "Home decor", ask: "Theme", placeholder: "ocean waves and shells",
    prompt: "Round mandala with a {x} theme", style: "mandala", count: 4, widthMm: 95, then: "vectorize", target: "canvas", product: "coaster" },
  { id: "layered-art", name: "Layered wall art", blurb: "A scene split into stacked layers", category: "Home decor", ask: "Which scene?", placeholder: "mountains at sunrise",
    prompt: "Layered landscape: {x}", style: "layered", count: 1, widthMm: 250, then: "layers", target: "canvas", product: "shadowbox" },
  { id: "lamp", name: "Lantern pattern", blurb: "A motif repeated as lamp perforations", category: "Home decor", ask: "Which motif?", placeholder: "small stars and moons",
    prompt: "One small simple motif: {x}", style: "silhouette", count: 2, widthMm: 40, then: "vectorize", target: "lamp", product: "lamp" },
  { id: "botanical-print", name: "Botanical wall print", blurb: "Fine plant engraving", category: "Home decor", ask: "Which plant?", placeholder: "monstera leaf",
    prompt: "Botanical study of a {x}", style: "botanical", count: 2, widthMm: 210, then: "engrave", target: "canvas", product: "wall-art" },
  { id: "topo-map", name: "Topographic art", blurb: "Contour lines of a landscape", category: "Home decor", ask: "Landscape", placeholder: "a volcano island",
    prompt: "Topographic contour map of {x}", style: "topographic", count: 2, widthMm: 300, then: "vectorize", target: "canvas", product: "wall-art" },
  { id: "geometric-animal", name: "Geometric animal", blurb: "Low-poly wall piece", category: "Home decor", ask: "Which animal?", placeholder: "a deer head",
    prompt: "Low-poly {x}, facing forward", style: "low-poly", count: 2, widthMm: 300, then: "vectorize", target: "canvas", product: "wall-art" },
  // Persian and Nowruz
  { id: "nowruz-haftsin", name: "Nowruz Haft-sin plaque", blurb: "Haft-sin motifs with a greeting", category: "Persian and Nowruz", ask: "Which motifs?", placeholder: "goldfish, sabzeh and hyacinth",
    prompt: "Persian Nowruz Haft-sin illustration with {x}, eslimi ornament around an empty centre", style: "eslimi", count: 2, widthMm: 250, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Greeting", placeholder: "نوروز مبارک" }], font: "noto-nastaliq" },
  { id: "girih-panel", name: "Girih screen panel", blurb: "Persian geometric lattice", category: "Persian and Nowruz", ask: "Mood", placeholder: "ten-point stars like Isfahan tiles",
    prompt: "Square Persian girih lattice panel: {x}", style: "girih", count: 2, widthMm: 300, then: "vectorize", target: "canvas", product: "wall-art" },
  { id: "calligraphy-frame", name: "Calligraphy frame", blurb: "Ornamental frame with your verse", category: "Persian and Nowruz", ask: "Frame motifs", placeholder: "pomegranates and vines",
    prompt: "Ornamental calligraphy frame with {x}", style: "calligraphy-panel", count: 2, widthMm: 300, then: "vectorize", target: "canvas", product: "wall-art",
    fields: [{ key: "text", label: "Verse or name", placeholder: "خانه‌ی ما" }], font: "noto-nastaliq" },
  { id: "persian-coaster", name: "Persian coaster set", blurb: "Four eslimi coasters", category: "Persian and Nowruz", ask: "Flower", placeholder: "Persian rose",
    prompt: "Round eslimi medallion with a {x} at its heart", style: "eslimi", count: 4, widthMm: 95, then: "vectorize", target: "canvas", product: "coaster" },
  { id: "yalda", name: "Yalda night sign", blurb: "Pomegranate and poetry", category: "Persian and Nowruz", ask: "Motifs", placeholder: "pomegranates, watermelon and a candle",
    prompt: "Yalda night illustration with {x}, framing an empty space in the middle", style: "woodcut", count: 2, widthMm: 250, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Words", placeholder: "یلدا مبارک" }], font: "lalezar" },
  // Business
  { id: "door-sign", name: "Door sign motif", blurb: "Line motif for a house or shop sign", category: "Business", ask: "What should it show?", placeholder: "a coffee cup with steam",
    prompt: "{x}, simple and bold, readable from a distance", style: "line-art", count: 2, widthMm: 120, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Shop or house name", placeholder: "Bean & Leaf" }], font: "montserrat" },
  { id: "logo-badge", name: "Badge emblem", blurb: "A round badge for a brand", category: "Business", ask: "What does the business do?", placeholder: "a bakery",
    prompt: "Round vintage badge emblem for {x}, a central icon inside a ring with empty space for a name", style: "woodcut", count: 3, widthMm: 120, then: "vectorize", target: "canvas", product: "sign",
    fields: [{ key: "text", label: "Business name", placeholder: "Golden Crust" }], font: "alfa-slab-one" },
  { id: "trophy", name: "Trophy emblem", blurb: "A cut-out emblem for the Trophy generator", category: "Business", ask: "Which sport or prize?", placeholder: "football",
    prompt: "Emblem for a {x} award: one bold solid shape", style: "silhouette", count: 2, widthMm: 110, then: "vectorize", target: "trophy", product: "trophy" },
  { id: "keychain-merch", name: "Keychain merch", blurb: "Small bold shapes to sell", category: "Business", ask: "Subject", placeholder: "a cactus",
    prompt: "Tiny bold {x} for a keychain", style: "sticker", count: 4, widthMm: 45, then: "vectorize", target: "canvas", product: "keychain" },
  // Pets
  { id: "pet-coaster", name: "Pet portrait coaster", blurb: "Photo-style engraving on a 90 mm round", category: "Pets", ask: "Which animal?", placeholder: "golden retriever puppy",
    prompt: "Head-and-shoulders portrait of a {x}, facing the viewer", style: "hatch", count: 2, widthMm: 90, then: "engrave", target: "canvas", product: "coaster" },
  { id: "pet-memorial", name: "Pet memorial plaque", blurb: "A gentle portrait and a name", category: "Pets", ask: "Which animal?", placeholder: "a tabby cat",
    prompt: "Gentle one-line portrait of a {x} with a small halo of stars", style: "one-line", count: 2, widthMm: 150, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Pet's name", placeholder: "Milo" }, DATE], font: "dancing-script" },
  { id: "pet-tag", name: "Pet bowl sign", blurb: "Paw and bone motif with a name", category: "Pets", ask: "Animal", placeholder: "a dachshund",
    prompt: "Playful {x} silhouette with a bone and paw prints", style: "silhouette", count: 2, widthMm: 160, then: "vectorize", target: "sign", product: "sign",
    fields: [{ key: "text", label: "Pet's name", placeholder: "Bella" }], font: "lilita-one" },
  // Holidays
  { id: "xmas-ornament", name: "Tree ornament set", blurb: "Four hanging ornaments", category: "Holidays", ask: "Theme", placeholder: "snowflakes and reindeer",
    prompt: "Round hanging ornament: {x}, lace-like, connected", style: "kirigami", count: 4, widthMm: 80, then: "vectorize", target: "canvas", product: "ornament" },
  { id: "halloween", name: "Halloween lantern", blurb: "Spooky lamp perforations", category: "Holidays", ask: "Motif", placeholder: "bats and little ghosts",
    prompt: "One small spooky motif: {x}", style: "silhouette", count: 2, widthMm: 40, then: "vectorize", target: "lamp", product: "lamp" },
  { id: "ramadan", name: "Ramadan lantern panel", blurb: "Crescents and arabesques", category: "Holidays", ask: "Motifs", placeholder: "crescent moon and fanous lanterns",
    prompt: "Islamic arabesque panel with {x}", style: "eslimi", count: 2, widthMm: 200, then: "vectorize", target: "canvas", product: "wall-art" },
];

export const kitById = (id: string) => DESIGN_KITS.find((k) => k.id === id);

export const kitPrompt = (k: DesignKit, words: string) => k.prompt.replace("{x}", words.trim() || k.placeholder);

/** Persian or Arabic letters, which need a right-to-left font. */
export const isRtl = (s: string) => /[\u0600-\u06ff]/u.test(s);

/** The font for a recipe's words: the recipe's, or a Persian one when the words are Persian. */
export function kitFont(k: DesignKit | undefined, words: string): string {
  if (isRtl(words)) return k?.font && ["noto-nastaliq", "lalezar", "vazirmatn", "mirza", "amiri"].includes(k.font) ? k.font : "vazirmatn";
  return k?.font && !["noto-nastaliq", "lalezar"].includes(k.font) ? k.font : "montserrat";
}
