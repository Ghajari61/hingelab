"use client";

import type { MeasureResult } from "@/lib/studio/measure";
import type { Vec } from "@/lib/studio/types";

/** Labels narrower than this many screen pixels of line are left out so short spans stay readable. */
const MIN_LABEL_PX = 46;

function Tag({ at, text, tone, testId }: { at: Vec; text: string; tone: "guide" | "piece" | "span"; testId?: string }) {
  const w = text.length * 6.2 + 10;
  const fill = tone === "guide" ? "var(--smart-guide)" : tone === "piece" ? "var(--accent)" : "var(--surface-raised, #222)";
  const color = tone === "span" ? "var(--smart-guide)" : "#fff";
  return (
    <g transform={`translate(${at.x} ${at.y})`} data-testid={testId}>
      <rect x={-w / 2} y={-9} width={w} height={18} rx={4} fill={fill} stroke={tone === "span" ? "var(--smart-guide)" : "none"} strokeWidth={1} />
      <text textAnchor="middle" y={4} fontSize={10.5} fill={color} fontFamily="var(--font-num)">{text}</text>
    </g>
  );
}

/** Measure tool overlay (screen space): the line, its length and angle, every crossing, and the lengths between crossings. */
export function MeasureOverlay({ a, b, result, S, zoom, fmt }: { a: Vec; b: Vec; result?: MeasureResult; S: (p: Vec) => Vec; zoom: number; fmt: (mm: number) => string }) {
  const A = S(a), B = S(b);
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return null;
  const label = `${fmt(dist)} · ${Math.round((Math.atan2(-dy, dx) * 1800) / Math.PI) / 10}°`;
  const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
  const hits = result?.hits ?? [];
  // Labels sit beside the line, on the side away from the main label.
  const len = Math.hypot(B.x - A.x, B.y - A.y) || 1, nx = -(B.y - A.y) / len, ny = (B.x - A.x) / len;
  const side = ny >= 0 ? 1 : -1;
  return (
    <g data-testid="measure-overlay" pointerEvents="none">
      <path d={`M${A.x} ${A.y}H${B.x}V${B.y}`} fill="none" stroke="var(--smart-guide)" strokeDasharray="2 3" opacity={0.7} />
      <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke="var(--smart-guide)" strokeWidth={1.5} />
      <circle cx={A.x} cy={A.y} r={3.5} fill="var(--handle-fill)" stroke="var(--smart-guide)" />
      <circle cx={B.x} cy={B.y} r={3.5} fill="var(--handle-fill)" stroke="var(--smart-guide)" />
      {hits.length > 0 && result!.spans.map((s, k) => s.len * zoom >= MIN_LABEL_PX && (
        <Tag key={"s" + k} at={{ x: S(s.mid).x + nx * 13 * side, y: S(s.mid).y + ny * 13 * side }} text={fmt(s.len)} tone="span" testId="measure-span" />
      ))}
      {result?.pieces.map((p, k) => p.len * zoom >= MIN_LABEL_PX && <Tag key={"p" + k} at={S(p.mid)} text={fmt(p.len)} tone="piece" testId="measure-piece" />)}
      {hits.map((h, k) => { const q = S(h.p); return <path key={"h" + k} d={`M${q.x - 4} ${q.y - 4}L${q.x + 4} ${q.y + 4}M${q.x + 4} ${q.y - 4}L${q.x - 4} ${q.y + 4}`} stroke="var(--danger, #e5484d)" strokeWidth={1.75} data-testid="measure-hit" />; })}
      <Tag at={{ x: mx - nx * 16 * side, y: my - ny * 16 * side }} text={label} tone="guide" />
    </g>
  );
}
