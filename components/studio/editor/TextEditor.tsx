"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { resolveDirection } from "@/lib/letters/shape";
import { apply } from "@/lib/studio/geom";
import { locate, removeNodes, worldBox } from "@/lib/studio/scene";
import { isPlainText } from "@/lib/studio/text";
import { kernAt, remapManual, rotateChars, shiftChars } from "@/lib/studio/textOps";
import type { Document, Mat, TextNode, Vec } from "@/lib/studio/types";
import { editorFontFamily, textLayoutNow } from "./textRuntime";
import { useEditor, useEditorApi } from "./store";

const textAt = (d: Document, id: string) => { const n = locate(d.root, id)?.node; return n?.type === "text" ? n : null; };

/** Applies a manual kern / shift / turn and lays the text out again right away (when the font is loaded). */
function relayout(t: TextNode) {
  const r = textLayoutNow(t.font, t);
  if (r) t.outline = r.outline;
}

/**
 * In-place typing for a text object. Plain text gets a textarea in the preview face over the hidden
 * outline; text on a path, flowed, vertical or manually kerned text stays drawn and is typed into a
 * box under it, with a marker under each glyph to drag its kerning. While typing, Alt+arrows kern at
 * the caret (along the line) and shift the selected characters off the baseline (across it), Alt+[ and
 * Alt+] turn them by the snap angle; Shift makes kern and shift steps ten times larger.
 */
