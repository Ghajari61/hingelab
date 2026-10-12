# Design library catalogue

Source folder: `D:\Archive\Print\SVG Files` (scanned read-only on 11 October 2026; nothing in it was changed, moved or extracted).
Machine-readable list of every loose SVG: [svg-files.csv](./svg-files.csv). No artwork is copied into this document.

## Summary

| | |
|---|---|
| Files on disk | 187,959 in 4,810 folders, 111.5 GB |
| Formats on disk | .eps 64,702 · .cmx 33,688 · .cdr 23,631 · .ccx 23,126 · .wmf 12,458 · .ai 12,424 · .jpg 7,747 · .zip 4,897 · .dxf 2,604 · .svg 1,085 · .png 930 · .pdf 285 |
| Zip archives | 4,897 read through their central directories (0 unreadable): 330,196 entries — .svg 109,736 · .eps 69,626 · .cdr 35,428 · .cmx 33,690 · .ccx 23,126 · .jpg 12,885 · .ai 12,495 · .wmf 12,458 · .zip 8,405 · .dxf 5,924 |
| Zips inside zips | 3,539 product packs opened in memory (7.5 GB): .cdr 9,952 · .svg 9,938 · .ai 9,927 · .dxf 9,920 · .eps 9,871 · .jpg 2,845 |
| SVG files | 1,085 loose + 109,737 inside zips + 9,938 inside nested zips |
| Duplicates | Two whole folders are byte-identical copies (`For engraving` = `For engraving-003`, `Vector clipart-001` = `Vector clipart-003`); every top-level zip repeats a folder next to it; 414 of the loose SVGs are exact duplicates (same SHA-1) |
| Bundled into HingeLab | **2 designs (5 SVG files)** — see “Licensing gate” |
| Excluded | Everything else (third-party, paid or unlicensed collections) — usable privately through **Studio ▸ Import SVG**, never shipped |

## Licensing gate

HingeLab is public and deployed, so anything bundled is redistributed. A file was bundled only when its provenance allows that.

| Design | Files | Evidence | Licence | Decision |
|---|---|---|---|---|
| Ceramic frame (215.9 × 279.4 mm, two 108 mm tile windows) | `Ceramic Frame.svg` | xTool Creative Space export; no author or watermark; the companion JPG carries the owner's Photoshop edit and print settings | Owner's own work (assumed) | **Bundled** — please confirm |
| KV-1 tank model (body, tracks, turret, wheels) | `Prefabricated/…/103092_Танк KV-1/103092_files/KV-1_*.svg` | Thingiverse attribution card: “Carter's lasercut tank model – KV-1 (motorizable) by JackCarter”, thing:2449310, “Creative Commons – Attribution” | CC BY | **Bundled** with attribution (title, author, link, licence shown in the gallery and in `public/templates/LICENSES.md`) |

Reasons for exclusion found in the files:

- **Paid / all rights reserved:** CncFactory templates (“All rights reserved – © copyright – CncFactory”: sheep shelf, giraffe bookshelf, bulldog beer caddy); a DXF Plans “Grant of license” (licence per purchaser, no sharing); the *Laser cut file* bundle (3,539 SKU-numbered five-format product packs, typical of resold marketplace bundles).
- **Non-commercial licences:** StuG III tank by JackCarter (CC BY-NC-SA), spice rack by Don McLane (CC BY-NC-SA 3.0). HingeLab sells Pro plans, so NC material cannot ship.
- **Share-alike:** openKMQ iPad viewer kit (PixelPartner.de, CC BY-SA 2.0 DE) — redistribution is allowed with attribution, but every adaptation must stay CC BY-SA; left out to keep the bundled library free of copyleft (see CURSOR_INKSCAPE_PARITY.md §0). It can be added later if you want it.
- **No licence, third-party origin:** VK community reposts and Russian descriptions (“Доброго здоровья…”), a design traced from the book *Classic Fretwork Scroll Saw Patterns* (Patrick Spielman and James Reidle), mebel-sam.net.ua furniture, the numbered *Downloads SVG* stock packs, the *Vector clipart* CD (company logos such as Dolby, Nintendo, Canon, Microsoft; football club crests; coats of arms) and the *For engraving* and *vector file* packs.

## Collections

