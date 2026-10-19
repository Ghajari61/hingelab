"use client";

import { useState } from "react";
import { clientOnly } from "@hingelab/ui/lazy";
import { MATERIALS } from "@/lib/hinge/defaults";
import { materialInfo, type MaterialInfo } from "@/lib/materials/library";
import type { Units } from "@/components/editor/format";
import { useMaterials } from "./useMaterials";

const MaterialsDialog = clientOnly(() => import("./MaterialsDialog"));

const MANAGE = "__manage";

/** What the design has now, to start a new material from. */
export interface DesignMaterial { T: number; kx: number; ky: number; minFeature: number }

/**
 * The material list: the built-in materials, the user's own ones, and Manage materials… to create,
 * edit, import and export them. Picking one hands its values to the editor.
 */
export function MaterialPicker({ value, current, units, onPick }: {
  value: string;
  current: DesignMaterial;
  units: Units;
  onPick: (id: string, info: MaterialInfo | null) => void;
}) {
  const list = useMaterials();
  const [open, setOpen] = useState(false);
  const known = value in MATERIALS || list.some((m) => m.id === value);
  const pick = (id: string) => onPick(id, materialInfo(id, list));
  return (
    <>
      <select
        className="sel" aria-label="Material preset" value={value}
        onChange={(e) => (e.target.value === MANAGE ? setOpen(true) : pick(e.target.value))}
      >
        <optgroup label="Built in">
          {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </optgroup>
        {list.length > 0 && (
          <optgroup label="My materials">
            {list.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </optgroup>
        )}
        {!known && <option value={value}>Deleted material</option>}
        <option value={MANAGE}>Manage materials…</option>
      </select>
      {open && (
        <MaterialsDialog
          selected={value} current={current} units={units}
          onUse={(id, info) => onPick(id, info)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
