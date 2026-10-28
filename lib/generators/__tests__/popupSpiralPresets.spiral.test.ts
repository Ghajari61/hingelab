import { it } from "vitest";
import { POPUP } from "../popup";
import { checkSwitchedPreset } from "./popupSpiralPresetChecks";

// Every built-in preset switched to Spiral in the editor: builds, checks, SVG/Lay Flat parity,
// supports clear of the formed strip and the fittings, matching joints and a bounded 3D mesh.
for (const pr of POPUP.presets) it(`${pr.id}: spiral`, () => { checkSwitchedPreset(pr.id, "spiral", 2); }, 60000);
