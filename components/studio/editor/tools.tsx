"use client";

import type { ReactNode } from "react";
import {
  ArrowRight, ChartPie, Circle, Cog, Grid3x3, Hand, Heart, Hexagon, MessageSquare, MousePointer, MousePointer2, Pencil, PenTool, Pill, RotateCw,
  Scaling, Shell, Slash, Square, Star, Type, ZoomIn,
} from "lucide-react";
import { TOOL_INFO, type ToolId } from "@/lib/studio/commands";
import type { ToolDef, ToolSlot } from "@/components/ui";

const Reflect = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v18" strokeDasharray="2 3" /><path d="M9 7 3 17h6z" /><path d="m15 7 6 10h-6z" />
  </svg>
);

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 size={18} />, direct: <MousePointer size={18} />, pen: <PenTool size={18} />, pencil: <Pencil size={18} />,
  line: <Slash size={18} />, rect: <Square size={18} />, ellipse: <Circle size={18} />, polygon: <Hexagon size={18} />, star: <Star size={18} />,
  arc: <ChartPie size={18} />, slot: <Pill size={18} />, gear: <Cog size={18} />, arrow: <ArrowRight size={18} />, bubble: <MessageSquare size={18} />,
  heart: <Heart size={18} />, grid: <Grid3x3 size={18} />, spiral: <Shell size={18} />, text: <Type size={18} />, rotate: <RotateCw size={18} />,
  scale: <Scaling size={18} />, reflect: <Reflect />, hand: <Hand size={18} />, zoom: <ZoomIn size={18} />,
};

const GROUPS: (ToolId | { group: string; tools: ToolId[] } | "-")[] = [
  { group: "Selection", tools: ["select"] }, { group: "Direct", tools: ["direct"] }, "-",
  { group: "Pen", tools: ["pen", "pencil", "line"] },
  { group: "Shapes", tools: ["rect", "ellipse", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart", "grid", "spiral"] },
  "text", "-",
  { group: "Transform", tools: ["rotate", "scale", "reflect"] }, "-",
  "hand", "zoom",
];

/** Toolbar slots with the current shortcut of each tool. */
export function toolSlots(keyOf: (t: ToolId) => string | undefined): ToolSlot[] {
  const def = (t: ToolId): ToolDef => ({ id: t, label: TOOL_INFO[t].label, description: TOOL_INFO[t].description, shortcut: keyOf(t), icon: TOOL_ICONS[t] });
  return GROUPS.map((g) => (g === "-" ? "-" : typeof g === "string" ? def(g) : g.tools.length === 1 ? def(g.tools[0]) : { group: g.group, tools: g.tools.map(def) }));
}