| Collection | Files | Size | Designs | Main formats | Provenance | Decision |
|---|---:|---:|---|---|---|---|
| For engraving (+ identical copy “For engraving-003”, + 2 identical 2.6 GB zips) | 4,172 | 6.6 GB | 2,086 images/files (one copy) | .jpg 3,816, .cdr 286, .dxf 70 | Third-party engraving art pack (raster JPGs and CorelDRAW files, religious images, landscapes); no licence, no author. | Excluded — third-party collection, no redistribution licence. |
| Laser cut file (5 Google-Drive parts, 27 category zips) | 68 | 8.4 GB | 3,539 product packs | .zip 45, .jpg 23 | Commercial laser-file bundle: 3,539 product zips named “SKUnnnn …” or with shop catalogue ids, each a five-format pack (SVG + DXF + AI + CDR + EPS) with product photos. | Excluded — paid marketplace bundle (SKU product packs), no redistribution licence. |
| Prefabricated (+ 2.8 GB zip of the same folder) | 10,084 | 5.6 GB | 2,946 projects | .jpg 3,907, .cdr 2,957, .dxf 2,316, .pdf 285 | Russian-language community collection with catalogue ids (94xxx–112xxx): VK community reposts, CncFactory templates (“All rights reserved – © copyright – CncFactory”), a DXF Plans “Grant of license” (paid, per-licensee), Thingiverse models (CC BY-NC-SA and CC BY), mebel-sam.net.ua downloads. | Excluded except one CC BY item (KV-1 tank by JackCarter, Thingiverse 2449310), bundled with attribution. |
| SVG-001 / Downloads SVG (4,818 numbered packs + 15.6 GB zip of the same) | 5,008 | 15.6 GB | 4,818 packs, 108,776 SVGs | .zip 4,818, .svg 188, .png 2 | Downloaded stock clip-art packs numbered 5001–9078, each with a preview PNG; CorelDRAW 2018–2021 exports, filled multi-colour art; no licence, no author. | Excluded — downloaded third-party stock, licence unknown. |
| Vector clipart (+ identical copy “-003”, + 2 identical 6.5 GB zips) | 168,592 | 25.5 GB | 84,296 clip-art files (one copy) | .eps 64,540, .cmx 33,688, .ccx 23,126, .cdr 20,388 | 1990s–2000s clip-art CD collection (EPS/CMX/CDR/CCX/WMF/AI) including 15,623 company logos, 1,409 football club crests and coats of arms (trademarks), cartoons and an adult category. | Excluded — third-party clip-art and trademarks. |
| vector file (20 themed zips, 2 Google-Drive parts) | 20 | 2.5 GB | 20,024 files in 20 packs | .zip 20 | Third-party themed packs (wedding screens, panels, keychains, charms, monograms, toppers, plasma-cutter art); no licence. | Excluded — third-party collection, licence unknown. |
| Loose files at the top level | 15 | 47.3 GB | 1 design | .zip 13, .jpg 1, .svg 1 | Ceramic Frame.svg exported from xTool Creative Space; its companion JPG was edited in Photoshop and printed on the owner's own printer. | Bundled as the user's own design (please confirm). |

## Categories

Category folders (one copy of each duplicate), with the HingeLab category they would map to.

**For engraving** — Flowers and patterns (415 files, pattern / panel); Crosses (304 files, clip-art / engraving art); Frames (261 files, pattern / panel); Islam (138 files, clip-art / engraving art); Animals and birds (128 files, clip-art / engraving art); Religion Jesus (124 files, clip-art / engraving art); Landscapes (113 files, clip-art / engraving art); Angels (99 files, clip-art / engraving art); 3D Lights (97 files, lamp); Religion The Virgin Mary (88 files, clip-art / engraving art); Pattern corners (81 files, pattern / panel); Candles (56 files, lamp); Icons (46 files, clip-art / engraving art); Design elements (45 files, clip-art / engraving art); Temples and churches (44 files, clip-art / engraving art); Miscellaneous (21 files, clip-art / engraving art); Religion miscellaneous (16 files, clip-art / engraving art); Children's (5 files, clip-art / engraving art); The sea and sailboats (4 files, clip-art / engraving art); Stencils (1 file, clip-art / engraving art).

