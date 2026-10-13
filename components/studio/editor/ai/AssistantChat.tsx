"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Ban, Box, Flame, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { materialById } from "@/lib/studio/library";
import { pasteNodes, selectionBox, topLevel } from "@/lib/studio/scene";
import { layerCode } from "@/lib/studio/cutLayers";
import { styleById } from "@/lib/ai/studio/styles";
import { MAX_CHAT_TEXT, MAX_CHAT_TURNS, type AssistantAction, type AssistantRequest } from "@/lib/ai/studio/request";
import type { Document, Vec } from "@/lib/studio/types";
import { useEditor, useEditorApi } from "../store";
import { askAssistant } from "./cloud";
import { spent } from "./jobs";
import { openInGenerator } from "./targets";

interface Turn { role: "user" | "assistant"; text: string; actions?: AssistantAction[]; done?: number[] }

function layerTitle(index: number, name: string): string {
  const code = layerCode(index);
  return name.startsWith(code) ? name : `${code} ${name}`;
}

type Props = {
  cloudBlock: string | null;
  cost: number;
  toast: (m: string, undo?: boolean) => void;
  viewCenter: () => Vec;
  beforeLeave: () => Promise<void>;
  makeImage: (prompt: string, style?: string) => void;
};

const EXAMPLES = [
  "What power and speed should I use to cut 3 mm birch plywood?",
  "Make a 120 mm hinge box with my name, Sam, on the lid",
  "I need a line-art fox to engrave on a coaster",
];

const chatKey = (docId: string) => `hingelab-ai-chat:${docId}`;

/** What the assistant is told about the open project. */
function studioContext(d: Document, selection: string[]): AssistantRequest["context"] {
  const sheet = d.sheets[0];
  const used = new Set<number>();
  const walk = (n: { layer: number; children?: unknown[] }) => { used.add(n.layer); (n.children as typeof n[] | undefined)?.forEach(walk); };
  d.root.children.forEach((c) => walk(c as never));
  const layers = d.cutLayers.filter((l) => l.index < 4 || used.has(l.index)).slice(0, 32).map((l) => ({ index: l.index, name: `${layerCode(l.index)} ${l.name}`.slice(0, 60), mode: l.mode }));
  let sel: string | undefined;
  if (selection.length) {
    const b = selectionBox(d, topLevel(d.root, selection));
    sel = `${selection.length} object${selection.length === 1 ? "" : "s"}${Number.isFinite(b.minX) ? `, ${Math.round(b.maxX - b.minX)} × ${Math.round(b.maxY - b.minY)} mm` : ""}`;
  }
  return {
    ...(sheet ? { material: materialById(sheet.materialId)?.name ?? sheet.materialId, machine: sheet.machineId, sheet: { w: sheet.w, h: sheet.h } } : {}),
    layers, ...(sel ? { selection: sel } : {}),
  };
}

