"use client";

import { useEffect } from "react";
import { findNode, walk } from "@/lib/studio/scene";
import type { Document, TextNode } from "@/lib/studio/types";
import { textOutline } from "./textRuntime";
import type { EditorState } from "./store";
import type { StoreApi } from "zustand";

const frames = new WeakMap<object, number>();
let frameSeq = 0;
const frameKey = (f?: object) => { if (!f) return 0; let k = frames.get(f); if (!k) frames.set(f, (k = ++frameSeq)); return k; };

const sig = (t: TextNode) => JSON.stringify([t.text, t.font, t.size, t.tracking, t.lineHeight, t.align, t.direction, t.width ?? null,
  t.onPath ?? null, t.pathStart ?? null, t.pathSide ?? null, t.flowInto ?? null, frameKey(t.frame), t.vertical ?? null, t.kerns ?? null, t.shifts ?? null, t.rotations ?? null]);

/**
 * Keeps text outlines in step with their settings. Outlines are a cache saved with the document, so a
 * node that arrives with an outline is trusted; any later change to its settings re-shapes it.
 */
export function useTextSync(api: StoreApi<EditorState>, onMissing: (chars: string[]) => void) {
  useEffect(() => {
    const known = new Map<string, string>();
    const pending = new Map<string, string>();
    const scan = (doc: Document) => {
      walk(doc.root, ({ node }) => {
        if (node.type !== "text") return;
        const s = sig(node);
        if (!known.has(node.id) && (node.outline?.length || !node.text)) { known.set(node.id, s); return; }
        if (known.get(node.id) === s || pending.get(node.id) === s) return;
        pending.set(node.id, s);
        const { id } = node;
        textOutline(node.font, node).then((r) => {
          if (pending.get(id) !== s) return;
          pending.delete(id);
          const cur = findNode(api.getState().doc.root, id);
          if (!cur || cur.type !== "text" || sig(cur) !== s) return;
          known.set(id, s);
          api.getState().quiet((d) => { const n = findNode(d.root, id); if (n && n.type === "text") n.outline = r.outline; });
          if (r.missing.length) onMissing(r.missing);
        }).catch(() => { pending.delete(id); });
      });
    };
    scan(api.getState().doc);
    return api.subscribe((s, prev) => { if (s.doc !== prev.doc && !s.base) scan(s.doc); });
  }, [api, onMissing]);
}
