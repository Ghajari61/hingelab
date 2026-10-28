import { it } from "vitest";
import { POPUP } from "../popup";
import { checkSwitchedPreset } from "./popupSpiralPresetChecks";

// Every built-in preset switched to Multi with 2 arms in the editor: builds, checks, SVG/Lay Flat parity,
// supports clear of the formed strip and the fittings, matching joints and a bounded 3D mesh.
for (const pr of POPUP.presets) it(`${pr.id}: multi2`, () => { checkSwitchedPreset(pr.id, "multi", 2); }, 60000);
