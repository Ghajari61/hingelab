# Fabrication audit (October 2026)

What the design-to-fabrication overhaul started from. Each problem is reproduced before its behaviour changes; the ones a test can pin live in `lib/fab/__tests__/baseline.test.ts`.

## Reproduced problems

| Id | Problem | How it shows | Reproduced by | Cause |
|---|---|---|---|---|
| A1 | Shadow Box with the blade cutter: the status says the layers fit fewer mats than they need. | 4 layers of 5 × 7 in on a 12 × 12 in mat: "2 sheets", but the assembly says "cut every layer from its own colour of card", so 4 mats. | `baseline.test.ts` A1 (failed: 2 sheets for 4 colours) | The packer separates parts only by `material: "second"` (`lib/generators/output.ts` `byMaterial`); a layer's colour (its stock) never reaches it. |
| A2 | "Fit to N sheets" fixes shrink the product but are marked safe, so Auto-fix all can resize a design. | Sign on a small sheet, Hinge Box larger than its sheet. | `baseline.test.ts` A2 (failed: `safe: true`) | `lib/generators/output.ts` `sheetIssues` and `lib/issues/hinge.ts` mark the fit fixes `safe: true`; a safe fix must not change what the design is (`lib/issues/index.ts`). |
| A3 | Resizing is a layout mode. "Fit to sheets" shrinks the product while packing it, with no statement of the original size, the new size or the factor before it applies. | Fit section: "Fit to 1 sheet". | Code reading (`lib/fit/fitToSheets.ts`, `lib/fit/arrange.ts`) | Arrangement and resizing share one setting. |
| A4 | No view shows the nominal design: the canvas and the 3D view show kerf-compensated geometry. | Any product with kerf. | Code reading | Kerf is applied while parts are cut (`cutPart`), and only that geometry reaches the views. |
| A5 | Geometry checks (open paths, duplicate cuts) exist only in the Studio's preflight. | Generators, Hinge Box, Letters and Parametric have no shared check for self-intersections, duplicate cuts, out-of-bed parts or loose islands. | Code reading (`lib/studio/preflight.ts`) | Each product grew its own checks. |
| A6 | Height maps lose precision: pictures are decoded through a canvas (8-bit), the relief grid is capped at 256 cells, the depth is clipped at the 1st/99th percentile and blurred by default (σ 2 px). | A 16-bit PNG gradient becomes 256 steps. | Code reading (`components/parametric/depthProtocol.ts`, `lib/parametric/source/relief.ts`) | No PNG decoder; defaults tuned for estimated depth, applied to every input. |
| A7 | Parallel slices are axis-aligned with uniform spacing only; the slicer cannot be cancelled. | | Code reading (`lib/parametric/slice/planes.ts`, `components/parametric/slicer.worker.ts`) | |
| A8 | The cloud dashboard is titled "My boxes" and lists three products; generators save on the device only. | `/app` | Code reading (`components/projects/ProjectsHome.tsx`) | |
| A9 | No calibration coupons beyond the 100/50 mm scale bar and a 10 mm kerf square. | | Code reading (`lib/fit/calibration.ts`) | |

## Working and kept

- Every product stores lengths in mm; inches are display only.
- Kerf is applied once for generators (in the shell, from nominal parts, again from nominal when a part is turned) and once for Parametric (`kerfPart`). Letters applies K/2 in seven modules: correct today, but fragile.
- The issues framework (levels, fixes, part ids), the exporters (SVG, DXF, PDF, LightBurn, ZIP), the workers (slicer, depth, generator builds) and Persian shaping (HarfBuzz) are reused rather than replaced.
