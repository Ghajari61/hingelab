"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Dialog, NumberInput, SegmentedControl } from "@/components/ui";
import { editMask, nearestAspect, padTo, place, type FrameRect } from "@/lib/imaging/frame";
import { fitWithin, type Img } from "@/lib/imaging/image";
import { MAX_STUDIO_PROMPT } from "@/lib/ai/studio/request";
import { useEditor } from "../store";
import { blobToDataUrl, encodeImage, pickImage, readNodeImage } from "./assets";

export interface EditAsk {
  op: "redraw" | "expand";
  prompt: string;
  image: string;
  mask: string;
  /** Where the original sits in the picture sent. */
  rect: FrameRect;
}

type Props = { open: boolean; mode: "redraw" | "expand"; cost: number; onClose: () => void; onSubmit: (a: EditAsk) => void };

const GREY: [number, number, number, number] = [128, 128, 128, 255];
const VIEW = 460;

/** AI Studio ▸ Image Redraw (paint where to change) and Creative Expand (add room around the picture). */
export function EditDialog({ open, mode, cost, onClose, onSubmit }: Props) {
  const image = useEditor(pickImage);
  const docId = useEditor((s) => s.doc.id);
  const [img, setImg] = useState<Img | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [brush, setBrush] = useState(40);
  const [shape, setShape] = useState<"square" | "wide" | "tall">("wide");
  const [room, setRoom] = useState(40);
  const [painted, setPainted] = useState(false);
  const [busy, setBusy] = useState(false);
  const base = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const paint = useRef<Uint8Array | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open || !image) return;
    let alive = true;
    setImg(null); setError(null); setPainted(false);
    readNodeImage(docId, image, mode === "redraw" ? 1536 : 1024)
      .then((i) => { if (!alive) return; setImg(i); paint.current = new Uint8Array(i.width * i.height); })
      .catch((e: Error) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [open, docId, image?.assetId, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const k = img ? Math.min(1, VIEW / Math.max(img.width, img.height)) : 1;
  useEffect(() => {
    if (!img || !base.current) return;
    const c = base.current, small = fitWithin(img, VIEW);
    c.width = small.width; c.height = small.height;
    c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(small.data), small.width, small.height), 0, 0);
    if (over.current) { over.current.width = small.width; over.current.height = small.height; }
  }, [img]);

  const dab = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img || !paint.current || !over.current) return;
    const r = over.current.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (over.current.width / r.width), sy = (e.clientY - r.top) * (over.current.height / r.height);
    const g = over.current.getContext("2d")!;
    g.fillStyle = "rgba(239, 68, 68, 0.55)";
    g.beginPath(); g.arc(sx, sy, (brush * k) / 2, 0, Math.PI * 2); g.fill();
    const cx = sx / k, cy = sy / k, rad = brush / 2, m = paint.current;
    for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(img.height, Math.ceil(cy + rad)); y++)
      for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(img.width, Math.ceil(cx + rad)); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) m[y * img.width + x] = 1;
    setPainted(true);
  };
  const clear = () => {
    if (!img) return;
    paint.current = new Uint8Array(img.width * img.height);
    over.current?.getContext("2d")?.clearRect(0, 0, over.current.width, over.current.height);
    setPainted(false);
  };

  const submit = async () => {
    if (!img) return;
    setBusy(true);
    try {
      let framed: { img: Img; rect: FrameRect }, mask: Img;
      if (mode === "redraw") {
        framed = padTo(img, nearestAspect(img.width / img.height), GREY);
        mask = editMask(framed.img.width, framed.img.height, framed.rect, false, paint.current!, img.width, img.height);
      } else {
        let { W, H } = expandSize(img, shape, room);
        const s = Math.min(1, 1536 / Math.max(W, H));
        const small = s < 1 ? fitWithin(img, Math.round(Math.max(img.width, img.height) * s)) : img;
        W = Math.round(W * s); H = Math.round(H * s);
        framed = place(small, W, H, GREY);
        mask = editMask(W, H, framed.rect, true);
      }
      const [imageUrl, maskUrl] = await Promise.all([
        encodeImage(framed.img, "image/jpeg", 0.9).then(blobToDataUrl),
        encodeImage(mask, "image/png").then(blobToDataUrl),
      ]);
      onSubmit({ op: mode, prompt: prompt.trim(), image: imageUrl, mask: maskUrl, rect: framed.rect });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The picture could not be prepared.");
    } finally {
      setBusy(false);
    }
  };

  const can = !!img && !busy && (mode === "redraw" ? painted && prompt.trim().length >= 2 : true);
  return (
    <Dialog open={open} title={mode === "redraw" ? "Image Redraw" : "Creative Expand"} onClose={onClose} size="wide" testId="ai-edit-dialog"
      footer={<>
        <span className="dlg-note">{error ?? (mode === "redraw" ? "Paint over what should change, then say what goes there." : "The picture keeps its middle; the model paints the new room around it.")}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ui-btn primary" disabled={!can} onClick={() => void submit()} data-testid="ai-edit-ok">
          {mode === "redraw" ? "Redraw" : "Expand"} ({cost} credits)
        </button>
      </>}>
      {!image ? <p className="dlg-note">Select one image first.</p> : (
        <div className="ai-edit">
          <div className="ai-edit-stage" style={mode === "expand" && img ? expandStyle(img, shape, room) : undefined}>
            <canvas ref={base} aria-label="Picture" style={mode === "expand" && img ? { width: `${(img.width / expandSize(img, shape, room).W) * 100}%`, height: "auto" } : undefined} />
            {mode === "redraw" && (
              <canvas ref={over} className="ai-brush" aria-label="Paint the area to redraw" data-testid="ai-brush"
                onPointerDown={(e) => { drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); dab(e); }}
                onPointerMove={(e) => { if (drawing.current) dab(e); }}
                onPointerUp={() => { drawing.current = false; }} />
            )}
          </div>
          <div className="form-grid">
            <div className="full" style={{ display: "grid" }}>
              <label className="ui-label" htmlFor="ai-edit-prompt">{mode === "redraw" ? "What goes in the painted area" : "What the new room shows (optional)"}</label>
              <textarea id="ai-edit-prompt" className="ui-text ai-prompt" rows={3} maxLength={MAX_STUDIO_PROMPT} value={prompt} onChange={(e) => setPrompt(e.target.value)}
                placeholder={mode === "redraw" ? "a small red bow tie" : "more sky and hills"} data-testid="ai-edit-prompt" />
            </div>
            {mode === "redraw" ? <>
              <NumberInput label="Brush" value={brush} min={4} max={300} integer suffix="px" onChange={(v) => setBrush(v)} />
              <button type="button" className="ui-btn" style={{ alignSelf: "end" }} onClick={clear} disabled={!painted}><Eraser size={14} aria-hidden /> Clear the paint</button>
            </> : <>
              <SegmentedControl label="New shape" value={shape} onChange={setShape}
                options={[{ value: "square", label: "Square" }, { value: "wide", label: "Wide 3:2" }, { value: "tall", label: "Tall 2:3" }]} />
              <NumberInput label="Extra room" value={room} min={10} max={150} integer suffix="%" onChange={(v) => setRoom(v)} />
            </>}
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** The grey frame around the picture shows the room the model will fill. */
function expandSize(img: Img, shape: "square" | "wide" | "tall", room: number) {
  const a = shape === "wide" ? 1.5 : shape === "tall" ? 2 / 3 : 1, g = 1 + room / 100;
  const W = Math.max(img.width * g, img.height * g * a);
  return { W, H: W / a };
}

function expandStyle(img: Img, shape: "square" | "wide" | "tall", room: number): React.CSSProperties {
  const { W, H } = expandSize(img, shape, room);
  const s = Math.min(VIEW / W, VIEW / H);
  return { width: Math.round(W * s), height: Math.round(H * s), background: "repeating-conic-gradient(#9ca3af 0 25%, #d1d5db 0 50%) 0 0 / 16px 16px", display: "grid", placeItems: "center" };
}
