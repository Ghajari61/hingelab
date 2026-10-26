# Product engineering and preset library release

Review all 16 site products (13 generic generators, Hinge, Letters, Parametric). Preserve existing functionality and calibrations. Add three purposeful, editable presets per product; create actual geometry thumbnails. Make all built-in presets available in the left rail, with searchable/sortable lists and optional preservation of production setup. Audit nominal geometry, kerf/export paths, unsafe values, assembly and preset consistency using existing checks plus regression coverage.

1. Inventory and baseline: enumerate definitions, presets, checks and export paths; document findings.
2. Library slice: common accessible preset browser; Hinge, Letters, Parametric integration; generic generator integration. Verify selection and undo.
3. Preset slices: fabrication objects; signage/events; decorative/sculptural products. Three curated presets each, no new unsupported enums. Validate all presets and server normalization.
4. Engineering slice: reproduce and repair defects found by contract and parameter-boundary tests; preserve units, calibration and stock handling.
5. Verification: catalogue contract, existing tests, typecheck, rendered thumbnails, editor smoke across all products.
6. Release: build Windows 1.11.0, signed updater metadata, PR review/merge, deploy and verify public files.

Risks: physical performance depends on actual stock/machine; software tests cannot certify load-bearing strength or laser settings. Avoid automatic resizing or claiming untested physical builds.
