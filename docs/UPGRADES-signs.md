# Signs, Trophies and Cake Toppers: competitor research and upgrades

Ideas came from public product pages, maker galleries and how-to articles. No designs, files or brand artwork were copied. All new geometry is original, and every new option defaults to the old behaviour.

## Sign

### What competitors offer

- **Edge-lit acrylic signs on wooden LED bases:** xTool sells walnut and rubber-wood LED bases with an open slot. Atomm, xTool, Instructables and university makerspace projects cut and engrave a clear acrylic panel and stand it in a lit base.
- **Two-sided signs:**
  - Open/closed signs (Atomm pattern files, retail reversible signs).
  - Hanging shop and door signs that read from both sides.
- **Desk and shelf signs that stand on their own:** Glowforge has an interchangeable sign with an easel that holds it at an angle, plus shelf-sitter signs. Hey Let's Make Stuff sells a standing sign.
- **Multi-layer and floating signs:** Epilog's layered signage, and Cuttle's floating name sign, which uses a clear middle layer. HingeLab already had layered, inlay, neon-look and stencil builds.

### What was added

- **Leaning feet mount:**
  - Two slotted feet that tilt the sign back 0 to 25° for a desk or counter.
  - Level pads under round or shaped boards so they stand straight.
  - The feet profile is reused from the QR generator.
- **LED base mount:**
  - The sign gets one wide tab, as long as the top plate is thick.
  - The base is cut from the second material in layers: a solid bottom plate, channel layers, and a top plate with a slot (panel thickness + 0.15 mm).
  - The channel layers have a 12 mm pocket for a 10 mm LED strip or USB LED board, plus a notch at the back for the cable.
  - It also works for neon-look and cut-out word signs.
- **Back face for engraved signs:**
  - A second board, cut mirrored and glued behind the front. It shows either the same marks (a two-sided hanging sign) or other words (an OPEN/CLOSED flip sign).
  - The board grows to fit the longer side.
  - Desk-stand slots and feet slots widen to hold both boards.
- **New checks, with fixes:**
  - `SIGN_TIPS`: a stand, feet or LED base that is too shallow for the sign's height.
  - `LED_BASE_SHALLOW`: thin walls round the LED pocket.
  - `LED_PANEL` (info): the panel is not cut from acrylic.
  - `LED_BASE_MATERIAL` (info): the base is acrylic; wood hides the LEDs better.
- **New presets:** `open-closed-flip`, `two-sided-bakery`, `led-name-light`, `led-shop-plaque`, `reserved-feet`, `welcome-desk-feet`.

## Trophy

### What competitors offer

