"use client";

import { useEffect, useRef } from "react";
import { locate, removeNodes } from "@/lib/studio/scene";
import type { Mat, Vec } from "@/lib/studio/types";
import { editorFontFamily } from "./textRuntime";
import { useEditor, useEditorApi } from "./store";

/** In-place typing for a text object: a textarea in the preview face over the hidden outline. */
export function TextEditor({ id, S, zoom, turn }: { id: string; S: (p: Vec) => Vec; zoom: number; /** View rotation / flip (no zoom) when the canvas is turned. */ turn?: Mat }) {
  const api = useEditorApi();
  const doc = useEditor((s) => s.doc);
  const located = locate(doc.root, id);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [id]);

  const finish = () => {
    const s = api.getState();
    if (s.textEditing !== id) return;
    const n = locate(s.doc.root, id)?.node;
    s.set({ textEditing: null });
    if (n && n.type === "text" && !n.text.trim()) s.edit("Type", (d) => removeNodes(d, [id]), { mergeKey: "type:" + id, select: [] });
    else s.seal();
  };

  if (!located || located.node.type !== "text") return null;
  const n = located.node;
  const w = located.world;
  const px = n.size * zoom;
  const o = S({ x: w[4], y: w[5] });
  const scale = Math.hypot(w[0], w[1]) || 1;
  const lineCount = Math.max(1, n.text.split("\n").length);
  const longest = Math.max(1, ...n.text.split("\n").map((l) => l.length));
  const width = n.width ? n.width * zoom : Math.max(px * 2, (longest + 2) * px * 0.62);
  const left = n.width ? 0 : n.align === "center" ? -width / 2 : (n.align === "end") !== (n.direction === "rtl") ? -width : 0;
  const top = -px * (0.5 * (n.lineHeight - 1) + 0.92);

  return (
    <textarea
      ref={ref}
      className="st-text-editor"
      data-testid="text-editor"
      aria-label="Text"
      dir={n.direction === "auto" ? "auto" : n.direction}
      spellCheck={false}
      value={n.text}
      style={{
        left: o.x, top: o.y, width, height: lineCount * n.lineHeight * px + px * 0.4,
        fontFamily: editorFontFamily(n.font), fontSize: px, lineHeight: n.lineHeight,
        letterSpacing: `${n.tracking / 1000}em`, textAlign: n.align === "center" ? "center" : n.align,
        transform: `${turn ? `matrix(${turn[0]}, ${turn[1]}, ${turn[2]}, ${turn[3]}, 0, 0) ` : ""}matrix(${w[0] / scale}, ${w[1] / scale}, ${w[2] / scale}, ${w[3] / scale}, 0, 0) scale(${scale}) translate(${left}px, ${top}px)`,
        transformOrigin: "0 0",
      }}
      onChange={(e) => {
        const text = e.target.value;
        api.getState().edit("Type", (d) => { const t = locate(d.root, id)?.node; if (t && t.type === "text") t.text = text; }, { mergeKey: "type:" + id });
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || e.metaKey))) { e.preventDefault(); finish(); }
      }}
      onBlur={finish}
      onPointerDown={(e) => e.stopPropagation()}
    />
  );
}
