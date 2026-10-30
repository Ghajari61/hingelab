import type { GenPreset } from "../types";
import type { CharmParams } from "./params";

const FAMILY = "Olivia\nNoah\nAva\nLiam\nMum\nDad";

export const CHARM_PRESETS: GenPreset<CharmParams>[] = [
  { id: "studio-star-names", name: "Star name ornaments", note: "Wooden stars with each name engraved and a scored frame.", params: { name: "Star name ornaments", kind: { kind: "ornament" }, names: { list: "Ella\nJack\nMia", fontId: "fredoka", size: 12 }, shape: { kind: "star", width: 80, height: 78, margin: 4, frame: true }, hang: { kind: "hole", side: "top", hole: 3.5, wall: 2.5 } } },
  { id: "studio-script-keychains", name: "Script name keychains", note: "Connected script names in acrylic with a ring loop.", params: { name: "Script name keychains", kind: { kind: "keychain" }, material: "acr3", T: 3, K: 0.1, names: { list: "Ruby\nOscar", fontId: "pacifico", size: 15 }, style: { kind: "letters", weld: 1, backing: 0 }, hang: { kind: "loop", side: "left", hole: 5, wall: 3 } } },
  { id: "studio-snowman-tags", name: "Snowman stocking tags", note: "Snowmen in bobble hats with the hat and nose cut to paint.", params: { name: "Snowman stocking tags", kind: { kind: "gifttag" }, names: { list: "Leo\nIvy", fontId: "pacifico", size: 12 }, shape: { kind: "snowman", width: 60, height: 96, margin: 2, hat: "beanie", paint: true }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } } },
  // ---- ornaments
  {
    id: "family-baubles", name: "Family name baubles", note: "A bauble for everyone, names engraved under a snowflake",
    params: { name: "Family baubles", kind: { kind: "ornament" }, names: { list: FAMILY, fontId: "pacifico", size: 13 }, shape: { kind: "bauble", width: 70, height: 82, margin: 5, frame: true }, accent: { kind: "snowflake", place: "above", size: 14 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 } },
  },
  {
    id: "star-ornaments", name: "Star ornaments", note: "Five-point stars with each name scored in the middle",
    params: { name: "Star ornaments", kind: { kind: "ornament" }, names: { list: "Ella\nJack\nMia\nLeo", fontId: "fredoka", size: 12 }, style: { kind: "engrave" }, shape: { kind: "star", width: 85, height: 82, margin: 4, frame: false }, hang: { kind: "hole", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "first-christmas", name: "Baby's first Christmas", note: "Round ornament with the name and year",
    params: { name: "First Christmas", kind: { kind: "ornament" }, names: { list: "Baby Ava", fontId: "pacifico", size: 13, sub: "First Christmas 2026", subSize: 40 }, shape: { kind: "scalloped", width: 80, height: 80, margin: 6, frame: true }, accent: { kind: "star", place: "above", size: 12 } },
  },
  {
    id: "tree-ornaments", name: "Christmas tree ornaments", note: "Tree silhouettes with a name across each",
    params: { name: "Tree ornaments", kind: { kind: "ornament" }, names: { list: "Sophie\nOscar\nGrace", fontId: "fredoka", size: 10 }, shape: { kind: "motif", motif: "tree", width: 70, height: 85, margin: 3, frame: false }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "snowflake-ornaments", name: "Snowflake name ornaments", note: "Snowflakes with a cut-through name plate in the middle",
    params: { name: "Snowflake ornaments", kind: { kind: "ornament" }, names: { list: "Lily\nMax\nZoe", fontId: "archivo-black", size: 9 }, style: { kind: "engrave" }, shape: { kind: "motif", motif: "snowflake", width: 85, height: 85, margin: 6, frame: false }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "pet-paw", name: "Pet paw ornament", note: "Paw silhouette with the pet's name and year",
    params: { name: "Pet ornament", kind: { kind: "ornament" }, names: { list: "Buddy\nLuna", fontId: "fredoka", size: 10, sub: "2026", subSize: 55 }, shape: { kind: "motif", motif: "paw", width: 75, height: 75, margin: 3, frame: false }, hang: { kind: "loop", side: "top", hole: 4, wall: 3 } },
  },
  {
    id: "dog-bone", name: "Dog bone ornaments", note: "Bone shapes for the dogs of the family",
    params: { name: "Dog bones", kind: { kind: "ornament" }, names: { list: "Rocky\nBella\nCharlie", fontId: "archivo-black", size: 12 }, shape: { kind: "bone", width: 90, height: 40, margin: 3, frame: true }, hang: { kind: "hole", side: "left", hole: 4, wall: 3 } },
  },
  {
    id: "heart-ornaments", name: "Valentine heart ornaments", note: "Hearts with two names and a date",
    params: { name: "Heart ornaments", kind: { kind: "ornament" }, names: { list: "Sam & Alex", fontId: "great-vibes", size: 16, sub: "14 February 2026", subFontId: "playfair-display", subSize: 35 }, textStyle: { bold: 0.25 }, shape: { kind: "heart", width: 80, height: 72, margin: 7, frame: true }, hang: { kind: "hole", side: "top", hole: 3.5, wall: 3 } },
  },
  {
    id: "eid-lanterns", name: "Eid lantern ornaments", note: "Lantern silhouettes for the Eid tree, names engraved",
    params: { name: "Eid lanterns", kind: { kind: "ornament" }, names: { list: "Amina\nYusuf\nLayla", fontId: "fredoka", size: 8, sub: "Eid Mubarak", subSize: 55 }, shape: { kind: "motif", motif: "lantern", width: 60, height: 90, margin: 4, frame: false }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "wedding-date", name: "Wedding date ornament", note: "Gold mirror names on a round wooden ornament",
    params: { name: "Wedding ornament", kind: { kind: "ornament" }, names: { list: "Emma & James", fontId: "great-vibes", size: 15, sub: "Est. 2026", subFontId: "playfair-display", subSize: 40 }, style: { kind: "layered", weld: 0.8 }, shape: { kind: "circle", width: 85, height: 85, margin: 7, frame: true }, accent: { kind: "rings", place: "above", size: 16 }, mat: { mat2: "acrylic-gold", T2: 3 } },
    pro: true,
  },
  // ---- characters
  {
    id: "snowman-ornaments", name: "Snowman ornaments", note: "Snowmen in top hats, a carrot nose and hat cut separately to paint",
    params: { name: "Snowmen", kind: { kind: "ornament" }, names: { list: "Rico\nMia\nTheo", fontId: "pacifico", size: 13 }, shape: { kind: "snowman", width: 64, height: 100, margin: 2, hat: "tophat", paint: true }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "reindeer-ornaments", name: "Reindeer ornaments", note: "Antlers and a red nose cut on its own, the name on the muzzle",
    params: { name: "Reindeer", kind: { kind: "ornament" }, names: { list: "Luca\nNora\nFinn", fontId: "archivo-black", size: 10 }, shape: { kind: "reindeer", width: 84, height: 110, margin: 2, paint: true }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "cat-santa", name: "Cat in a Santa hat", note: "A cat face with whiskers scored, the hat cut separately, name and year",
    params: { name: "Cat ornament", kind: { kind: "ornament" }, names: { list: "Missy\nShiro", fontId: "pacifico", size: 12, sub: "2026", subSize: 50 }, shape: { kind: "cat", width: 86, height: 84, margin: 2, hat: "santa", paint: true }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  {
    id: "gingerbread-tags", name: "Gingerbread gift tags", note: "Gingerbread friends with icing scored and buttons to glue on",
    params: { name: "Gingerbread tags", kind: { kind: "gifttag" }, names: { list: "Ella\nJack\nRose", fontId: "fredoka", size: 9 }, shape: { kind: "gingerbread", width: 80, height: 86, margin: 1.5, paint: true }, hang: { kind: "loop", side: "top", hole: 3.5, wall: 2.5 } },
  },
  // ---- keychains
  {
    id: "name-keychains", name: "Connected name keychains", note: "Each name welded into one piece with a ring loop",
    params: { name: "Name keychains", kind: { kind: "keychain" }, material: "acr3", T: 3, K: 0.1, names: { list: "Olivia\nNoah\nAva\nLiam", fontId: "pacifico", size: 16 }, style: { kind: "letters", weld: 1, backing: 0 }, hang: { kind: "loop", side: "left", hole: 5, wall: 3 } },
  },
  {
    id: "layered-keychains", name: "Layered acrylic keychains", note: "Mirror letters on a silhouette backing",
    params: { name: "Layered keychains", kind: { kind: "keychain" }, material: "acr3", T: 3, K: 0.1, names: { list: "Mia\nLeo\nRuby", fontId: "pacifico", size: 16 }, style: { kind: "letters", weld: 0.8, backing: 3 }, hang: { kind: "loop", side: "left", hole: 5, wall: 3 }, mat: { mat2: "acrylic-rose", T2: 3 } },
    pro: true,
  },
  {
    id: "pill-keychains", name: "Engraved tag keychains", note: "Rounded wooden tags with the name engraved",
    params: { name: "Tag keychains", kind: { kind: "keychain" }, names: { list: "Ethan\nChloe\nLucas\nIsla", fontId: "archivo-black", size: 10 }, shape: { kind: "pill", width: 64, height: 24, margin: 3, frame: true }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 } },
  },
  {
    id: "initial-keychains", name: "Initial keychains", note: "One big cut-through initial per disc",
    params: { name: "Initial keychains", kind: { kind: "keychain" }, names: { list: "A\nM\nJ\nS", fontId: "archivo-black", size: 26 }, style: { kind: "cutout" }, shape: { kind: "circle", width: 40, height: 40, margin: 4, frame: false }, hang: { kind: "hole", side: "top", hole: 5, wall: 3 } },
  },
  {
    id: "home-keys", name: "House key tags", note: "House-shaped tags labelled for each door",
    params: { name: "House key tags", kind: { kind: "keychain" }, names: { list: "Front door\nBack door\nGarage\nShed", fontId: "fredoka", size: 8 }, shape: { kind: "house", width: 44, height: 50, margin: 3, frame: true }, accent: { kind: "key", place: "below", size: 12 }, hang: { kind: "hole", side: "top", hole: 5, wall: 3 } },
  },
  {
    id: "teacher-keychains", name: "Teacher thank-you keychains", note: "Hearts with the teacher's name and Thank you",
    params: { name: "Teacher keychains", kind: { kind: "keychain" }, names: { list: "Mrs Smith\nMr Jones", fontId: "pacifico", size: 9, sub: "Thank you", subSize: 60 }, shape: { kind: "heart", width: 66, height: 60, margin: 4, frame: false }, hang: { kind: "hole", side: "top", hole: 4.5, wall: 3 } },
  },
  // ---- earrings
  {
    id: "teardrop-earrings", name: "Teardrop earrings", note: "Light wooden drops with a scored frame",
    params: { name: "Teardrop earrings", kind: { kind: "earrings" }, names: { list: "", fontId: "fredoka", size: 5 }, shape: { kind: "teardrop", width: 24, height: 38, margin: 2, frame: true }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 } },
  },
  {
    id: "initial-earrings", name: "Initial heart earrings", note: "Small hearts with an engraved initial",
    params: { name: "Initial earrings", kind: { kind: "earrings" }, names: { list: "E", fontId: "playfair-display", size: 6 }, shape: { kind: "heart", width: 26, height: 24, margin: 1.5, frame: false }, hang: { kind: "hole", side: "top", hole: 1.6, wall: 1.6 } },
  },
  {
    id: "scallop-earrings", name: "Scalloped disc earrings", note: "Acrylic discs with a cut-through star",
    params: { name: "Scallop earrings", kind: { kind: "earrings" }, material: "acr2", T: 2, K: 0.1, names: { list: "", fontId: "fredoka", size: 5 }, style: { kind: "cutout" }, shape: { kind: "scalloped", width: 26, height: 26, margin: 3, frame: false }, accent: { kind: "star", place: "above", size: 10 }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 } },
  },
  {
    id: "diamond-earrings", name: "Diamond drop earrings", note: "Long diamonds, a frame scored inside the edge",
    params: { name: "Diamond earrings", kind: { kind: "earrings" }, material: "walnut3", T: 3, K: 0.16, names: { list: "", fontId: "fredoka", size: 5 }, shape: { kind: "diamond", width: 22, height: 40, margin: 2, frame: true }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 } },
  },
  // ---- bag tags
  {
    id: "school-bag-tags", name: "School bag tags", note: "Name and class under a strap slot",
    params: { name: "School bag tags", kind: { kind: "bagtag" }, names: { list: "Oliver\nAmelia\nHarry", fontId: "archivo-black", size: 14, sub: "Class 3B", subSize: 45 }, shape: { kind: "rounded", width: 90, height: 55, margin: 5, frame: true }, strap: { length: 24, width: 5 } },
  },
  {
    id: "luggage-tags", name: "Luggage tags", note: "Name and phone number, slot for the strap",
    params: { name: "Luggage tags", kind: { kind: "bagtag" }, names: { list: "J. Taylor", fontId: "playfair-display", size: 12, sub: "+44 7700 900123", subFontId: "fredoka", subSize: 50 }, shape: { kind: "ticket", width: 95, height: 55, margin: 6, frame: true }, accent: { kind: "compass", place: "left", size: 16 }, strap: { length: 26, width: 5 } },
  },
  // ---- drink markers
  {
    id: "wine-charms", name: "Wine glass markers", note: "Name discs that clip round the stem",
    params: { name: "Glass markers", kind: { kind: "drink" }, names: { list: "Anna\nBen\nCara\nDan\nEva\nFinn", fontId: "fredoka", size: 6 }, shape: { kind: "circle", width: 28, height: 28, margin: 2.5, frame: false }, clip: { stem: 8, opening: 7.2, ring: 2 } },
  },
  {
    id: "party-drink-markers", name: "Party drink markers", note: "Star markers for a party, one per guest",
    params: { name: "Party markers", kind: { kind: "drink" }, names: { list: "Sophie\nTom\nLucy\nJake", fontId: "archivo-black", size: 5 }, shape: { kind: "star", width: 34, height: 33, margin: 2, frame: false }, clip: { stem: 7, opening: 6.4, ring: 2 } },
  },
  // ---- place cards
  {
    id: "wedding-place-cards", name: "Wedding place cards", note: "Script names on banners that stand on a slotted foot",
    params: { name: "Wedding place cards", kind: { kind: "placecard" }, names: { list: "Grace\nHenry\nAlice\nGeorge\nIvy\nArthur", fontId: "great-vibes", size: 16 }, textStyle: { bold: 0.25 }, shape: { kind: "banner", width: 95, height: 40, margin: 5, frame: false }, stand: { depth: 30, clearance: 0.1 } },
  },
  {
    id: "table-name-plates", name: "Dinner name plates", note: "Rounded name plates with a laurel, standing",
    params: { name: "Name plates", kind: { kind: "placecard" }, names: { list: "Chef Marco\nGuest of honour", fontId: "playfair-display", size: 10 }, shape: { kind: "rounded", width: 100, height: 38, margin: 5, frame: true }, accent: { kind: "laurel", place: "left", size: 18 }, stand: { depth: 30, clearance: 0.1 } },
  },
  // ---- gift card holders
  {
    id: "gift-card-ornament", name: "Gift card holder ornament", note: "A pocket for a gift card behind a framed window, the name across the front",
    params: { name: "Gift card ornament", kind: { kind: "cardholder" }, names: { list: "Henry\nSophie", fontId: "pacifico", size: 18 }, shape: { kind: "rounded", width: 106, height: 78, margin: 4, frame: false }, card: { width: 85.6, height: 54, clearance: 1, lip: 5 }, hang: { kind: "loop", side: "top", hole: 4, wall: 3 }, mat: { mat2: "acrylic-white", T2: 3 } },
    pro: true,
  },
  {
    id: "gift-card-scallop", name: "Scalloped gift card holder", note: "Scalloped edge, gold mirror name",
    params: { name: "Scalloped card holder", kind: { kind: "cardholder" }, names: { list: "Grace", fontId: "great-vibes", size: 20 }, textStyle: { bold: 0.3 }, shape: { kind: "scalloped", width: 120, height: 92, margin: 5, frame: false }, card: { width: 85.6, height: 54, clearance: 1, lip: 5 }, hang: { kind: "loop", side: "top", hole: 4, wall: 3 }, mat: { mat2: "acrylic-gold", T2: 3 } },
    pro: true,
  },
  // ---- with a dangle
  {
    id: "new-home-ornament", name: "New home ornament", note: "House with the family name and street, a little key dangle with the year",
    params: { name: "New home", kind: { kind: "ornament" }, names: { list: "The Jeongs", fontId: "archivo-black", size: 11, sub: "975 Lakeside Dr", subSize: 45 }, shape: { kind: "house", width: 80, height: 82, margin: 6, frame: true }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 }, dangle: { on: true, shape: "circle", size: 22, text: "2026", hole: 3 } },
  },
  {
    id: "memorial-paw", name: "Pet memorial ornament", note: "Paw with the pet's name, a heart dangle that says Forever",
    params: { name: "Pet memorial", kind: { kind: "ornament" }, names: { list: "Annie", fontId: "pacifico", size: 12 }, shape: { kind: "motif", motif: "paw", width: 75, height: 75, margin: 3, frame: false }, hang: { kind: "loop", side: "top", hole: 4, wall: 3 }, dangle: { on: true, shape: "heart", size: 22, text: "Forever", hole: 3 } },
  },
  {
    id: "keychain-dangle", name: "Keychain with a year tag", note: "Name tag keychain with a little round tag for the year",
    params: { name: "Keychain dangle", kind: { kind: "keychain" }, names: { list: "Isla\nOwen", fontId: "fredoka", size: 10 }, shape: { kind: "pill", width: 62, height: 24, margin: 3, frame: true }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 }, dangle: { on: true, shape: "circle", size: 20, text: "2026", hole: 3 } },
  },
  // ---- gift tags
  {
    id: "stocking-tags", name: "Stocking tags", note: "Tags with a hole for the ribbon, one per stocking",
    params: { name: "Stocking tags", kind: { kind: "gifttag" }, names: { list: FAMILY, fontId: "pacifico", size: 12 }, shape: { kind: "tag", width: 80, height: 40, margin: 4, frame: true }, hang: { kind: "hole", side: "left", hole: 4, wall: 3 } },
  },
  // ---- bookmarks
  {
    id: "name-bookmarks", name: "Name bookmarks", note: "Tall rounded bookmarks, the name read along the length and a tassel hole at the top",
    params: { name: "Name bookmarks", kind: { kind: "bookmark" }, names: { list: "Olivia\nNoah\nAva", fontId: "pacifico", size: 16, along: true }, shape: { kind: "rounded", width: 40, height: 150, margin: 4, frame: true }, accent: { kind: "star", place: "above", size: 10 }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 } },
  },
  {
    id: "teacher-bookmarks", name: "Teacher thank-you bookmarks", note: "Arched bookmarks with the teacher's name and Thank you along the length",
    params: { name: "Teacher bookmarks", kind: { kind: "bookmark" }, names: { list: "Mrs Smith\nMr Jones", fontId: "fredoka", size: 12, sub: "Thank you", subSize: 55, along: true }, shape: { kind: "arch", width: 44, height: 150, margin: 4, frame: true }, hang: { kind: "hole", side: "top", hole: 4, wall: 3 } },
  },
  // ---- fridge magnets
  {
    id: "family-magnets", name: "Family name fridge magnets", note: "Rounded magnets with the name engraved and a hidden 10 mm magnet pocket in a back layer",
    params: { name: "Family magnets", kind: { kind: "magnet" }, names: { list: FAMILY, fontId: "pacifico", size: 13 }, shape: { kind: "rounded", width: 70, height: 40, margin: 4, frame: true }, magnet: { diameter: 10, thickness: 2, count: 1, clearance: 0.2 } },
  },
  {
    id: "new-home-magnet", name: "New home fridge magnet", note: "House-shaped magnet with the family name and year, two magnets so it does not turn",
    params: { name: "New home magnet", kind: { kind: "magnet" }, names: { list: "The Jeongs", fontId: "archivo-black", size: 10, sub: "Est. 2026", subSize: 50 }, shape: { kind: "house", width: 80, height: 76, margin: 6, frame: true }, magnet: { diameter: 10, thickness: 2, count: 2, clearance: 0.2 } },
  },
  // ---- inlay and statement earrings
  {
    id: "inlay-keychains", name: "Inlay name keychains", note: "Names cut through the wood and inlaid flush in walnut over a backing",
    params: { name: "Inlay keychains", kind: { kind: "keychain" }, names: { list: "Ruby\nOscar\nMila", fontId: "archivo-black", size: 11 }, style: { kind: "inlay" }, shape: { kind: "pill", width: 66, height: 26, margin: 3, frame: false }, hang: { kind: "hole", side: "left", hole: 5, wall: 3 }, mat: { mat2: "walnut-3", T2: 3 } },
    pro: true,
  },
  {
    id: "statement-earrings", name: "Two-tier statement earrings", note: "An arch with a teardrop hanging under it on a jump ring, in light 2 mm acrylic",
    params: { name: "Statement earrings", kind: { kind: "earrings" }, material: "acr2", T: 2, K: 0.1, names: { list: "", fontId: "fredoka", size: 5 }, shape: { kind: "arch", width: 22, height: 24, margin: 2, frame: false }, hang: { kind: "hole", side: "top", hole: 1.8, wall: 1.8 }, dangle: { on: true, shape: "teardrop", size: 18, text: "", hole: 1.8 } },
  },
  {
    id: "pet-id-tags", name: "Pet ID tags", note: "Small bone tags with the pet's name and a phone number, a hole for the collar ring",
    params: { name: "Pet ID tags", kind: { kind: "keychain" }, names: { list: "Buddy\nLuna", fontId: "archivo-black", size: 9, sub: "07700 900123", subFontId: "fredoka", subSize: 45 }, shape: { kind: "bone", width: 50, height: 26, margin: 2.5, frame: false }, hang: { kind: "hole", side: "left", hole: 4, wall: 2.5 } },
  },
  {
    id: "gift-tags", name: "Gift tags", note: "Labels that say who each present is for",
    params: { name: "Gift tags", kind: { kind: "gifttag" }, names: { list: "For Mia\nFor Leo\nFor Nan", fontId: "pacifico", size: 11 }, shape: { kind: "banner", width: 75, height: 35, margin: 5, frame: true }, accent: { kind: "gift", place: "left", size: 12 }, hang: { kind: "hole", side: "left", hole: 4, wall: 3 } },
  },
];
