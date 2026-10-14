"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { TraceError, traceFile, type TracedPicture } from "./levelsClient";

/** Longest side of the stored picture, px (about 0.3 mm per pixel on a 300 mm puzzle). */
const MAX_PX = 1000;
/** Colour photos are printed, so they keep more pixels (about 160 dpi across a 10 in frame). */
const MAX_PX_COLOR = 1600;
/** Stored pictures stay well inside the browser's autosave space. */
const MAX_BYTES = 700 * 1024;

/** The picture as a JPEG data URL (grey unless `color`), its longest side capped, and its width / height. */
export async function pictureJpeg(file: Blob, color = false): Promise<{ url: string; aspect: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, (color ? MAX_PX_COLOR : MAX_PX) / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  if (!color) {
    const img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      d[i] = d[i + 1] = d[i + 2] = y;
    }
    g.putImageData(img, 0, 0);
  }
  let q = 0.85, url = cv.toDataURL("image/jpeg", q);
  while (url.length > MAX_BYTES && q > 0.4) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
  return { url, aspect: w / h };
}

export function ImagePicker({ label, value, color = false, onPick, onClear, onTrace, name }: {
  label: string;
  value: string;
  color?: boolean;
  onPick: (url: string, aspect: number) => void;
  onClear: () => void;
  /** Trace mode: SVG files are accepted too and the picture is traced into outlines on this device. */
  onTrace?: (t: TracedPicture) => void;
  /** File name of the traced picture. */
  name?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="gen-image">
      <div className="rowlabel">{label}</div>
      {value ? (
        <div className="gen-image-row">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
          <img src={value} alt={label} />
          <div className="gen-image-acts">
            {name && <span className="gen-image-name" title={name}>{name}</span>}
            <button type="button" className="btn-auto" onClick={() => ref.current?.click()}>Replace…</button>
            <button type="button" className="btn-auto" onClick={onClear}><X size={14} /> Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-auto gen-image-pick" disabled={busy} onClick={() => ref.current?.click()}>
          <ImagePlus size={16} aria-hidden /> {busy ? (onTrace ? "Tracing…" : "Preparing…") : color ? "Choose a photo…" : onTrace ? "Choose a picture or SVG…" : "Choose a picture…"}
        </button>
      )}
      {onTrace && <p className="note gen-image-local">Your images stay on your device: the picture is traced here, in your browser.</p>}
      {err && <p className="note err">{err}</p>}
      <input
        ref={ref} type="file" accept={onTrace ? "image/png,image/jpeg,image/webp,image/svg+xml,.svg" : "image/png,image/jpeg,image/webp"} hidden aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setErr(null);
          try {
            if (onTrace) onTrace(await traceFile(f));
            else {
              const { url, aspect } = await pictureJpeg(f, color);
              onPick(url, aspect);
            }
          } catch (x) {
            setErr(x instanceof TraceError ? x.message : onTrace ? "That file could not be read. Try a JPEG, PNG or SVG." : "That picture could not be read. Try a JPEG or PNG.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
