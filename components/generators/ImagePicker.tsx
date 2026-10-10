"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";

/** Longest side of the stored picture, px (about 0.3 mm per pixel on a 300 mm puzzle). */
const MAX_PX = 1000;
/** Stored pictures stay well inside the browser's autosave space. */
const MAX_BYTES = 700 * 1024;

/** The picture as a grey JPEG data URL, at most MAX_PX on its longest side, and its width / height. */
export async function greyJpeg(file: Blob): Promise<{ url: string; aspect: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_PX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const g = cv.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  g.putImageData(img, 0, 0);
  let q = 0.85, url = cv.toDataURL("image/jpeg", q);
  while (url.length > MAX_BYTES && q > 0.4) { q -= 0.1; url = cv.toDataURL("image/jpeg", q); }
  return { url, aspect: w / h };
}

export function ImagePicker({ label, value, onPick, onClear }: {
  label: string;
  value: string;
  onPick: (url: string, aspect: number) => void;
  onClear: () => void;
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
          <img src={value} alt="Picture to engrave" />
          <div className="gen-image-acts">
            <button type="button" className="btn-auto" onClick={() => ref.current?.click()}>Replace…</button>
            <button type="button" className="btn-auto" onClick={onClear}><X size={14} /> Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn-auto gen-image-pick" disabled={busy} onClick={() => ref.current?.click()}>
          <ImagePlus size={16} /> {busy ? "Preparing…" : "Choose a picture…"}
        </button>
      )}
      {err && <p className="note err">{err}</p>}
      <input
        ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={label}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setErr(null);
          try {
            const { url, aspect } = await greyJpeg(f);
            onPick(url, aspect);
          } catch {
            setErr("That picture could not be read. Try a JPEG or PNG.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
