"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Link2, Send } from "lucide-react";
import { publishDesignAction } from "@/app/gallery/actions";
import { hasImages, LONG_LINK, shareURL, stripAssets } from "@/lib/share";
import { designThumb } from "@/lib/share/thumb";
import { useFlags } from "./useFlags";
import "./export-dialog.css";
import "./share.css";

/**
 * File › Share link…: a link that carries the design's settings (read-only for whoever opens it,
 * with Remix), and, when the gallery is open, publishing the design there with a preview.
 */
export default function ShareDialog({ product, params, defaults, svg, signedIn, onClose, toast, note }: {
  product: string;
  params: Record<string, unknown>;
  defaults: unknown;
  /** What else the link leaves out (files kept on this device). */
  note?: string;
  /** The design's exported SVG, for the gallery preview. */
  svg: () => string | null;
  signedIn: boolean;
  onClose: () => void;
  toast: (msg: string) => void;
}) {
  const flags = useFlags();
  const pics = useMemo(() => hasImages(params), [params]);
  const [keep, setKeep] = useState(false);
  const shared = useMemo(() => stripAssets(params, defaults, keep), [params, defaults, keep]);
  const url = useMemo(() => shareURL(window.location.origin, product, shared.params), [product, shared]);
  const [name, setName] = useState(typeof params.name === "string" ? params.name : "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    ref.current?.querySelector<HTMLInputElement>("input[readonly]")?.select();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Share link copied");
    } catch {
      ref.current?.querySelector<HTMLInputElement>("input[readonly]")?.select();
      toast("Select the link and copy it (Ctrl+C)");
    }
  };

  const publish = async () => {
    const text = svg();
    const thumb = text ? designThumb(text) : null;
    if (!thumb) { setMsg({ ok: false, text: "The design has no preview to show yet." }); return; }
    setBusy(true);
    setMsg(null);
    const r = await publishDesignAction({ product, name, params: shared.params, thumb }).catch(() => ({ ok: false as const, error: "Could not publish the design. Try again." }));
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "Published. It is in the gallery now." } : { ok: false, text: r.error });
  };

  const left = [shared.images ? `${shared.images} picture${shared.images > 1 ? "s" : ""}` : "", shared.fonts ? `${shared.fonts} uploaded font${shared.fonts > 1 ? "s" : ""}` : ""].filter(Boolean);
  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal exp share" role="dialog" aria-modal="true" aria-label="Share link" ref={ref}>
        <header>Share link<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <p className="exp-about">Anyone with this link sees the design read-only and can remix it. The settings travel inside the link itself; nothing is uploaded.</p>
          <div className="share-url">
            <Link2 size={16} aria-hidden />
            <input readOnly aria-label="Share link" value={url} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn-export" onClick={() => void copy()}><Copy size={15} aria-hidden />Copy link</button>
          </div>
          <p className="note" role="status">
            {url.length.toLocaleString("en")} characters.
            {url.length > LONG_LINK ? " Some apps cut links this long; send a project file (File › Save project) instead." : ""}
          </p>
          {pics && (
            <label className="chk">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Include my pictures (the link gets much longer)
            </label>
          )}
          {left.length > 0 && <p className="note">Left out: {left.join(" and ")}. {shared.fonts ? "Uploaded fonts stay on this device; the link uses the default font instead." : "The design shows its default picture instead."}</p>}
          {note && <p className="note">{note}</p>}

          {flags.has("gallery") && (
            <section className="share-gal" aria-label="Publish to the gallery">
              <h3>Publish to the gallery</h3>
              {signedIn ? (
                <>
                  <label className="share-name">Name
                    <input className="textin" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
                  </label>
                  <button type="button" className="btn-ghost-sm" disabled={busy || !name.trim()} onClick={() => void publish()}><Send size={14} aria-hidden />{busy ? "Publishing…" : "Publish"}</button>
                  <p className="note">Others see a preview of the outlines and can remix the design. {keep ? "Your pictures go with it." : "Pictures stay out."} You can remove it from the gallery at any time.</p>
                </>
              ) : <p className="note">Sign in to publish your designs to the gallery.</p>}
              {msg && <p className={`note${msg.ok ? "" : " err"}`} role={msg.ok ? "status" : "alert"}>{msg.text}{msg.ok && <> <a href="/gallery" target="_blank" rel="noopener">Open the gallery</a></>}</p>}
            </section>
          )}
          <div className="rename-row">
            <button type="button" className="btn-ghost-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
