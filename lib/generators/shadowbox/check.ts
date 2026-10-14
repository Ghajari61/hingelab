import type { Issue } from "@/lib/issues";
import type { ShadowBoxOutput } from "./build";
import type { ShadowBoxParams } from "./params";

export function checkShadowBox(p: ShadowBoxParams, out: ShadowBoxOutput): Issue<ShadowBoxParams>[] {
  const issues: Issue<ShadowBoxParams>[] = [];
  const info = out.info;
  if (!info) return issues;
  if (info.noWindow) {
    const border = Math.max(5, Math.floor(Math.min(p.frame.width, p.frame.height) / 6));
    issues.push({ code: "NO_WINDOW", level: "error", message: "The frame's border leaves no window for the pattern.", fixes: [{ id: "border", label: `Border ${border} mm`, safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border } }) }] });
    return issues;
  }
  if (p.frame.border < 5) {
    issues.push({ code: "THIN_BORDER", level: "warn", message: "A frame border under 5 mm is fragile and leaves little room for glue or foam tape.", fixes: [{ id: "border", label: "Border 10 mm", safe: true, apply: (q) => ({ ...q, frame: { ...q.frame, border: 10 } }) }] });
  }
  if (p.design.web < 1) {
    issues.push({ code: "THIN_WEB", level: "warn", message: "Paper bridges under 1 mm tear when you weed the cut, or burn through on a laser.", fixes: [{ id: "web", label: "Bridges 1.5 mm", safe: true, apply: (q) => ({ ...q, design: { ...q.design, web: 1.5 } }) }] });
  }
  if (info.open > 1) {
    const max = Math.max(p.design.min + 10, Math.round(p.design.max * 0.85));
    issues.push({
      code: "OPEN_LAYERS", level: "info",
      message: `${info.open} layers are only the frame: their cut-outs fill the whole window.`,
      fixes: [{ id: "smaller", label: `Front cut-out ${max}%`, safe: false, apply: (q) => ({ ...q, design: { ...q.design, max } }) }],
    });
  }
  if (info.dropped > 0) {
    issues.push({ code: "LOOSE", level: "info", message: `${info.dropped} loose piece${info.dropped > 1 ? "s" : ""} inside the cut-outs ${info.dropped > 1 ? "were" : "was"} left out: nothing held ${info.dropped > 1 ? "them" : "it"} to the frame.`, fixes: [] });
  }
  return issues;
}
