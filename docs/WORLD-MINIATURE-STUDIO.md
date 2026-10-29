# World Miniature Studio: status

Milestone 1 of the "World Miniature & Architecture Studio Pro" master prompt. The prompt as received was cut off at section 19 ("Testing require…"), so section 19 onward is not covered. Decision records: D224 (milestone 1), D225 (milestone 2: fronts, grounds, chimneys, more furniture and garden pieces) and D226 (milestone 3: dormers, columns, stair railings and window boxes).

## Delivered (milestone 1)

| Prompt section | Status |
| --- | --- |
| 1. Repo discovery and safety | Done. An architecture audit came first, on branch `feature/world-miniature-studio-pro`. No generator was removed, and no schema or export format changed. |
| 2. Product integration | Done as generator `miniature`, at `/app/editor/local?p=miniature`. It uses the shell's auth, projects, autosave, export, batch, help and entitlements. |
| 3. Global architecture library | Partial. `traditions.ts` holds 29 traditions from 16 regions: names, countries, regions, period, typologies, roof, windows, doors, structure, decoration, materials and a model kit. All are marked `unverified` with no sources yet. |
| 4. Parametric CAD kernel | Partial. `kit.ts` provides the tabbed frame, matrix-placed planar panels, openings, lattice screens and scored wall and roof finishes. It is not a general constraint solver. |
| 5. Joint engine | Partial. Through-tabs and slots sized from T, with four fit steps; kerf is applied by the export. There are no snap-fits, living hinges or dovetails yet. |
| 6. Dollhouse | Done. 1–6 floors, rooms, doorways, stairs with a stairwell, an open front or facade, six roofs, a windcatcher tower, windows and doors, trim, shutters and wall finishes. |
| 7. Book nook | Done. Alley and arches scenes, a light box with ceiling slots and a cable hole, a battery bay with a hatch, a mirror frame and low-voltage safety notes. The optical effect is not claimed. |
| 8. Furniture | Done for 14 kinds, at 1:6 to 1:48 or a custom scale. Joints, fit and kerf are not scaled. |
| 10. 3D | Done through the shared assembled 3D view and thumbnails. It is not a physical simulation. |
| 13. Exports | SVG, DXF and PDF through the existing, tested export pipeline. |
| 9. Components | Done for the house (milestones 2 and 3): door leaves, steps, shopfronts, porches and verandas on square, turned or classical posts, balconies with railings and brackets, pilasters, window boxes, dormers, chimneys, stair railings, fences and gates, paths, flower beds, trees, bushes, lamps, columns and planters. |
| 14. Templates | 56 original templates: 28 buildings, 6 nooks, 15 furniture pieces and 7 garden and street pieces. |
| 18. Quality | Contract tests, plus preset and geometry tests (no warnings, no shared material, slots filled). |

## Milestone 4

- Section 3, library: every real tradition lists fetched sources and is `sourced`, with four corrections. Specialist review is still to do.
- Section 11, manufacturing: the joint fit test coupon.
- Section 12, machines: the xTool P3 profile, from xTool's published figures.
- Section 13, exports:
  - GLB (validated by reading each file back with three's glTF loader) and a parts list as CSV.
  - The existing SVG, DXF, PDF, LightBurn and STL.
- Section 15, UX: the `/miniature-studio` guide with twelve sections. The section's original text was not available, so the layout is an interpretation of its outline.
- Section 16, AI: the AI designer offers the Miniature Studio. It runs server-side, with no keys in the browser.
- Section 17, cost: the export dialog's job summary, labelled as estimates.

## Milestone 5

- Section 13, exports: the Assembly PDF booklet, with step drawings, the parts list and the notes (D228).

## Not yet done

- A specialist review of the library, before any tradition is marked `reviewed`.
- Section 19 onward of the prompt, which was never received.
