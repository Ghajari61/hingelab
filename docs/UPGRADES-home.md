# Home generators: Clock, Puzzle and Key Holder upgrades

Research for the Clock, Puzzle and Key Holder (key rack and wall organiser) generators. Ideas came from public product pages, project galleries, guides and seller listings. No designs, files or brand artwork were copied. Every new outline in HingeLab is drawn from scratch.

## Clock

### What competitors offer

- **Etsy, Folksy and Atomm/xTool galleries:** mostly layered and mandala clocks, intricate cut-through faces, and personalised family and memory clocks. Desk clocks with a stand and heart patterns are also common. Gear clocks and visible-gear mechanical clocks are a niche of their own.
- **Ponoko's project roundup:**
  - Numbers cut through to show a coloured backing.
  - Faces made of contrasting materials, such as white acrylic on bamboo or acrylic over birch.
  - Hours spelled out in words.
  - Setting-sun and sunburst shapes.
  - Faces in a natural material.
- **Glowforge catalog:** a Roman-numeral passthrough clock (it names a high-torque movement and a 0.4 in shaft hole), a mid-century moon-and-stars wall clock and a customisable desk clock.
- **Teaching clocks** (CNC King, Jaques, Montessori sellers): big hour numbers with a ring of minute numbers round the outside, second ticks and extra-large hands.
- **Quartz hand suppliers** (Timesavers and others): standard push-on hour and minute hands, plus a separate second hand on its own thin pin.

### What HingeLab already had

- Ten face shapes.
- Ring and stack layers.
- Numerals, ticks or dots, engraved, scored or cut through.
- Text on the dial.
- Five hand styles with movement-sized holes.
- A keyhole hanger and a slot-in stand.

### Added

- **Star face:** set the number of points, the depth of the inner corners and the corner rounding. The markers stay inside the star's inner circle.
- **Wood slice face:** an irregular, bark-like round edge. Each "Slice number" gives a different outline, and Randomise picks a new one.
- **Raised markers:** the numerals, hour ticks or dots are cut from a second material, such as gold, silver or rose mirror acrylic, coloured acrylic or walnut veneer, and laid out on their own sheet.
  - Each marker is welded into one piece.
  - A scored outline on the face (or the ring) shows where to glue it.
  - Minute ticks stay engraved.
  - New check `RAISED_UNDER_HANDS`: it flags raised markers under the minute hand's sweep. It is a warning above 3 mm thickness and a note at 3 mm or less. Fixes: shorten the minute hand, or use 2 mm material.
- **Minute numbers (teaching clock):** twelve numbers, 5, 10 … 60, round the outside. The hour numerals, ticks and text on the dial move in to make room.
  - `MINUTE_NUMBERS_CROWDED` has a fix for a smaller number size.
  - `MINUTE_NUMBERS_NO_ROOM` has two fixes: a bigger face, or leaving the minute numbers out.
- **Second hand:** a slim needle as long as the minute hand, with a disc counterweight. Its hole is sized for the movement's seconds pin (1 mm, editable under Custom sizes).
  - The needle is never under 2 mm wide.
  - `SECOND_HAND_HEAVY` is a note when it would be cut from material over 3 mm thick.
- **Presets:** `teaching-clock`, `wood-slice`, `mirror-numerals`, `star-clock`, `station-seconds`.

## Puzzle

### What competitors offer

- **Nervous System custom puzzles:**
  - Six cut styles.
  - Whimsy pieces: letters, numbers and figures placed inside the puzzle.
  - Custom outlines.
  - A message engraved on the back.
- **Liberty Puzzles:** known for many recognisable whimsy pieces, sometimes over 20 % of the puzzle, including a signature figure.
- **Etsy personalised puzzles and LaserPecker's guide:** photo puzzles on plywood or acrylic. Engrave first, then cut.
- **Atomm Name Puzzle Generator and toddler tray puzzles on Atomm and xTool:**
  - Pieces cut from the panel they sit in, with a base glued under it.
  - Two glued discs on each piece as a grip knob.
  - Chunky pieces.
  - Shape-sorting trays.
- **Classic wooden puzzle makers:** flared, straight-sided dovetail knobs as well as round knobs.

### What HingeLab already had

- Ten outlines.
- Classic, kids, wavy and straight cuts.
- Merging of small edge pieces.
- A frame or tray.
- Engraved picture, text or piece numbers.

### Added

