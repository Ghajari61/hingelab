import { describe, expect, it } from "vitest";
import { clampDockWidth, genSectionStep, isAdvancedKey } from "../workflow";
import { normalizeEditorPrefs } from "../../prefs/editor";

describe("editor workflow", () => {
  it("keeps resizing within the usable panel range", () => {
    expect(clampDockWidth(100)).toBe(280);
    expect(clampDockWidth(900)).toBe(560);
    expect(clampDockWidth(380.6)).toBe(381);
    expect(clampDockWidth(Number.NaN)).toBe(340);
  });
  it("preserves old projects by defaulting to all controls", () => {
    expect(normalizeEditorPrefs({}).detail).toBe("advanced");
    expect(normalizeEditorPrefs({ dockW: -10 }).dockW).toBe(0);
  });
  it("respects explicit product sections and own advanced flags", () => {
    expect(genSectionStep("popup", "profile", "dimensions")).toBe("dimensions");
    expect(genSectionStep("paperbox", "box")).toBe("dimensions");
    expect(isAdvancedKey("popup", "support.fit")).toBe(true);
    expect(isAdvancedKey("popup", "support.fit", false)).toBe(false);
  });
});