export function TextEditor({ id, S, zoom, turn, snapAngle = 15 }: {
  id: string; S: (p: Vec) => Vec; zoom: number;
  /** View rotation / flip (no zoom) when the canvas is turned. */ turn?: Mat;
  snapAngle?: number;
}) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const located = locate(doc.root, id);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(-1);
  const node = located?.node.type === "text" ? located.node : null;
  const layout = useMemo(() => (node && !isPlainText(node) ? textLayoutNow(node.font, node) : null), [node]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    setCaret(el.value.length);
  }, [id]);

  const finish = () => {
    const s = api.getState();
    if (s.textEditing !== id) return;
    const n = textAt(s.doc, id);
    s.set({ textEditing: null });
    if (n && !n.text.trim()) s.edit("Type", (d) => removeNodes(d, [id]), { mergeKey: "type:" + id, select: [] });
    else s.seal();
  };

  if (!located || !node) return null;
  const n = node;
  const w = located.world;
  const scale = Math.hypot(w[0], w[1]) || 1;
  /** 1/1000 em per screen pixel. */
  const perPx = 1000 / (zoom * scale * n.size);
  const rtl = resolveDirection(n.direction, n.text) === "rtl";

  const manual = (label: string, fn: (t: TextNode) => void) =>
    api.getState().edit(label, (d) => { const t = textAt(d, id); if (t) { fn(t); relayout(t); } }, { mergeKey: "kern:" + id });

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const arrow = e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown";
    const bracket = e.code === "BracketLeft" || e.code === "BracketRight";
    if (!e.altKey || e.ctrlKey || e.metaKey || !(arrow || bracket)) return false;
    e.preventDefault();
    const a = el.selectionStart, b = el.selectionEnd, len = n.text.length;
    const from = a < b ? a : Math.min(a, Math.max(0, len - 1)), to = a < b ? b : from + 1;
    const step = (e.shiftKey ? 10 : 1) * perPx;
    if (bracket) { if (len) manual("Rotate Letters", (t) => rotateChars(t, from, to, e.code === "BracketLeft" ? -snapAngle : snapAngle)); return true; }
    const along = n.vertical ? e.key === "ArrowUp" || e.key === "ArrowDown" : e.key === "ArrowLeft" || e.key === "ArrowRight";
    const plus = e.key === "ArrowRight" || e.key === "ArrowDown";
    if (along) manual("Kern", (t) => kernAt(t, a, (plus !== (rtl && !n.vertical) ? 1 : -1) * step));
    else if (len) manual("Baseline Shift", (t) => shiftChars(t, from, to, (n.vertical ? e.key === "ArrowRight" : e.key === "ArrowUp") ? step : -step));
    return true;
  };

  const plain = isPlainText(n);
  let style: React.CSSProperties;
  if (plain) {
    const px = n.size * zoom;
    const o = S({ x: w[4], y: w[5] });
    const lineCount = Math.max(1, n.text.split("\n").length);
    const longest = Math.max(1, ...n.text.split("\n").map((l) => l.length));
    const width = n.width ? n.width * zoom : Math.max(px * 2, (longest + 2) * px * 0.62);
    const left = n.width ? 0 : n.align === "center" ? -width / 2 : (n.align === "end") !== (n.direction === "rtl") ? -width : 0;
    const top = -px * (0.5 * (n.lineHeight - 1) + 0.92);
    style = {
      left: o.x, top: o.y, width, height: lineCount * n.lineHeight * px + px * 0.4,
      fontFamily: editorFontFamily(n.font), fontSize: px, lineHeight: n.lineHeight,
      letterSpacing: `${n.tracking / 1000}em`, textAlign: n.align === "center" ? "center" : n.align,
      transform: `${turn ? `matrix(${turn[0]}, ${turn[1]}, ${turn[2]}, ${turn[3]}, 0, 0) ` : ""}matrix(${w[0] / scale}, ${w[1] / scale}, ${w[2] / scale}, ${w[3] / scale}, 0, 0) scale(${scale}) translate(${left}px, ${top}px)`,
      transformOrigin: "0 0",
    };
  } else {
    const b = worldBox(doc.root, id);
    const ok = b.maxX >= b.minX;
    const corners = ok ? [S({ x: b.minX, y: b.minY }), S({ x: b.maxX, y: b.minY }), S({ x: b.minX, y: b.maxY }), S({ x: b.maxX, y: b.maxY })] : [S({ x: w[4], y: w[5] })];
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    const fs = Math.min(22, Math.max(13, n.size * zoom * 0.6));
    const lines = n.text.split("\n");
    style = {
      left: Math.min(...xs), top: Math.max(...ys) + 12, width: Math.max(220, Math.min(560, Math.max(...xs) - Math.min(...xs))),
      height: Math.max(1, lines.length) * fs * 1.35 + 10, padding: "4px 6px", whiteSpace: "pre-wrap",
      fontFamily: editorFontFamily(n.font), fontSize: fs, lineHeight: 1.35, borderStyle: "solid", borderRadius: 4,
      background: "var(--surface-field)", boxShadow: "0 2px 8px rgb(0 0 0 / 0.25)",
    };
  }

  /** One marker per character that starts a glyph, a little under the baseline (across it from the glyph). */
  const markers = (() => {
    if (!layout || layout.glyphs.length > 400) return [];
    const seen = new Set<number>();
    return layout.glyphs.filter((g) => !seen.has(g.index) && seen.add(g.index)).map((g) => {
      const a = (g.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), off = 0.3 * n.size;
      const local = { x: g.x + (c * g.advance) / 2 - s * off, y: g.y + (s * g.advance) / 2 + c * off };
      const p = S(apply(w, local)), q = S(apply(w, { x: local.x + c, y: local.y + s }));
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      return { index: g.index, at: p, dir: { x: (q.x - p.x) / len, y: (q.y - p.y) / len } };
    });
  })();

  const dragMarker = (e: React.PointerEvent<HTMLDivElement>, index: number, dir: Vec) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const s = api.getState();
    const start = { x: e.clientX, y: e.clientY }, base = textAt(s.doc, id)?.kerns?.[index] ?? 0;
    const sign = rtl && !n.vertical ? -1 : 1;
    let value = base;
    s.begin();
    const recipe = (d: Document) => { const t = textAt(d, id); if (t) { kernAt(t, index, value - (t.kerns?.[index] ?? 0)); relayout(t); } };
    const move = (ev: PointerEvent) => {
      const along = (ev.clientX - start.x) * dir.x + (ev.clientY - start.y) * dir.y;
      value = base + sign * along * perPx;
      api.getState().preview(recipe);
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      api.getState().end("Kern", value === base ? null : recipe);
      ref.current?.focus();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  return (
    <>
      <textarea
        ref={ref}
        className="st-text-editor"
        data-testid="text-editor"
        aria-label="Text"
        dir={n.direction === "auto" ? "auto" : n.direction}
        spellCheck={false}
        value={n.text}
        style={style}
        onChange={(e) => {
          const text = e.target.value;
          api.getState().edit("Type", (d) => {
            const t = textAt(d, id);
            if (!t) return;
            const before = t.text;
            t.text = text;
            remapManual(t, before, text);
          }, { mergeKey: "type:" + id });
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (onKey(e)) return;
          if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finish(); }
        }}
        onBlur={finish}
        onPointerDown={(e) => e.stopPropagation()}
      />
      {markers.map((m) => (
        <div key={m.index} className={`st-kern-marker${m.index === caret ? " on" : ""}`} data-testid="kern-marker" data-index={m.index}
          title="Drag to kern this letter" style={{ left: m.at.x, top: m.at.y, cursor: Math.abs(m.dir.x) >= Math.abs(m.dir.y) ? "ew-resize" : "ns-resize" }}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => dragMarker(e, m.index, m.dir)} />
      ))}
    </>
  );
}
