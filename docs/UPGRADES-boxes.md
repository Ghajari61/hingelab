# Boxes, Paper Box and Shadow Box: what competitors offer and what HingeLab added

This upgrade covers three generators: Boxes & Packaging (`boxes`), the Paper Box / Wood Packaging adapter (`paperbox`, which runs on the Boxes engine) and Shadow Box (`shadowbox`).

The research used box generators (boxes.py, MakerCase, Cuttle, the xTool Studio generators), maker galleries (xTool/Atomm projects, Instructables, Semigloss Design, Jennifer Maker, Sweet Red Poppy) and commercial sellers (Etsy, So Fontsy, Glowforge Shop, personalised gift shops). We took ideas, not files: nothing was copied, and all geometry is drawn in code. No brand logos or characters are reproduced.

## Boxes & Packaging (`boxes`)

### What competitors offer

- **boxes.py** has a large library of generators. Besides plain finger-jointed boxes it offers type trays, divider trays, hinged boxes (IntegratedHingeBox, ChestHinge), sliding drawers, a coin bank, wall-mounted racks, a night-light box and many organisers. MakerCase and makeabox.io are simpler: a closed or open box with finger, flat or T-slot edges.
- **The xTool Studio generators** are quick templates: a tissue box, a treasure box, an ornament and a puzzle. Makers on xTool and Atomm resize them for products. A floral tissue box holder was resized from a box template to about 9.5 × 4.5 in.
- **Cuttle's hinged-lid box template** has an integrated hinge and a finger hold. The parts press-fit together without glue.
- **Best-selling home pieces** in the maker galleries:
  - **Napkin holders:** two decorated side plates tabbed into a base. On café tables they have a wave, scallop or dip so a hand can reach the napkins.
  - **Tissue box covers:** a bottomless box with a slot or round opening, often in floral or lattice fretwork.
- **Gift and corporate sellers** show two upgrades:
  - **Clear lids:** wine boxes with a clear slider lid that is engraved with a message, and keepsake or display boxes with an acrylic window.
  - **Crates with hand holes:** used for hampers and storage.

### What was missing in HingeLab

HingeLab had none of these products: no napkin holder, no tissue cover, no hand holes, no window or clear lid. It also had no way to cut part of a box from a second material.

### What was added

- **Napkin holder (new design).** Two plates stand in a slotted base. Each plate has two tabs as thick as the sheet, and they pass through matching slots.
  - Plate shapes: rounded, arch, grip dip (a round dip to reach in) and two-wave.
  - Settings: width, height, napkin room, corner radius and base margin.
  - The lid engraving goes on the front plate, below the lowest point of its top edge. The cut-out pattern goes on the plates.
  - Check: `NAPKIN_TIPS` warns when the plates are too tall for the base depth. Its fix widens the base.
- **Tissue box cover (new design).** A finger-jointed box turned upside down: four walls and a top with an opening, open underneath.
  - Openings: slot, oval or round.
  - Sizes are inside sizes, measured from the tissue box.
  - The engraving goes on the front wall. The pattern can go on the walls and the top.
  - Check: `TISSUE_OPENING` warns when the opening reaches into the top's finger joints, and shrinks it to keep 8 mm of wood.
- **Hand holes** (`box.handles`, `tray.handles`) in the two end walls of a box or tray. They work with every lid except the pin hinge, whose cheeks sit there.
  - Each hole is 24 mm tall and up to 90 mm long. It is placed below the lid's fittings and above the bottom's fingers.
  - A tray's dividers are lowered to stay below the holes.
  - Check: `HANDLE_ROOM` warns when the walls are too low or too short. The fix raises the walls, or removes the holes.
- **Clear lids** (`box.glass`), using a second material.
  - **Window and pane:** for closed, lift-off, hinged and inset lids. A window is cut in the lid face, and a clear acrylic pane (default 2 mm) is glued under it with a 6 mm glue lap.
    - The pane clears the lid's lip, ledges or hinge cheeks, and the window shrinks to fit.
    - A lift-off lid's lip becomes a frame round the pane.
    - An inset lid's knob moves to the front.
    - The lid's text or motif moves to the front wall, so the window stays clear.
  - **Clear lid:** for sliding, lift-off and inset lids. The whole lid is cut from acrylic as thick as the wood, so a sliding lid still runs in its groove.
  - Checks: `GLASS_LID` (this lid cannot take that kind of glass; the fix switches to the kind it can take) and `WINDOW_SMALL` (no room for a pane; the fix switches to a clear lid or none).
  - The output lists the acrylic as the second material.
- **A pattern on the walls stays clear of a wall's engraving.** This happens when a window moves the lid art to the front.
- **New presets (12):**
  - `napkin-cafe`, `napkin-floral`, `napkin-cocktail`
  - `tissue-cover`, `tissue-cube`, `tissue-engraved`
  - `storage-crate`, `serving-tray`, `caddy-tray`
  - `memory-window-box`, `display-case`, `clear-wine-box`

All new options default to the old behaviour. Version 1 builds and every existing preset thumbnail came out unchanged.

## Paper Box / Wood Packaging (`paperbox`)

### What competitors offer

Packaging sellers lean on two things:

- **Display:** clear-lid wine and champagne boxes, window gift boxes, and chocolate or soap boxes that show the product.
- **Carry:** hamper crates with hand holes.

### What was added

Paperbox shares the Boxes engine, so it gains every option above: hand holes, windows with panes, and clear lids. Its presets (exposed in Boxes as `packaging-…`) gain four packaging products:

- `window-gift-box`: lift-off lid with a window.
- `chocolate-display`: hinged lid with a window.
- `clear-soap-box`: sliding clear acrylic lid.
- `gift-crate`: open hamper crate with hand holes.

The preset helper now accepts box options (`more.box`).

## Shadow Box (`shadowbox`)

### What competitors offer

The best-selling layered shadow boxes and light boxes (So Fontsy, Etsy, Jennifer Maker) are mostly night scenes:

- **Christmas villages:** houses, a church and birch trees, with a layer of star cut-outs, lit by fairy lights.
- **Castles** under the stars.
- **Mountain and forest scenes** with a moon.
- **Nursery "twinkle" designs.**

Layered Christmas ornaments are also a big category, on Cricut and on lasers: about five layers of card or plywood glued with foam, with a hole at the top for a ribbon.

### What was missing in HingeLab

HingeLab had hills, peaks, waves, a city, a forest and clouds, plus one light hole. It had no houses or castle, no scattered stars, and no way to hang a small stack as an ornament.

### What was added

- **Stars in the sky** (`design.stars`, `design.star`, `design.starSize`). Up to 120 little stars, dots, four-point sparkles or a mix are cut through the plain back board.
  - Placement:
    - In a scene they sit in the sky: above the ridges, or below them when the scene hangs from the top.
    - Otherwise they spread over the whole window.
    - They are seeded by the Variation setting.
  - Spacing: each star keeps paper at least as wide as the narrowest bridge from the window's edge and from the other stars. They also keep clear of the light hole.
  - A light box shines through them, so `LIGHT_BLOCKED` is no longer raised.
  - Checks: `STARS_NO_BACK` (the stack has no back board; the fix adds one) and `STARS_FEWER` (fewer fit than asked; info, with fixes).
- **Village and Castle scenes** (new ridges):
  - Village: houses with pitched roofs and the odd chimney, in seeded rows.
  - Castle: towers with pointed roofs between crenellated walls.
  - Both work from the bottom, from the top or both. Rail pictures are drawn for both.
- **Ribbon hole** (`box.hang: "ribbon"`, `box.ribbon`). One hole is drilled through the top middle of the border of every part: layers, spacer frames, back board and rings. It lines up through the stack, so a small round stack hangs like an ornament.
  - Its size counts in the `BAND_TIGHT` border check, whose fix widens the border.
- **New presets (8):**
  - `christmas-village`, `castle-dreams`, `starry-pines`, `twinkle-nursery`
  - `village-lightbox`: plywood, LED light box, finger-jointed box.
  - `snowflake-ornament`, `star-ornament`, `village-ornament`: 90 to 100 mm ornaments with a ribbon hole.

Existing outputs are unchanged: with 0 stars and no ribbon, the stack is built exactly as before.

## Sources

- boxes.py project page (list of generators and joint types): https://hackaday.io/project/10649-boxespy?page=3
- xTool Studio project generators (tissue box, treasure box, ornament): https://support.xtool.com/article/3248
- Cuttle hinged-lid box template: https://cuttle.xyz/blog/new-hinged-lid-box-cuttle-template.md
- Box generator overview (MakerCase and others): https://sandbox.umd.edu/wiki/index.php/Laser_Box_Generator_Programs
- Semigloss Design, DIY napkin holder (plates tabbed into a base): https://www.semiglossdesign.com/diy-napkin-holder
- xTool napkin holder projects: https://projects.xtool.com/project/6377-napkin-holder and https://projects.xtool.com/project/35062-diy-decorative-napkin-holders-ideal-for-cafes-and-restaurants-table-decor-550
- Glowforge Shop, wave-patterned vertical napkin holder (search result): https://uk-shop.glowforge.com/products/vertical-napkin-holder
- Atomm, laser-cut wooden tissue box holder with floral pattern: https://www.atomm.com/vi/project/93599-laser-cut-wooden-tissue-box-holder-with-floral-pattern
- xTool tissue box cover projects (search results): https://projects.xtool.com/project/6027-tissue-box-cover and https://projects.xtool.com/project/17086
- Personalised wine box with a clear engraved lid: https://personalisedfavours.com.au/products/natural-wooden-wine-and-champagne-box-with-engraved-acrylic-lid and https://personalisedfavours.com.au/products/engraved-corporate-wooden-wine-box-acrylic-lid
- Laser-cut keepsake and hinged boxes (Atomm/xTool galleries): https://www.atomm.com/project/111985-decorative-laser-cut-box-svg-hinged-lid-wooden-storage-design-3mm and https://projects.xtool.com/project/42805-trio-of-intricate-keepsake-boxes-bundle
- Jennifer Maker, village shadow box with lights (houses, a star layer, fairy lights): https://jennifermaker.com/village-shadow-box-with-lights/
- So Fontsy Christmas light boxes and layered shadow boxes: https://sofontsy.com/products/christmas-3d-layered-shadow-box-christmas-light-box-svg and https://sofontsy.com/products/christmas-night-window-mountain-view-shadow-box-santa-claus
- Sweet Red Poppy, layered Christmas ornaments (five layers, ribbon hole): https://sweetredpoppy.com/layered-christmas-ornaments-free-svg-files/
- Layered ornaments on lasers and Cricut (search results): https://projects.xtool.com/project/22040-layered-christmas-ornament and https://sofontsy.com/products/christmas-baubles-3d-layered-svg-cut-files