/** AI Studio ▸ Assistant: a chat that suggests laser settings, makes designs and prepares pictures; nothing changes until the user applies it. */
export function AssistantChat({ cloudBlock, cost, toast, viewCenter, beforeLeave, makeImage }: Props) {
  const api = useEditorApi();
  const docId = useEditor((s) => s.doc.id);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { setTurns(JSON.parse(sessionStorage.getItem(chatKey(docId)) ?? "[]") as Turn[]); } catch { setTurns([]); }
    return () => ctl.current?.abort();
  }, [docId]);
  const keep = (t: Turn[]) => { setTurns(t); try { sessionStorage.setItem(chatKey(docId), JSON.stringify(t.slice(-40))); } catch { /* full */ } };
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [turns.length, busy]);

  const send = async (words: string) => {
    const q = words.trim().slice(0, MAX_CHAT_TEXT);
    if (!q || busy) return;
    const next = [...turns, { role: "user" as const, text: q }];
    keep(next); setText(""); setError(null); setBusy(true);
    const c = new AbortController();
    ctl.current = c;
    try {
      const s = api.getState();
      const r = await askAssistant({ messages: next.slice(-MAX_CHAT_TURNS).map((t) => ({ role: t.role, text: t.text })), context: studioContext(s.doc, s.selection) }, c.signal);
      spent(r.credits);
      keep([...next, { role: "assistant", text: r.reply, actions: r.actions, done: [] }]);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : "The assistant could not answer.");
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };

  const mark = (ti: number, ai: number) => keep(turns.map((t, i) => (i === ti ? { ...t, done: [...(t.done ?? []), ai] } : t)));

  const apply = async (a: AssistantAction, ti: number, ai: number) => {
    if (a.kind === "layer") {
      api.getState().edit("AI: Laser settings", (d) => {
        const L = d.cutLayers[a.layer];
        if (!L) return;
        L.power = a.power; L.speed = a.speed; L.passes = a.passes;
        if (a.interval) L.interval = a.interval;
      });
      toast(`${layerTitle(a.layer, a.name)}: ${a.power}% power, ${a.speed} mm/s. Run a test first.`, true);
      mark(ti, ai);
    } else if (a.kind === "image") {
      makeImage(a.prompt, a.style);
      mark(ti, ai);
    } else if (a.svg) {
      const { importSvg } = await import("@/lib/studio/svgImport");
      const r = importSvg(a.svg, { name: a.name });
      if (!r.group) { toast("The design has nothing to place."); return; }
      const c = viewCenter(), b = r.box;
      let ids: string[] = [];
      api.getState().edit(`AI: ${a.name}`, (d) => { ids = pasteNodes(d, [r.group!], { x: c.x - (b.minX + b.maxX) / 2, y: c.y - (b.minY + b.maxY) / 2 }); });
      api.getState().select(ids);
      toast(`Added “${a.name}” to the canvas`, true);
      mark(ti, ai);
    }
  };

  const openDesign = async (a: Extract<AssistantAction, { kind: "design" }>) => {
    let params = a.params;
    if (a.preset && (a.product === "letters" || a.product === "parametric")) {
      const list = a.product === "letters" ? (await import("@/lib/letters/presets")).LETTER_PRESETS : (await import("@/lib/parametric/presets")).PARAMETRIC_PRESETS;
      const base = (list as unknown as { id: string; params: Record<string, unknown> }[]).find((p) => p.id === a.preset);
      if (base) params = { ...base.params, ...a.params };
    }
    await beforeLeave();
    openInGenerator(a.product, a.name, params);
  };

  return (
    <div className="ai-chat" data-testid="ai-chat">
      <div className="ai-turns">
        {!turns.length && (
          <div className="ai-stack">
            <p className="dlg-note">Ask for laser settings, a finished design or a picture. It knows this project&apos;s material, machine and layers. {cost} credit{cost === 1 ? "" : "s"} a message.</p>
            {EXAMPLES.map((e) => <button key={e} type="button" className="choice" disabled={!!cloudBlock} onClick={() => void send(e)}>{e}</button>)}
          </div>
        )}
        {turns.map((t, ti) => (
          <div key={ti} className={`ai-turn ${t.role}`}>
            <p>{t.text}</p>
            {t.actions?.map((a, ai) => {
              const done = t.done?.includes(ai);
              if (a.kind === "layer") return (
                <div key={ai} className="ai-action">
                  <Flame size={14} aria-hidden />
                  <span><b>{layerTitle(a.layer, a.name)}</b>: {a.power}% power · {a.speed} mm/s · {a.passes} pass{a.passes === 1 ? "" : "es"}{a.interval ? ` · ${a.interval} mm interval` : ""}<small>{a.note}</small></span>
                  <button type="button" className="ui-btn small" disabled={done} onClick={() => void apply(a, ti, ai)}>{done ? "Applied" : "Apply"}</button>
                </div>
              );
              if (a.kind === "image") return (
                <div key={ai} className="ai-action">
                  <ImagePlus size={14} aria-hidden />
                  <span>“{a.prompt}”{a.style ? <small>{styleById(a.style)?.name}</small> : null}</span>
                  <button type="button" className="ui-btn small" disabled={done || !!cloudBlock} onClick={() => void apply(a, ti, ai)}>{done ? "Started" : "Make it"}</button>
                </div>
              );
              return (
                <div key={ai} className="ai-action design">
                  <Box size={14} aria-hidden />
                  <span><b>{a.name}</b> · {a.productName}<small>{a.summary}</small>{a.notes.map((n, k) => <small key={k}>{n}</small>)}{a.error ? <small className="err">{a.error}</small> : null}{a.locked ? <small>{a.locked}</small> : null}</span>
                  <span className="btns">
                    {a.svg && <button type="button" className="ui-btn small" disabled={done} onClick={() => void apply(a, ti, ai)}>{done ? "Added" : "Add to canvas"}</button>}
                    <button type="button" className="ui-btn small" onClick={() => void openDesign(a)}>Open in editor</button>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        {busy && <div className="ai-turn assistant"><p><Loader2 size={14} className="spin" aria-hidden /> Thinking…</p></div>}
        {error && <p className="err" role="alert">{error}</p>}
        <div ref={end} />
      </div>
      {cloudBlock ? <p className="dlg-note">{cloudBlock}</p> : (
        <form className="ai-ask" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          <textarea className="ui-text" rows={2} value={text} maxLength={MAX_CHAT_TEXT} placeholder="Ask the assistant…" aria-label="Message" data-testid="ai-chat-input"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
          <div className="ai-row">
            {busy
              ? <button type="button" className="ui-btn small" onClick={() => ctl.current?.abort()}><Ban size={13} aria-hidden /> Stop</button>
              : <button type="submit" className="ui-btn primary small" disabled={!text.trim()} data-testid="ai-chat-send"><ArrowUp size={13} aria-hidden /> Send</button>}
            <span style={{ flex: 1 }} />
            {turns.length > 0 && <button type="button" className="ui-icon-btn" aria-label="Start a new conversation" onClick={() => keep([])}><Trash2 size={13} /></button>}
          </div>
        </form>
      )}
    </div>
  );
}
