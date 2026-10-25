"use client";

import { useState } from "react";
import { calibrationFromCoupons } from "@/lib/generators/calibration/results";
import { applyCalibration, type UserMaterial } from "@/lib/materials/library";

const KEYS = ["cutKx", "cutKy", "strips", "width", "totalX", "totalY", "clearance", "hingeRadius"] as const;
type Key = (typeof KEYS)[number];
const LABEL: Record<Key, string> = {
  cutKx: "Cut with kerf X, mm", cutKy: "Cut with kerf Y, mm", strips: "Strips in a set", width: "Strip width, mm",
  totalX: "X strips together, mm", totalY: "Y strips together, mm", clearance: "Best fit slot, mm", hingeRadius: "Tightest clean bend, radius mm",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * What the user measured on the Calibration coupons, turned into the material's calibration: the
 * kerf from the strips, the fit clearance and the hinge radius. Blank readings are left out.
 */
export function CouponResults({ draft, onRecord }: { draft: UserMaterial; onRecord: (m: UserMaterial, msg: { text: string; bad?: boolean }) => void }) {
  const [v, setV] = useState<Record<Key, string>>({ cutKx: String(draft.kx), cutKy: String(draft.ky), strips: "5", width: "10", totalX: "", totalY: "", clearance: "", hingeRadius: "" });
  const [notes, setNotes] = useState("");

  function record() {
    const n = (k: Key) => (v[k].trim() ? Number(v[k].replace(",", ".")) : undefined);
    const bad = KEYS.find((k) => v[k].trim() && !Number.isFinite(n(k)));
    if (bad) { onRecord(draft, { text: `${LABEL[bad]}: enter a number.`, bad: true }); return; }
    const r = calibrationFromCoupons({ cutKx: n("cutKx") ?? draft.kx, cutKy: n("cutKy") ?? draft.ky, strips: n("strips") ?? 5, width: n("width") ?? 10, totalX: n("totalX"), totalY: n("totalY"), clearance: n("clearance"), hingeRadius: n("hingeRadius"), notes }, today());
    if ("error" in r) { onRecord(draft, { text: r.error, bad: true }); return; }
    const m = applyCalibration(draft, r.cal);
    const got = [r.cal.kx != null && `kerf X ${r.cal.kx} mm`, r.cal.ky != null && `kerf Y ${r.cal.ky} mm`, r.cal.clearance != null && `clearance ${r.cal.clearance} mm`, r.cal.hingeRadius != null && `hinge radius ${r.cal.hingeRadius} mm`].filter(Boolean).join(", ");
    onRecord(m, { text: `Recorded ${got}. Save to keep it.` });
  }

  return (
    <details className="mats-cal">
      <summary>Record coupon results</summary>
      <p className="note">Cut the Calibration coupons from this sheet, measure them with calipers and enter what you measured. Leave out what you did not test.</p>
      <div className="grid2">
        {KEYS.map((k) => (
          <label key={k} className="mats-name">{LABEL[k]}
            <input className="textin" type="text" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="mats-name">Notes
        <input className="textin" type="text" maxLength={400} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="rename-row"><button type="button" className="btn-ghost-sm" onClick={record}>Record results</button></div>
    </details>
  );
}
