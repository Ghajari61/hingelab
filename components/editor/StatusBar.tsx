"use client";

export function StatusBar({
  x, y, zoom, parts, fit, saved,
}: {
  x: string;
  y: string;
  zoom: string;
  parts: { count: number; used: string } | null;
  fit: { cls: "s-ok" | "s-warn" | "s-err"; text: string };
  saved: string;
}) {
  return (
    <footer className="statusbar" tabIndex={0} aria-label="Status">
      <span className="sb-wide">X <span className="num">{x}</span></span>
      <span className="sb-wide">Y <span className="num">{y}</span></span>
      <span className="sb-wide">Zoom <span className="num">{zoom}</span></span>
      {parts && <span>Parts <span className="num">{parts.count}</span><span className="sb-wide"> · Used <span className="num">{parts.used}</span></span></span>}
      <span><span className={fit.cls}>{fit.cls === "s-err" ? fit.text : `● ${fit.text}`}</span></span>
      <span className="push">{saved}</span>
    </footer>
  );
}
