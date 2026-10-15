import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Loader2, RotateCw } from "lucide-react";
import { ipc, type AppError, type WebBounds, type WebPageEvent } from "../ipc";

export type WebRoute = "web-editors" | "web-studio" | "web-ai" | "web-projects";

/** The website's sections the app shows inside its window, and where each one starts. */
export const WEB_HOME: Record<WebRoute, string> = {
  "web-editors": "/app/editor/local",
  "web-studio": "/home",
  "web-ai": "/home?new=ai",
  "web-projects": "/app",
};

export const isWebRoute = (r: string): r is WebRoute => r in WEB_HOME;

/** Open requests: a new `n` makes the view go to `path`; the same `n` only shows it again. */
export interface WebRequest {
  path: string;
  n: number;
}

/** The last request the view went to; it outlives WebHost, which unmounts on native pages. */
let shownRequest = -1;

function boundsOf(el: HTMLElement): WebBounds {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
}

/**
 * Holds the place of the website view: the view itself is a separate webview the Rust side lays
 * over this element, so it follows the element's size and hides while a dialog is open.
 */
export function WebHost({ request, covered, onError }: { request: WebRequest; covered: boolean; onError: (e: AppError) => void }) {
  const area = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<WebPageEvent | null>(null);
  const [opening, setOpening] = useState(true);
  const error = useRef(onError);
  error.current = onError;

  useEffect(() => {
    if (!area.current) return;
    if (covered) {
      void ipc.webHide();
      return;
    }
    const path = request.n !== shownRequest ? request.path : null;
    shownRequest = request.n;
    void ipc.webOpen(path, boundsOf(area.current)).catch((e: AppError) => error.current(e)).finally(() => setOpening(false));
  }, [request.n, request.path, covered]);

  useEffect(() => () => void ipc.webHide(), []);

  useEffect(() => {
    const el = area.current;
    if (!el || covered) return;
    let frame = 0;
    const send = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void ipc.webBounds(boundsOf(el)).catch(() => {}));
    };
    const ro = new ResizeObserver(send);
    ro.observe(el);
    window.addEventListener("resize", send);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", send);
    };
  }, [covered]);

  useEffect(() => {
    const off = listen<WebPageEvent>("web-page", (e) => setPage((old) => ({ ...e.payload, title: e.payload.title ?? (old?.path === e.payload.path ? old.title : null) })));
    return () => void off.then((f) => f());
  }, []);

  const act = (a: "back" | "forward" | "reload" | "browser") => void ipc.webAction(a).catch((e: AppError) => error.current(e));
  const where = page?.title?.replace(/\s*[|·–-]\s*HingeLab\s*$/i, "") || page?.path || "HingeLab online";
  return (
    <div className="web">
      <div className="web-bar" role="toolbar" aria-label="Website">
        <button type="button" className="icon-btn" title="Back" aria-label="Back" onClick={() => act("back")}><ArrowLeft size={16} aria-hidden /></button>
        <button type="button" className="icon-btn" title="Forward" aria-label="Forward" onClick={() => act("forward")}><ArrowRight size={16} aria-hidden /></button>
        <button type="button" className="icon-btn" title="Reload" aria-label="Reload" onClick={() => act("reload")}>
          {page?.loading ? <Loader2 size={16} className="spin" aria-hidden /> : <RotateCw size={15} aria-hidden />}
        </button>
        <span className="web-where" title={page?.path}><Globe size={13} aria-hidden /><span>{where}</span></span>
        <button type="button" className="btn web-out" onClick={() => act("browser")}><ExternalLink size={14} aria-hidden />Open in browser</button>
      </div>
      <div className="web-area" ref={area}>
        {opening && <div className="web-wait" role="status"><Loader2 size={18} className="spin" aria-hidden />Opening HingeLab online…</div>}
      </div>
    </div>
  );
}
