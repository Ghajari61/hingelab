/** Which help article explains each panel section. Small on purpose: the editors import it. */
export type HelpProduct = "hinge" | "letters" | "parametric";

/** Panel section title (as shown in the dock) to article slug. */
export const SECTION_HELP: Record<HelpProduct, Record<string, string>> = {
  hinge: {
    Dimensions: "hinge-dimensions",
    Material: "material-and-kerf",
    "Hinge Pattern": "hinge-pattern",
    "Bend Analysis": "hinge-analysis",
    "Joints & Fit": "box-joints",
    Layers: "layers-and-export",
    Sheet: "sheet-and-fit",
  },
  letters: {
    Text: "letters-text",
    Box: "letters-box",
    Stencil: "letters-stencil",
    Mode: "letters-solid",
    Material: "material-and-kerf",
    "Hinge Pattern": "hinge-pattern",
    Analysis: "letters-analysis",
    "Joints & Fit": "box-joints",
    Layers: "layers-and-export",
    Sheet: "sheet-and-fit",
  },
  parametric: {
    Source: "parametric-source",
    Method: "parametric-method",
    Material: "parametric-material",
    "Joints & Fit": "parametric-joints",
    Quality: "parametric-quality",
    "Slice Inspector": "parametric-inspector",
    Analysis: "parametric-analysis",
    "Layers & Export": "layers-and-export",
  },
};

/** Left rail group heading to article slug. */
export const RAIL_HELP: Record<HelpProduct, Record<string, string>> = {
  hinge: { Shape: "hinge-shape-and-lid", Lid: "hinge-shape-and-lid", "Hinge pattern": "hinge-pattern", "Hinge style": "hinge-pattern" },
  letters: { Mode: "letters-modes", Walls: "letters-box", Lid: "letters-box" },
  parametric: { Method: "parametric-method" },
};

export const TIPS_HELP: Record<HelpProduct, string> = {
  hinge: "hinge-tips",
  letters: "letters-tips",
  parametric: "parametric-tips",
};

/** Old anchors on /help (studio links) and the article that replaced each. */
export const LEGACY_ANCHORS: Record<string, string> = {
  "first-cut": "getting-started",
  kerf: "material-and-kerf",
  shortcuts: "shortcuts",
  "whats-new": "getting-started",
};
