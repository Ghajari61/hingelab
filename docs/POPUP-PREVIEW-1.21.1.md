# Pop-up cut geometry and 3D preview correction

The Ripple display bowl screenshot reproduced a topology error shared by all 36 presets. Final
joint/handle/cord cuts were clipped only to a ring's outer boundary, then unioned with its
negative-wound centre opening. Opposite winding cancelled areas of the opening. Rendering that
result with the even-odd fill rule created wooden islands out of holes belonging to lower rings.
The outer ring of the 220 mm Ripple bowl alone displayed more than 50 spurious islands.

The preview is now constructed after every manufacturing cut is complete. Each ring's complete
material region is subtracted by the relevant final cuts; canonical outer/hole contours from that
operation go directly to the mesh. Engraving is clipped to that same solid. Cut geometry and kerf
compensation remain unchanged, as confirmed by the existing SVG snapshots.

Rings on rigid supports are separate pieces after their holding lands are cut. The old opening
slider lowered them straight through their stationary ribs and was not a valid assembly motion.
These models now use the real Assembled and Lay flat states, with explicit exploded displacements
for rings, ribs and accessories. Cords and fittings remain visible in the assembled model and are
hidden in the exploded model. Other generators retain their folding behavior.

Validation includes:

- Boolean differences between every rendered ring height and the final cutting material for all
  36 presets, detecting extra islands and missing joint material.
- Existing transformed tab/slot checks, 2/3/4/6 mm material cases, clearances, connected supports,
  nested sets, sleeve openings, accessories, all preset SVG snapshots and Windows API exports.
- Shared scene folding/exploding regressions and browser inspection of assembled, exploded and
  flat states, including pendants, radial ribs and nested sizes.

Holding lands still require separation before assembly; tabs locate rings and require retention
such as glue. Continuous spiral previews remain sampled targets, not elastic strip simulations.
No physical cutting, fit, strength or load certification is claimed.
