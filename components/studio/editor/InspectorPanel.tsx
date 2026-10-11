"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy } from "lucide-react";
import { inspectDocument, inspectNode, type Json } from "@/lib/studio/inspect";
import { findNode } from "@/lib/studio/scene";
import type { SceneNode } from "@/lib/studio/types";
import { PanelSection } from "@/components/ui";
import { useEditor } from "./store";

/** Structure Inspector: a read-only tree of the selection (or the document) with Copy as JSON. */
export function InspectorPanel({ toast }: { toast: (m: string) => void }) {
  const doc = useEditor((s) => s.doc);
  const selection = useEditor((s) => s.selection);
  const nodes = selection.map((id) => findNode(doc.root, id)).filter((n): n is SceneNode => !!n);
  const data: Json = nodes.length === 0 ? inspectDocument(doc) : nodes.length === 1 ? inspectNode(doc, nodes[0]) : nodes.map((n) => inspectNode(doc, n));
  const copy = () => {
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard?.writeText(text).then(() => toast("Copied as JSON"), () => toast("The browser blocked the clipboard."));
  };
  const title = nodes.length === 0 ? "Document" : nodes.length === 1 ? `${nodes[0].type} ${nodes[0].name ?? nodes[0].id}` : `${nodes.length} objects`;
  return (
    <PanelSection title="Structure">
      <div className="insp-head">
        <span className="dlg-note" data-testid="inspector-title">{title}</span>
        <button type="button" className="ui-btn" onClick={copy} data-testid="inspector-copy"><Copy size={14} aria-hidden /> Copy as JSON</button>
      </div>
      <div className="insp-tree" role="tree" aria-label="Selected objects" data-testid="inspector-tree">
        <JsonNode name={nodes.length > 1 ? "selection" : nodes.length ? "object" : "document"} value={data} depth={0} />
      </div>
      <p className="dlg-note">Read-only. Paths, outlines and caches show their size; edit objects on the canvas or in Properties.</p>
    </PanelSection>
  );
}

function JsonNode({ name, value, depth }: { name: string; value: Json; depth: number }) {
  const branch = value !== null && typeof value === "object";
  const [open, setOpen] = useState(depth < 1 || (depth < 2 && name === "transform"));
  if (!branch) {
    const kind = value === null ? "null" : typeof value;
    return (
      <div className="insp-row" role="treeitem" aria-selected={false} style={{ paddingInlineStart: depth * 12 + 16 }}>
        <span className="k">{name}</span><span className={`v ${kind}`}>{typeof value === "string" ? `"${value}"` : String(value)}</span>
      </div>
    );
  }
  const entries: [string, Json][] = Array.isArray(value) ? value.map((v, i) => [String(i), v]) : Object.entries(value);
  const summary = Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`;
  return (
    <div role="treeitem" aria-expanded={open} aria-selected={false}>
      <button type="button" className="insp-row branch" style={{ paddingInlineStart: depth * 12 }} onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <span className="k">{name}</span><span className="v sum">{summary}</span>
      </button>
      {open && <div role="group">{entries.map(([k, v]) => <JsonNode key={k} name={k} value={v} depth={depth + 1} />)}</div>}
    </div>
  );
}
