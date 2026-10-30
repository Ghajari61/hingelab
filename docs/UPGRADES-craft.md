# Craft generators: what competitors offer and what HingeLab added

This covers three generators: Pop-up (pop-up and spiral bowls, lamp shades and lanterns), Name Charms (charms, ornaments, tags and earrings) and World Miniature Studio (houses, book nooks, furniture and garden pieces).

Ideas came from public product pages, maker blogs and project galleries. No files, artwork, logos or trademarked characters were copied. All geometry is HingeLab's own and built from parameters.

## Name Charms

### What competitors offer

These come from Etsy best-seller roundups, xTool/Atomm projects and laser-maker blogs:

- **Personalised name keychains.** These sell best, often as wood with a contrasting inlay or as layered two-colour acrylic. Atomm and xTool galleries have "inlay keychain" and "layered or inlay" pendants.
- **Bookmarks.** About 2 × 6 in (50 × 150 mm). They have the name engraved along the length and a tassel hole, and are sold as teacher gifts and wedding favours.
- **Fridge magnets.** Layered wood with a magnet on the back. Laser blogs (Thunder, Trotec, Atomm) show stacked layers with a magnet glued behind.
- **Acrylic statement earrings.** Light 2–3 mm acrylic, often two tiers joined by jump rings ("dangling earrings").
- **Pet ID tags.** A bone or round tag with the name and a phone number.

### What was added

- **Bookmarks.** A new kind with a tall rounded blank (40 × 150 mm) and a tassel hole. A new **Along the length** option turns the words a quarter turn so they read bottom to top. It works on any tall charm, so a long name stays large. A note flags bookmarks thicker than 3 mm.
- **Fridge magnets.** A new kind with two parts: a face, and a back layer of the same outline. The back has a pocket cut through it for each round magnet. You can set the magnet diameter, thickness, count (1–4, spread along a long piece) and pocket clearance. Two checks, each with fixes:
  - `CHARM_MAGNET_PROUD`: the magnet is thicker than the stock.
  - `CHARM_MAGNET_WALL`: less than 1.5 mm of material is left round a pocket or between two pockets.
- **Inlay style.** The name is cut through the face. The same letters are cut from a second material to press in flush, with their counters kept as holes. A backing behind the face carries the hanging hole. The kerf gives the press fit. `CHARM_INLAY_DEPTH` notes letters that are not the same thickness as the stock and offers a fix that makes them flush. Inlay is a Pro feature, like Layered.
- **Two-tier earrings.** Dangles now work on earrings. Each earring of the pair gets its own dangle, and the dangle's weight counts toward the earring weight check.
- **Seven presets:**
  - `name-bookmarks`
  - `teacher-bookmarks`
  - `family-magnets`
  - `new-home-magnet`
  - `inlay-keychains`
  - `statement-earrings`
  - `pet-id-tags`

## World Miniature Studio

### What competitors offer

