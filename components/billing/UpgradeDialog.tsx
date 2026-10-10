"use client";

import { useState } from "react";
import { PRICES, PRO_BENEFITS } from "@/lib/plans";
import { startCheckout } from "./billingClient";

/**
 * "Upgrade to Pro" dialog shown when a locked feature is used. Signed-out visitors are sent to
 * sign up first and come back to Billing.
 */
export function UpgradeDialog({ reason, signedIn, onClose }: { reason: string; signedIn: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState<"month" | "year" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const yearlySaving = Math.round((1 - PRICES.yearly / (PRICES.monthly * 12)) * 100);

  async function buy(interval: "month" | "year") {
    setBusy(interval);
    setError(null);
    const err = await startCheckout(interval);
    if (err) { setError(err); setBusy(null); }
  }

  return (
    <div className="modal-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal upgrade" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
        <header>Upgrade to Pro<button type="button" aria-label="Close" onClick={onClose}>×</button></header>
        <div className="mb">
          <p className="upgrade-reason">{reason}</p>
          <ul className="upgrade-list">
            {PRO_BENEFITS.map((b) => <li key={b}>{b}</li>)}
          </ul>
          {signedIn ? (
            <div className="upgrade-buy">
              <button type="button" className="btn-export" disabled={!!busy} onClick={() => buy("month")}>
                {busy === "month" ? "Opening checkout…" : `$${PRICES.monthly} / month`}
              </button>
              <button type="button" className="btn-export" disabled={!!busy} onClick={() => buy("year")}>
                {busy === "year" ? "Opening checkout…" : `$${PRICES.yearly} / year`}
              </button>
              <span className="upgrade-save">Yearly saves {yearlySaving}%</span>
            </div>
          ) : (
            <div className="upgrade-buy">
              <a className="btn-export" href="/signup?next=%2Fapp%2Fbilling">Create a free account</a>
              <a className="upgrade-link" href="/login?next=%2Fapp%2Fbilling">I already have one</a>
            </div>
          )}
          {error && <p className="upgrade-error" role="alert">{error}</p>}
          <p className="upgrade-fine">Cancel any time from Billing. Prices in {PRICES.currency}.</p>
        </div>
      </div>
    </div>
  );
}
