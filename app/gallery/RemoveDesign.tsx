"use client";

import { useState } from "react";
import { removeDesignAction } from "./actions";

export function RemoveDesign({ id, name }: { id: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button" className="btn-ghost-sm" disabled={busy}
        onClick={async () => {
          if (!window.confirm(`Remove “${name}” from the gallery?`)) return;
          setBusy(true);
          const r = await removeDesignAction(id);
          setBusy(false);
          if (!r.ok) setErr(r.error);
        }}
      >Remove</button>
      {err && <span role="alert" className="gal-err">{err}</span>}
    </>
  );
}
