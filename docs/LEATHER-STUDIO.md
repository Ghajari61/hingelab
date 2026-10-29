# Leather Studio

The Leather Studio generator (`lib/generators/leather/`; it opens at `/app/editor/local?p=leather` and is listed at `/generators/leather`) makes parametric leather patterns. This page records what the first release does, and what it does not do yet, against the "HingeLab Leather Studio Pro" brief.

## What is built

| Area | State |
| --- | --- |
| Products | 41 products in six construction families (bags from faces and a gusset, wrapped bags, bucket, one-piece folded, flat goods, straps). |
| Templates | 42 templates. Three `studio-` templates are cut-ready on the 915 × 458 mm xTool P3 bed, and every template fits that bed. |
| The ten complex products the brief named | All ten: structured handbag with lining and zip, executive briefcase, roll-top backpack, weekender duffel, camera bag with modular dividers, convertible crossbody backpack, doctor bag, multi-gusset satchel, wood-and-leather bag, sculptural folded bag. |
| Seams | Matched by arc length; equal hole counts on every side; length differences reported (`SEAM_MISMATCH`). Mirrored rows for folds; one hole line through stacked layers. |
| Stitches | Saddle, running, cross, whip, box, baseball, decorative lacing (slots), double-row saddle. Round or slanted holes. Thread estimated per seam. |
| Cut files | Laser-cut holes, laser-marked hole positions, or a hand-cutting template (no laser). |
| Hardware | Rivets, snaps, magnetic clasps, buckles, D-rings, O-rings, grommets, eyelets, zips, Chicago screws, sliders, bag feet, snap hooks, key rings. Holes from measured sizes; a bill of hardware. |
| Checks | Laser safety, seam lengths, holes near edges, holes running together, fittings over edges or stitching, weak perforation, card pocket width, parts longer than the bed. |
| Decoration | 17 styles (Persian geometric and floral, boteh, Moroccan, Islamic star, Japanese kikko and minimal, Art Deco, Art Nouveau, Western, Scandinavian, European, Celtic, botanical, modern, contemporary, parametric), perforated, engraved or scored. All are HingeLab's own procedural patterns. |
| Layers | Cut, score (folds, alignment ticks, hole marks), engrave, and the hardware holes, on the existing layer system. |
| Bed limits | Tall parts turned; long strips split into two overlapping parts with a stitched joint; long bag straps split into two halves joined by a buckle. |
| Exports | Everything the generator editor already exports: SVG, DXF, PDF, LightBurn, STL, GLB, parts list (CSV) and the assembly booklet. Laser formats are refused while `LASER_BLOCKED` stands. |
| Cost | The existing job estimate (cut length, time, material). Leather area and hardware are listed in the design's stats. |

## Material safety

- No leather is assumed safe for the laser. Every material needs its composition and the maker's laser guidance confirmed ("Laser use confirmed"), and that confirmation resets when the material changes.
- PVC, vinyl and unknown leatherette are blocked: only the hand-cutting template can be exported.
- Chrome-tanned leather, suede, nubuck, PU, synthetics and leathers of unknown tannage are "not approved" by default.
- Laser files carry a checklist: extraction, filtration, fire watch and operator supervision, and testing on an offcut. No laser settings are given.

## Not done yet

- **120 templates.** The brief's target was 120; this release has 42 templates over 41 products.
- **16 separate navigation sections.** The brief listed separate studios (2D pattern editor, stitching studio, hardware studio, nesting optimiser and so on). Here they are sections of the one generator editor, and nesting, cost and assembly instructions reuse the existing sheet layout, job estimate and assembly booklet.
- **Free-form pattern editing.** Shapes come from the parameters; there is no node editor for leather parts.
- **Physical validation.** Nothing has been sewn or tested on leather. The 3D view is a simplified preview: panels are placed by matrices, curved strips are drawn as flat pieces, and drape, stretch and stitching are not simulated. Flat goods and straps are shown laid out flat.
- **The cost estimator.** The brief was cut off in its cost-estimator section, so leather pricing, hardware prices and labour were not specified and are not built.
- **Long straps that are the product.** Adult belts and full-length leads are longer than the P3 bed. They are not split; a note says to cut them from a blank with a strap cutter or use the hand-cutting template.
