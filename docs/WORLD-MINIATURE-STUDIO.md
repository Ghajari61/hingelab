# World Miniature Studio: status

Milestone 1 of the "World Miniature & Architecture Studio Pro" master prompt. The prompt as received was cut off at section 19 ("Testing require…"), so section 19 onward is not covered. Decision records: D224 (milestone 1) and D225 (milestone 2: fronts, grounds, chimneys, more furniture and garden pieces).

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
| 9. Components | Partial (milestone 2). Door leaves, steps, shopfronts, porches and verandas, balconies with railings and brackets, chimneys, fences and gates, paths, flower beds, trees, bushes, lamps and planters. Columns and stair railings are not done yet. |
| 14. Templates | 53 original templates: 26 buildings, 6 nooks, 15 furniture pieces and 6 garden and street pieces. |
| 18. Quality | Contract tests, plus preset and geometry tests (no warnings, no shared material, slots filled). |

## Not yet done

- Sources for each tradition, then a review before any tradition is marked verified.
- Components (section 9): columns, stair railings, dormers and window boxes.
- Manufacturing (section 11): calibration coupons, part labels, sheet-by-thickness grouping beyond what the shell does, and an assembly-order diagram.
- Machine profiles (section 12): an xTool P3 profile waits on verified manufacturer specifications.
- Exports (section 13): GLB, BOM (CSV) and an assembly PDF, each to be validated with a real generated file before it is listed.
- Cost estimate (section 17).
- AI (section 16), to run server-side only.
- The separate studio UX with twelve sections (section 15). For now the generator's sections are Design, Building, Roof, Windows and doors, Front, porch and balconies, Garden and street, Garden and street piece, Book nook, Furniture and Joints.
- More nook scenes and building types: towers and temples.
- Section 19 onward of the prompt, which was not received.
