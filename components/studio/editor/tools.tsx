"use client";

import type { ReactNode } from "react";
import {
  ArrowRight, ChartPie, Circle, Cog, Eraser, Grid3x3, Hand, Heart, Hexagon, Lasso, MessageSquare, MousePointer, MousePointer2, Pencil, PenTool, Pill, Pipette,
  RotateCw, RulerDimensionLine, Scaling, Scissors, Shell, Slash, Slice, Spline, Square, Star, Type, WandSparkles, ZoomIn,
} from "lucide-react";
import { TOOL_INFO, type ToolId } from "@/lib/studio/commands";
import type { ToolDef, ToolSlot } from "@/components/ui";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const Reflect = () => <Svg><path d="M12 3v18" strokeDasharray="2 3" /><path d="M9 7 3 17h6z" /><path d="m15 7 6 10h-6z" /></Svg>;
const Shear = () => <Svg><path d="M8 5h12l-4 14H4z" /><path d="M3 21h18" strokeDasharray="2 3" opacity={0.6} /></Svg>;
const ShapeBuilder = () => <Svg><circle cx="9" cy="10" r="6" /><circle cx="15" cy="14" r="6" /><path d="M5 20 19 6" strokeWidth={2.4} /></Svg>;

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 size={18} />, direct: <MousePointer size={18} />, pen: <PenTool size={18} />, pencil: <Pencil size={18} />,
  line: <Slash size={18} />, rect: <Square size={18} />, ellipse: <Circle size={18} />, polygon: <Hexagon size={18} />, star: <Star size={18} />,
  arc: <ChartPie size={18} />, slot: <Pill size={18} />, gear: <Cog size={18} />, arrow: <ArrowRight size={18} />, bubble: <MessageSquare size={18} />,
  heart: <Heart size={18} />, grid: <Grid3x3 size={18} />, spiral: <Shell size={18} />, text: <Type size={18} />, rotate: <RotateCw size={18} />,
  scale: <Scaling size={18} />, reflect: <Reflect />, hand: <Hand size={18} />, zoom: <ZoomIn size={18} />,
  lasso: <Lasso size={18} />, magicWand: <WandSparkles size={18} />, curvature: <Spline size={18} />, scissors: <Scissors size={18} />,
  knife: <Slice size={18} />, eraser: <Eraser size={18} />, shear: <Shear />, shapeBuilder: <ShapeBuilder />, eyedropper: <Pipette size={18} />,
  measure: <RulerDimensionLine size={18} />,
};

const GROUPS: (ToolId | { group: string; tools: ToolId[] } | "-")[] = [
  "select", "direct", "magicWand", "lasso", "-",
  { group: "Pen", tools: ["pen", "curvature"] }, "text",
  "line", { group: "Shapes", tools: ["rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart", "grid", "spiral"] },
  "pencil", { group: "Eraser", tools: ["eraser", "scissors", "knife"] }, "-",
  { group: "Rotate", tools: ["rotate", "reflect"] }, { group: "Scale", tools: ["scale", "shear"] },
  "shapeBuilder", { group: "Eyedropper", tools: ["eyedropper", "measure"] }, "-",
  "hand", "zoom",
];

/** Toolbar slots with the current shortcut of each tool. */
export function toolSlots(keyOf: (t: ToolId) => string | undefined): ToolSlot[] {
  const def = (t: ToolId): ToolDef => ({ id: t, label: TOOL_INFO[t].label, description: TOOL_INFO[t].description, shortcut: keyOf(t), icon: TOOL_ICONS[t] });
  return GROUPS.map((g) => (g === "-" ? "-" : typeof g === "string" ? def(g) : g.tools.length === 1 ? def(g.tools[0]) : { group: g.group, tools: g.tools.map(def) }));
}
