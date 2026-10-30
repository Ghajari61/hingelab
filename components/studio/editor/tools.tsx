"use client";

import type { ReactNode } from "react";
import {
  ArrowRight, ChartPie, Circle, Cog, Crop, Eraser, Feather, Grid3x3, Hand, Heart, Hexagon, Lasso, MessageSquare, MousePointer, MousePointer2, PaintBucket, Pencil, PenTool, Pill, Pipette,
  RotateCw, Ruler, RulerDimensionLine, Scaling, Scissors, Shapes, Shell, Slash, Slice, Spline, SprayCan, Square, Star, Sun, Type, Waypoints, WandSparkles, ZoomIn,
} from "lucide-react";
import { TOOL_INFO, type ToolId } from "@/lib/studio/commands";
import type { ToolDef, ToolSlot } from "@/components/ui";

const Svg = ({ children }: { children: ReactNode }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const Reflect = () => <Svg><path d="M12 3v18" strokeDasharray="2 3" /><path d="M9 7 3 17h6z" /><path d="m15 7 6 10h-6z" /></Svg>;
const Shear = () => <Svg><path d="M8 5h12l-4 14H4z" /><path d="M3 21h18" strokeDasharray="2 3" opacity={0.6} /></Svg>;
const ShapeBuilder = () => <Svg><circle cx="9" cy="10" r="6" /><circle cx="15" cy="14" r="6" /><path d="M5 20 19 6" strokeWidth={2.4} /></Svg>;
const Tweak = () => <Svg><circle cx="12" cy="11" r="7" strokeDasharray="2 2.6" opacity={0.7} /><path d="M2 19c5 0 6-8 10-8s5 8 10 8" /></Svg>;
const Dot = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={1.6} fill="currentColor" stroke="none" />;
const Rect3 = () => <Svg><path d="M4 15 13 4l7 6-9 11z" /><Dot x={4} y={15} /><Dot x={13} y={4} /><Dot x={20} y={10} /></Svg>;
const Ellipse3 = () => <Svg><ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-35 12 12)" /><Dot x={4.6} y={17.2} /><Dot x={19.4} y={6.8} /><Dot x={14.9} y={16.1} /></Svg>;
const Curve3 = () => <Svg><path d="M3 19C5 7 19 7 21 19" /><Dot x={3} y={19} /><Dot x={21} y={19} /><Dot x={12} y={10} /></Svg>;
const SmartDraw = () => <Svg><path d="M3 9c2-3 4 2 6-1s4 1 5-1" strokeDasharray="2 2" opacity={0.6} /><path d="M6 21 12 12l6 9z" /></Svg>;
const SegmentDelete = () => <Svg><path d="M3 7h18M3 17h18" opacity={0.55} /><path d="M7 3v18M17 3v18" opacity={0.55} /><path d="M7 12h10" strokeWidth={3} /></Svg>;
const Connector = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2.75" y="3.75" width="7" height="6" rx="1" /><rect x="14.25" y="14.25" width="7" height="6" rx="1" /><path d="M9.75 6.75h4.5a3 3 0 0 1 3 3v4.5" /><circle cx="17.25" cy="14.25" r="0.75" fill="currentColor" />
  </svg>
);

export const TOOL_ICONS: Record<ToolId, ReactNode> = {
  select: <MousePointer2 size={18} />, direct: <MousePointer size={18} />, pen: <PenTool size={18} />, pencil: <Pencil size={18} />,
  line: <Slash size={18} />, rect: <Square size={18} />, ellipse: <Circle size={18} />, polygon: <Hexagon size={18} />, star: <Star size={18} />,
  arc: <ChartPie size={18} />, slot: <Pill size={18} />, gear: <Cog size={18} />, arrow: <ArrowRight size={18} />, bubble: <MessageSquare size={18} />,
  heart: <Heart size={18} />, grid: <Grid3x3 size={18} />, spiral: <Shell size={18} />, text: <Type size={18} />, rotate: <RotateCw size={18} />,
  scale: <Scaling size={18} />, reflect: <Reflect />, hand: <Hand size={18} />, zoom: <ZoomIn size={18} />,
  lasso: <Lasso size={18} />, magicWand: <WandSparkles size={18} />, curvature: <Spline size={18} />, scissors: <Scissors size={18} />,
  knife: <Slice size={18} />, eraser: <Eraser size={18} />, shear: <Shear />, shapeBuilder: <ShapeBuilder />, eyedropper: <Pipette size={18} />,
  measure: <RulerDimensionLine size={18} />, fill: <PaintBucket size={18} />, calligraphy: <Feather size={18} />, tweak: <Tweak />, spray: <SprayCan size={18} />,
  connector: <Connector />, rect3: <Rect3 />, ellipse3: <Ellipse3 />, curve3: <Curve3 />, smartDraw: <SmartDraw />, crop: <Crop size={18} />,
  segmentDelete: <SegmentDelete />, dimension: <Ruler size={18} />, library: <Shapes size={18} />, burst: <Sun size={18} />, spline: <Waypoints size={18} />,
};

const GROUPS: (ToolId | { group: string; tools: ToolId[] } | "-")[] = [
  "select", "direct", "magicWand", "lasso", "-",
  { group: "Pen", tools: ["pen", "curvature", "curve3", "spline"] }, "text",
  { group: "Line", tools: ["line", "connector"] },
  { group: "Shapes", tools: ["rect", "rect3", "ellipse", "ellipse3", "polygon", "star", "arc", "slot", "gear", "arrow", "bubble", "heart", "grid", "spiral", "library", "burst"] },
  { group: "Pencil", tools: ["pencil", "smartDraw", "calligraphy"] }, { group: "Eraser", tools: ["eraser", "crop", "knife", "segmentDelete", "scissors"] }, "-",
  { group: "Rotate", tools: ["rotate", "reflect"] }, { group: "Scale", tools: ["scale", "shear"] }, { group: "Tweak", tools: ["tweak", "spray"] },
  { group: "Shape Builder", tools: ["shapeBuilder", "fill"] }, { group: "Eyedropper", tools: ["eyedropper", "measure", "dimension"] }, "-",
  "hand", "zoom",
];

/** Toolbar slots with the current shortcut of each tool. */
export function toolSlots(keyOf: (t: ToolId) => string | undefined): ToolSlot[] {
  const def = (t: ToolId): ToolDef => ({ id: t, label: TOOL_INFO[t].label, description: TOOL_INFO[t].description, shortcut: keyOf(t), icon: TOOL_ICONS[t] });
  return GROUPS.map((g) => (g === "-" ? "-" : typeof g === "string" ? def(g) : g.tools.length === 1 ? def(g.tools[0]) : { group: g.group, tools: g.tools.map(def) }));
}
