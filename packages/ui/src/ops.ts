/**
 * The laser operations' colours, one palette for the cut files, the canvas, the layer legend and the
 * export dialog. `color` is what the exported files use (and must not change: LightBurn, xTool and
 * the golden tests read it); `dark` is the same colour lifted for the dark themes' canvas, where pure
 * blue and black would not show.
 */
export const OPS = {
  cut: { name: "Outline cut", color: "#FF0000", dark: "#FF5252", css: "--l-outline" },
  inner: { name: "Inner cuts", color: "#00E000", dark: "#3DDC6E", css: "--l-slots" },
  hinge: { name: "Hinge slits", color: "#0000FF", dark: "#6E8BFF", css: "--l-hinge" },
  score: { name: "Score lines", color: "#FF8000", dark: "#FF9F40", css: "--l-score" },
  engrave: { name: "Engrave", color: "#000000", dark: "#D8D8D8", css: "--l-labels" },
} as const;

export type Op = keyof typeof OPS;