**Laser cut file** — Furniture (400 designs, furniture / architecture); Lamps (352 designs, lamp); Caskets and Boxes (313 designs, box); Cars and vehicles (313 designs, toy / model); Office organizer (259 designs, holder / organiser); Shelves and Drawers (256 designs, holder / organiser); Animals (239 designs, toy / model); Different (237 designs, miscellaneous); Doll houses (181 designs, toy / model); Mini Bar (138 designs, holder / organiser); Games (128 designs, puzzle / game); Architecture (76 designs, furniture / architecture); Candy canes (76 designs, ornament); Heads (74 designs, toy / model); Tea houses (68 designs, furniture / architecture); Birdhouses (54 designs, holder / organiser); Flower stands (52 designs, holder / organiser); Photo Frames (48 designs, pattern / panel); Moneyboxes (47 designs, box); Christmas (45 designs, ornament); Coasters (40 designs, holder / organiser); Napkin holders (38 designs, holder / organiser); Weapon (35 designs, toy / model); Barbecue Grill (21 designs, holder / organiser); Clock (18 designs, clock); Kitchen Accessories (17 designs, holder / organiser); Rocking chairs (14 designs, toy / model).

**Prefabricated** — Animals (958 files, toy / model); Machinery and special equipment (902 files, toy / model); Luminaires (814 files, lamp); Elevations (806 files, pattern / panel); Dollhouses (657 files, toy / model); Decorative assemblies (604 files, miscellaneous); Chancery (487 files, holder / organiser); Chairs (457 files, furniture / architecture); Shelves (429 files, holder / organiser); Tables (418 files, furniture / architecture); Coasters (412 files, holder / organiser); Caskets (382 files, box); Boxes (338 files, box); Architecture (332 files, furniture / architecture); Bottle holders (317 files, holder / organiser); Orthodox (172 files, miscellaneous); Mechanisms (153 files, toy / model); Board games (135 files, puzzle / game); Heads (135 files, toy / model); Boxess (125 files, box); Beds (120 files, furniture / architecture); Feeders and birdhouses (119 files, holder / organiser); Napkin holders (99 files, holder / organiser); Rocking chairs (91 files, toy / model); Accessories (90 files, miscellaneous); Moneyboxes (88 files, box); Figures on a stand (87 files, toy / model); Tea houses (87 files, furniture / architecture); Characters (83 files, toy / model); Candy bowls (75 files, box); Musical instruments (44 files, miscellaneous); Calendars (41 files, clock); Machinery, special equipment, etc (26 files, toy / model); Children's (1 file, toy / model).

**Vector clipart** — Company logos (15,623 files, clip-art / engraving art); People, characters (9,545 files, clip-art / engraving art); Graphics, design (7,390 files, clip-art / engraving art); Cartoons (4,801 files, clip-art / engraving art); Patterns, Ornaments (4,496 files, pattern / panel); Holidays (4,279 files, clip-art / engraving art); Animals (4,161 files, clip-art / engraving art); Signs, signals (3,249 files, clip-art / engraving art); Frames (2,206 files, pattern / panel); Portraits (2,143 files, clip-art / engraving art); Sport (1,988 files, clip-art / engraving art); Science (1,812 files, clip-art / engraving art); Vector sets (1,801 files, clip-art / engraving art); Transport (1,776 files, clip-art / engraving art); Food (1,721 files, clip-art / engraving art); Vacation (1,517 files, clip-art / engraving art); Soccer Clubs of the World (1,409 files, clip-art / engraving art); Letters (1,275 files, sign / lettering); Coats of Arms (1,232 files, clip-art / engraving art); Nature (1,198 files, clip-art / engraving art); Medicine (1,158 files, clip-art / engraving art); Regions (1,025 files, clip-art / engraving art); Architecture (993 files, clip-art / engraving art); Computers and phones (845 files, clip-art / engraving art); Household utensils (665 files, clip-art / engraving art); Geographical maps (659 files, clip-art / engraving art); Flags (633 files, clip-art / engraving art); Tattoo (586 files, clip-art / engraving art); World landmarks (566 files, clip-art / engraving art); Zodiac signs (506 files, clip-art / engraving art); Silhouettes (446 files, clip-art / engraving art); Emblems, ribbons, arrows (316 files, clip-art / engraving art); Erotica (299 files, clip-art / engraving art); Extraordinary figures (241 files, clip-art / engraving art); Religion (216 files, clip-art / engraving art); Sandblasting (215 files, clip-art / engraving art); Tools (214 files, clip-art / engraving art); Awards (205 files, clip-art / engraving art); Humor and jokes (197 files, clip-art / engraving art); Electronics (192 files, clip-art / engraving art); Weapons (168 files, clip-art / engraving art); Coloring books (115 files, clip-art / engraving art); Kaleidoscope (112 files, pattern / panel); Playing cards (55 files, clip-art / engraving art); Hieroglyphics (47 files, clip-art / engraving art).

