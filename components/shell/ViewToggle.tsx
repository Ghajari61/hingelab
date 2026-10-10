"use client";

import { Box, LayoutGrid } from "lucide-react";

export type ViewMode = "sheets" | "3d";

/** "Sheets / 3D view" switch floating at the top centre of the viewport. */
export function ViewToggle({ value, onChange, sheetsLabel = "Sheets" }: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
  sheetsLabel?: string;
}) {
  return (
    <div className="view-toggle" role="tablist" aria-label="View">
      <button type="button" role="tab" aria-selected={value === "sheets"} onClick={() => onChange("sheets")}>
        <LayoutGrid size={15} aria-hidden />{sheetsLabel}
      </button>
      <button type="button" role="tab" aria-selected={value === "3d"} onClick={() => onChange("3d")}>
        <Box size={15} aria-hidden />3D view
      </button>
    </div>
  );
}
