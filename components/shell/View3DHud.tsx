"use client";

/** The 3D view's HUD: Assembled / Lay flat, and the explode slider while assembled. */
export function View3DHud({ flat, onFlat, explode, onExplode, explodeLabel = "Explode" }: {
  flat: boolean;
  onFlat: (flat: boolean) => void;
  explode: number;
  onExplode: (v: number) => void;
  /** Hidden when null (nothing to pull apart). */
  explodeLabel?: string | null;
}) {
  return (
    <div className="hud3d">
      <div className="iconseg" role="group" aria-label="3D layout">
        <button type="button" aria-pressed={!flat} onClick={() => onFlat(false)}>Assembled</button>
        <button type="button" aria-pressed={flat} onClick={() => onFlat(true)}>Lay flat</button>
      </div>
      {!flat && explodeLabel && (
        <label className="explode">{explodeLabel} <input type="range" min={0} max={1} step={0.01} value={explode} aria-label={explodeLabel} onChange={(e) => onExplode(parseFloat(e.target.value))} /></label>
      )}
    </div>
  );
}