**vector file** — Patterns and Ornamentation (4,154 files, ornament); Panel (3,552 files, pattern / panel); Grids (2,129 files, pattern / panel); Frames (1,887 files, pattern / panel); House carving (1,700 files, pattern / panel); Wedding cards (1,180 files, clip-art / engraving art); For sandblasting (1,097 files, clip-art / engraving art); Charms and pendants (1,096 files, ornament); For the plasma cutter (888 files, clip-art / engraving art); Watch (534 files, clock); Facades (389 files, pattern / panel); Toppers (269 files, ornament); Wedding screens (242 files, pattern / panel); Monograms (197 files, sign / lettering); Medallions (196 files, ornament); Cutting boards (122 files, holder / organiser); Keychains (119 files, ornament); A set of letters and numbers (109 files, sign / lettering); 3D Lights (97 files, lamp); Words (67 files, sign / lettering).

Mapped totals: clip-art / engraving art 80,548 · pattern / panel 18,324 · ornament 5,955 · toy / model 3,949 · holder / organiser 2,860 · furniture / architecture 1,958 · sign / lettering 1,648 · lamp 1,416 · box 1,368 · miscellaneous 1,147 · clock 593 · puzzle / game 263.

## SVG analysis

- **Loose SVGs (1,085):** 58 look laser-ready (stroke-only outlines), 119 use a few colours (cut/engrave layers), 908 are filled multi-colour clip-art; 123 embed raster images.
- **Creators:** CorelDRAW 824, CorelDRAW 2018 179, Inkscape 26, Adobe Illustrator 16.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0) 23, CorelDRAW 2020 9, CorelDRAW X8 7, CorelDRAW Home & Student X8 7, Inkscape 3, CorelDRAW X7 3, xTool Creative Space 1, Adobe Illustrator 19.2.1, SVG Export Plug-In . SVG Version: 6.00 Build 0) 1, Adobe Illustrator 17.1.0, SVG Export Plug-In . SVG Version: 6.00 Build 0) 1, unknown 1.
- **Inside zips (sample of up to 3 SVGs per archive, 14,470 files):** laser-cut (stroke only) 57, cut/engrave (few colours) 4,419, clip-art (filled, multi-colour) 9,994.
- **Sizes:** 1,084 loose SVGs declare a physical size; the largest declared sheet is 1856.85 × 2342.39 mm. 570 loose SVGs are over 2 MB; the largest are 111303_sceleton.svg (23 MB), 111303_sceleton.svg (23 MB), 111176_cartoon_character.svg (21 MB), 111176_cartoon_character.svg (21 MB), 111051_cute_little_bear.svg (18 MB).
- **Active content:** none of the loose SVGs contain scripts, `foreignObject`, event attributes or external links (0 flagged). The importer strips such content anyway.
- **Broken files:** no unreadable archives; 0 SVGs failed to read.
- **Material thickness hints in names:** 3 mm (153), 6 mm (91), 4 mm (70), 1.5 mm (15), 3.17 mm (12), 10 mm (11), 19 mm (6), 1 mm (6).

## Using the excluded designs privately

Studio ▸ **File ▸ Import SVG…** (and **Import SVG…** on the start screen) reads any SVG on your computer into a project on this device: units become millimetres, colours become cut layers, metadata and active content are dropped. Nothing is uploaded or shipped with HingeLab, so files you own a personal licence for stay personal.

## Files to confirm

| File | Why |
|---|---|
| `Ceramic Frame.svg` | Bundled as your own design; no author mark. Confirm it is yours. |
| `Prefabricated/Machinery and special equipment/103092_Танк KV-1/` | Bundled under CC BY on the strength of the Thingiverse attribution card that came with it. Confirm at thingiverse.com/thing:2449310 if you like. |
| `Prefabricated/Coasters/103225_…/103225_openKMQiPadKit_0_3_32.svg` | CC BY-SA 2.0 DE; can be bundled if you accept share-alike for that file. |
| Thingiverse/Instructables-style files without a card (UBoxMini, Dice Tower, Gearbug, Nexus 7 case, Lizard spiral, radius guides and vernier caliper, CD shelf, ladder shelf) | Probably open-licensed at the source, but no licence came with them. Send the source pages and they can be checked. |