- **Dovetail tabs:** a flared knob with eased corners. Its neck is used by the existing `THIN_NECK` check.
- **Whimsy pieces:** a heart, star, circle, flower or house cut inside chosen pieces (picked by the layout number) as its own closed cut, with at least 3 mm of wood round it.
  - They count as pieces, so they count toward the Pro limit.
  - Piece numbers are placed beside the figure, never under its cut.
  - `WHIMSY_NO_ROOM` fires when fewer fit than asked. Its fixes are a smaller figure or fewer figures.
- **Grip knobs:** one or two stacked discs per piece, at the piece's roomiest point, with a scored ring to glue each one on.
  - `KNOB_TOO_BIG` has a fix for a smaller diameter.
  - `KNOBS_HIDE_NUMBERS` fires when the knobs would cover the engraved numbers.
- **Piece guide:** the cut lines are scored on the tray base, so small children can match each piece to its place.
- **Hanging holes:** two holes in the frame's top border, and through the tray base, to hang the finished puzzle. `HANG_NO_ROOM` has a fix for a wider border.
- **Presets:** `toddler-knobs`, `whimsy-hearts`, `dovetail-30`, `wall-display`, `star-whimsy-kids`.

## Key Holder

### What competitors offer

- **Betsy Benn (notonthehighstreet):** personalised name key holders with a letter rack built in. One listing describes six magnets holding the keys. They are cut from veneered plywood.
- **Enjoy the Wood:** layered city-map key holders with hidden neodymium magnets in the bottom edge (4 magnets in size M, 6 in size L).
- **Supermagnete and maker guides (Instructables, Fix This Build That):**
  - Magnetic key racks with disc magnets glued into through holes, flush with the front, or in recesses from the back.
  - Magnets hold the steel key rings, not the keys.
- **Thunder Laser and FreePatternsArea:** a key box or cabinet with two rows of hooks, and mini wall shelving.
- **The Metal Peddler:** themed key and lead racks.

### What HingeLab already had

- Eighteen board shapes.
- Text and a motif, engraved, scored or raised.
- Slot-in hooks (J, square and ball profiles).
- Dowel pegs and cup-hook pilot holes.
- Names above the hooks.
- A shelf on brackets.
- Keyholes.

### Added

- **Mail pocket:** a bottom tabbed into the board, two sides slotted into the board and the bottom, and a front standing in slots near the bottom's front edge. All slots match the material thickness, and the pocket height can be set.
  - `POCKET_OVER_HOOKS` has three fixes: a shorter pocket, a lower hook row, or a taller board.
  - `POCKET_OVER_TEXT` moves the text below the pocket.
  - Like the shelf, the pocket needs Pro.
- **Magnets:** a hook type with holes sized to disc magnets and a strip, cut from the same sheet, glued behind the row so the magnets cannot push out.
  - `MAGNET_PROUD` warns when the magnets are thicker than the board.
  - `MAGNET_SUNK` and `MAGNET_SMALL` are notes for weak holding.
- **Two new hook profiles:** an angled Shaker-style peg rising 25° to a ball, and a two-armed coat hook. Both keep a tab exactly the material's thickness.
- **Presets:** `mail-pocket`, `magnetic-bar`, `coat-rack`, `shaker-pegs`.

## Sources

- https://www.xtool.com/blogs/how-to/make-a-clock
- https://www.ponoko.com/blog/design-ideas/laser-cutter-projects-ideas/
- https://shop.glowforge.com/products/roman-numeral-passthrough-clock
- https://shop.glowforge.com/products/customizable-elegant-timepiece-desk-clock-ver-1
- https://www.atomm.com/project/107740-laser-cut-wooden-wall-clock-with-gear-mechanism-design
- https://cncking.com/new-wood-project-release-time-teaching-clock
- https://timesavers.com/c-325685-clock-repair-replacement-parts-hands-related-hands-for-quartz-movements-push-on-only.html
- https://n-e-r-v-o-u-s.com/customPuzzle
- https://en.wikipedia.org/wiki/Liberty_Puzzles
- https://us.laserpecker.net/blogs/user-guide/jigsaw-puzzle-laser-cutting
- https://www.atomm.com/creativetools/community/name-puzzle-generator
- https://www.atomm.com/project/149874-toddlers-heavy-machinery-puzzle
- https://www.notonthehighstreet.com/betsybenn/product/personalised-name-wooden-key-holder-and-letter-rack
- https://enjoythewood.com/products/wooden-key-holder-custom
- https://www.supermagnete.de/eng/Magnet-applications/Magnetic-key-rack
- https://www.thunderlaser.com/?p=46126
- https://www.freepatternsarea.com/designs/plywood-key-box-holder-laser-cut-idea/
- https://themetalpeddler.com/en-ca/products/skeleton-antique-key-style-holder