- **Book nooks.** Popular themes are alleys, libraries and arches, enchanted or magic forests, holiday scenes and gothic windows. They are built from layers of 3 mm basswood, with LEDs hidden behind the front layers (Atomm's book nook roundup lists 20 themes; forest kits are also sold by Rolife and Hands Craft).
- **Fairy-garden pieces.** Common pieces are fairy doors (two-layer files with a scored or cut window and knocker), wishing wells, pergolas and arbors, and bridges.
- **1:12 dollhouse furniture.** Kits include rocking chairs, cradles and cribs, and desk and chair sets (xTool project gallery, Glowforge catalogue, Etsy bundles).

### What was added

- **Enchanted forest book nook scene.** It has 2–5 layers of tiered pine silhouettes with a path through a clearing. Trees grow and the clearing widens toward the front, giving forced perspective. Each layer keeps a top rail and a floor strip, so it stays one piece between its tabs. The light box, battery bay and mirror work as in the other scenes.
- **Rocking chair.** The chair stands on curved rockers cut in one piece with each side. The rockers reach further behind than in front, so the chair does not tip back. The space under the seat stays open as a hole in the side.
- **Garden bridge.** An arched footbridge on the tabbed frame. The two side rails are the ends, and each plank is a flat member tabbed into both. Each plank sits level, a margin `m` above the arch at its high end, with balusters cut through the rail. The band grows with the slope, so slots never meet the baluster windows. `BRIDGE_STEEP` warns when the ends are steeper than about 30°, and offers two fixes: lower it or make it longer.
- **Fairy door.** Three layers:
  - a back plate;
  - a stone-scored frame with a door leaf 0.3 mm smaller than its opening, planked and with a round cross-barred window;
  - hinges and a knob on top.

  A step lies on the floor in front.
- **Starting sizes.** Picking the bridge or the fairy door sets sizes that suit it. The other pieces keep the sizes you set.
- **Five presets:**
  - `nook-enchanted-forest`
  - `nook-forest-mirror`
  - `fairy-door`
  - `garden-bridge`
  - `rocking-chair-1-12`

## Pop-up

### What competitors offer

- **Spiral and pop-up bowls and baskets.** Glowforge community spiral bowls, Etsy and SoFontsy Easter, Valentine and bread baskets, and xTool and Atomm basket projects. Easter egg baskets are a strong seasonal seller.
- **Spiral Christmas trees and pyramids, and veneer spiral pendants.** HingeLab already covers these with its spiral and multi-arm patterns, sockets and supports.
- **Lanterns and tealight holders.** These are mostly slot-together panel boxes, which are a different construction from a pop-up.

### What was added

- **Outlines:** egg (Easter baskets), drop and cloud (nursery). Every ring offset stays nested inside the one outside it.
- **Edge style "square":** a soft square wave that gives crenellated ring edges.
- **Engraved motifs:** pomegranates (Yalda night) and Easter eggs. When repeated on the rim, the new motifs sit half a step round, between the rib joints. Existing motifs are unchanged.
- **Five presets:**
  - `easter-egg-basket`
  - `yalda-pomegranate-bowl`
  - `cloud-nursery-tray`
  - `crenellated-fruit-bowl`
  - `drop-catch-all`

## Sources

- xTool, what to sell on Etsy: https://www.xtool.com/blogs/business-ideas/what-to-sell-on-etsy
- Ortur, 2024 Etsy roundup of laser-cut gifts: https://ortur.net/blogs/ortur-blog-center/2024-etsy-roundup-top-laser-cut-personalized-engraved-gifts
- Etsy keychain guide 2026: https://www.insightagent.app/guides/best-selling-keychains-on-etsy
- Atomm, layered or inlay tree of life keychain: https://www.atomm.com/uk/project/144965-layered-or-inlay-tree-of-life-keychain
- Atomm, multi-coloured wooden name key ring: https://www.atomm.com/project/11360-how-to-make-a-multi-coloured-wooden-name-key-ring
- LaserPecker, personalised bookmarks (sizes): https://uk.laserpecker.net/blogs/how-to/make-personalized-bookmarks
- Thunder Laser, custom fridge magnets: https://www.thunderlaser.com/inspiration-library/laser-engraving-custom-fridge-magnets.html
- xTool, laser-cut wood and acrylic earrings: https://www.xtool.com/en-au/blogs/how-to/laser-cut-wood-acrylic-earrings
- Cuttle, dangling earrings: https://cuttle.xyz/@bwente/Emoji-Dangling-Earrings-iGR1GHhq3KGs
- Atomm, 20 book nook ideas: https://www.atomm.com/blog/2744-book-nook-ideas
- SoFontsy, two-layer fairy doors: https://sofontsy.com/products/fairy-doors-laser-cut-file-two-layer-design-svg-cut-files
- xTool, miniature rocking chair: https://projects.xtool.com/project/35347-charming-miniature-rocking-chair-for-dollhouses-easy-laser-cut-plans-463
- xTool, doll cradle kit: https://projects.xtool.com/project/35089-diy-rainbow-doll-cradle-kit-custom-wooden-miniature-crib-for-dollhouse-530
- Atomm, wishing well kit: https://www.atomm.com/project/22983-wishing-well-kit
- Miniatures.com, 1:12 pergola and arbor kit: https://miniatures.com/products/dollhouse-kit-garden-pergola-arbor-trellis-for-flowers-diy-1-12-scale-miniature
- Glowforge community, wooden spiral bowl: https://community.glowforge.com/t/yet-another-wooden-spiral-bowl/28157
- SoFontsy, Easter egg basket: https://sofontsy.com/products/easter-egg-basket-laser-cut
- Craftisian, spiral veneer pendant lamp: https://craftisian.com/projects/11283-spiral-veneer-pendant-lamp
- Atomm, Christmas spiral wooden pyramid: https://www.atomm.com/es/project/80425-christmas-spiral-wooden-pyramid
- Atomm, hexagonal Christmas lantern: https://www.atomm.com/sl/project/78665-hexagonal-christmas-lantern-laser-cut-6-side-lantern