- **Custom-shape acrylic awards:** US Acrylic Awards sells them; Lightforce sells marble acrylic plaques with frames.
- **Wall plaques:** wooden plaques with an engraved or acrylic plate (Qstomize, Gravotech's award-making guide).
- **LED-lit acrylic awards:** a clear acrylic figure on a lit wooden base, the same LED bases as for signs.
- **Built trophies:** Trotec's anniversary trophy uses notched acrylic and wood, slotted with no glue, with a metal tag on a chain.
- **Medals and rosettes:** prize ribbons and laser-cut medals are a staple for sports days and races.

### What was added

- **Display:**
  - **Standing base:** as before.
  - **Wall plaque:** a backing board (rounded, arch, shield or octagon) with a set margin and two hanging holes in the top margin. The figure is glued on with no tabs.
  - **Medal:** a loop on top with a ribbon slot 1 mm wider than the ribbon, and no base.
- **LED light for the base:** a solid bottom plate and channel layers with an LED pocket and cable notch go under the stepped tiers. Every tier is slotted, and the tabs reach down to the LEDs.
- **Rosette emblem:** a scalloped prize rosette with two ribbon tails. It fills its box and has its text centred on the disc.
- **New checks, with fixes:**
  - `PLAQUE_SMALL`: the figure reaches past the plaque's edge.
  - `PLAQUE_HOLES`: a hanging hole runs into the figure or off the plaque.
  - `RIBBON_WIDE`: the ribbon loop is wider than the medal.
  - `LED_BASE_SHALLOW`: thin walls round the LED pocket.
  - `LED_FIGURE` (info): the figure is not clear acrylic.
  - The base-only checks are skipped for plaques and medals.
- **New presets:** `led-glow-star`, `led-rosette`, `rosette-first`, `wall-plaque-shield`, `race-medal`, `sports-day-medal`.

## Cake Topper

### What competitors offer

- **Hoop and frame toppers:** script names welded across a circle, heart or scalloped ring. These are very common on Etsy and in Merchize's custom-shape listings.
- **Shaker toppers:** sprinkles sealed behind a clear window, from sellers who make double-layer and glitter acrylic toppers.
- **Name and age toppers:** a big number with the name in script across it (Etsy milestone toppers, Giftmandu).
- **Construction tips:** LaserPecker recommends 2–4 mm acrylic or 3 mm wood, a sturdy stem, and food-safe covering for the stem. Cuttle's graduation topper welds the name to its backer and uses an inset score line to line it up.

### What was added

- **Hoop style:** the words are welded across an open ring in any plate shape, sized so the words run past the ring. Frame width is set by the user, and islands are bridged so the piece cuts in one.
- **Shaker style:**
  - A back layer carrying the sticks, 1 to 4 spacer rings, and a window cut from the second material with the words engraved.
  - Assembly notes cover the fill level and sealing.
- **New checks, with fixes:**
  - `FRAME_THIN`: a thin hoop ring or shaker wall.
  - `SHAKER_WINDOW` (info): the window is not clear acrylic.
  - `PLATE_SMALL` now covers fixed-size shakers too.
- **New presets:** `hoop-mr-mrs`, `hoop-heart-forever`, `hoop-oh-baby`, `shaker-birthday`, `shaker-heart-sweet16`, `name-and-age`. The name-and-age preset uses the existing Your text motif for the number.

## Sources

- https://www.xtool.com/collections/materials-project-kits/products/rectangular-rubber-wood-led-light-base-with-open-slot
- https://www.xtool.com/collections/material-glass-made-personal/products/material-rounded-rectangular-walnut-wood-led-light-base-with-open-slot
- https://www.instructables.com/Laser-Cutting-and-Engraving-an-LED-Lit-Acrylic-Ply
- https://wp.nyu.edu/makerspace/2022/05/01/edge-lit-acrylic-sign
- https://www.atomm.com/project/2551-danger-laser-in-use-led-sign
- https://www.atomm.com/es/project/21462-open-closed-door-sign-laser-cut-pattern-digital-download
- https://shop.glowforge.com/products/eat-and-home-sweet-home-interchangeable-sign-and-easel
- https://store.heyletsmakestuff.com/collections/glowforge/products/laser-simple-standing-sign
- https://www.epiloglaser.com/en-uk/resources/sample-club/laser-cut-multi-layer-signage/
- https://cuttle.xyz/@byalicelouise/Floating-Text-Name-Sign-oVWKlSuCmW2D
- https://www.troteclaser.com/en/resources/laser-projects/anniversary-trophy
- https://www.gravotech.us/applications/award-and-trophy-making
- https://usacrylicawards.com/choice-lasercut-custom-acrylic-award-15-sq-in
- https://lightforcelaserengraving.com/products/marble-acrylic-award-plaque-color-options-and-bordered-frame
- https://www.qstomize.com/products/plaque-wood
- https://us.laserpecker.net/blogs/how-to/laser-cut-a-cake-topper
- https://cuttle.xyz/@cuttle/Graduation-Cake-Topper-KbYfSPEipAsC
- https://cuttle.xyz/@byalicelouise/Cake-Charm-Stick-IdfBiIaxtdNw
- https://www.etsy.com/listing/1374469293
- https://www.giftmandu.com/custom-acrylic-birthday-year-cake-topper-with-name/
- https://merchize.com/product/custom-shape-acrylic-mirror-cake-topper/
- https://www.ponoko.com/blog/business-tips/cashing-in-on-the-wedding-industry-laser-cut-cake-toppers/
