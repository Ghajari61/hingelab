"use client";

import type { ReactNode } from "react";
import { Download } from "lucide-react";

/** Right column: the scrolling panel dock with the export button pinned underneath. */
export function DockColumn({ children, onExport, exportLabel, extra }: {
  children: ReactNode;
  onExport: () => void;
  exportLabel: string;
  extra?: ReactNode;
}) {
  return (
    <div className="dock-col">
      {children}
      <div className="dock-foot">
        {extra}
        <button className="btn-export wide" type="button" onClick={onExport}><Download size={16} aria-hidden />{exportLabel}</button>
      </div>
    </div>
  );
}
