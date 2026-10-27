/** Generator ids and the little the shell needs before a generator's code loads. */
export const GENERATOR_IDS = ["photoproduct", "clock", "puzzle", "qr", "boxes", "topper", "keyrack", "sign", "tablenum", "trophy", "shadowbox", "paperbox", "keychain", "popup", "charm", "family"] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

export const isGeneratorId = (v: unknown): v is GeneratorId => typeof v === "string" && (GENERATOR_IDS as readonly string[]).includes(v);

export interface GeneratorInfo {
  name: string;
  blurb: string;
  /** Lucide icon name, resolved by the shell. */
  icon: "clock" | "puzzle" | "qr" | "box" | "cake" | "key" | "sign" | "hash" | "trophy" | "layers" | "ruler" | "tag";
  /** Autosave key on this device. */
  storageKey: string;
}

export const GENERATOR_INFO: Record<GeneratorId, GeneratorInfo> = {
  photoproduct: { name: "Photo to Product", blurb: "Analyze 1–5 product photos and create an editable 3D model with cutting files, dimensions and explicit assumptions.", icon: "layers", storageKey: "hingelab-gen-photoproduct-v1" },
  clock: { name: "Clock", blurb: "Wall and desk clocks with numerals, hands and a hole for a standard quartz movement.", icon: "clock", storageKey: "hingelab-gen-clock-v1" },
  puzzle: { name: "Puzzle", blurb: "Jigsaw puzzles in any shape with classic or kids tabs, a frame or tray, and a picture engraved on top.", icon: "puzzle", storageKey: "hingelab-gen-puzzle-v1" },
  qr: { name: "QR Code", blurb: "Scannable plates, keychains, coasters, Wi-Fi cards and paint stencils for links, Wi-Fi, contacts and more.", icon: "qr", storageKey: "hingelab-gen-qr-v1" },
  boxes: { name: "Boxes", blurb: "Finger-jointed boxes, trays with dividers, desk signs, photo frames, phone stands, key holders and bird houses.", icon: "box", storageKey: "hingelab-gen-boxes-v1" },
  topper: { name: "Cake Topper", blurb: "Cake toppers and cupcake picks for birthdays, weddings, Eid and more: welded script, mirror layers and a library of motifs.", icon: "cake", storageKey: "hingelab-gen-topper-v1" },
  keyrack: { name: "Key Holder", blurb: "Wall key holders in 18 shapes with slot-in hooks, dowel pegs or cup hooks, names above each hook and an optional shelf.", icon: "key", storageKey: "hingelab-gen-keyrack-v1" },
  sign: { name: "Sign", blurb: "Wall, door, shop and desk signs in wood, acrylic or both: engraved, layered lettering, cut-out words, flush inlays, neon-look acrylic or paint stencils, with frames and stands.", icon: "sign", storageKey: "hingelab-gen-sign-v1" },
  tablenum: { name: "Table Numbers", blurb: "A whole set of table numbers in one file: stands in slotted bases, living-hinge tent cards or plaques, with labels and names.", icon: "hash", storageKey: "hingelab-gen-tablenum-v1" },
  trophy: { name: "Trophy", blurb: "Awards that stand up: a star, cup, shield, medal, flame, laurel or motif with a name plate, slotted into a stepped base in wood, acrylic or both.", icon: "trophy", storageKey: "hingelab-gen-trophy-v1" },
  paperbox: { name: "Wood Packaging", blurb: "Gift, product and shipping boxes in plywood with finger joints: lift-off, sliding and hinged lids, drawer boxes, hexagon boxes, trays and inserts, with your brand engraved on the lid.", icon: "box", storageKey: "hingelab-gen-paperbox-v1" },
  shadowbox: { name: "Shadow Box", blurb: "Layered 3D paper-cut art from geometric patterns or your own picture, for a Cricut or a laser, with over a hundred ready-made designs.", icon: "layers", storageKey: "hingelab-gen-shadowbox-v1" },
  family: { name: "Family Names", blurb: "A list of names made into one piece: a name crossword, a tree of names, a name snowflake, a ring round a word, a split monogram or letter bunting.", icon: "tag", storageKey: "hingelab-gen-family-v1" },
  charm: { name: "Name Charms", blurb: "Personalised ornaments, keychains, earrings, bag tags, drink markers, place cards and gift tags, one per name on your list, with holes that keep their wall.", icon: "tag", storageKey: "hingelab-gen-charm-v1" },
  popup: { name: "Pop-up", blurb: "One flat piece that lifts into a bowl, basket, tree, lampshade or ornament.", icon: "layers", storageKey: "hingelab-gen-popup-v1" },
  keychain: { name: "Keychain", blurb: "Personalized name keychains, pet tags and charms with shapes, motifs, raised lettering and reinforced ring tabs.", icon: "key", storageKey: "hingelab-gen-keychain-v1" },
};
