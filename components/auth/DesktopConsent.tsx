"use client";

import { useState } from "react";
import { MonitorDown } from "lucide-react";
import { approveDesktop } from "@/app/(auth)/desktop/authorize/actions";

/** Allow / Cancel for the desktop sign-in. The code goes only to the app's own 127.0.0.1 address. */
export function DesktopConsent({ email, redirectURI, state, challenge }: { email: string; redirectURI: string; state: string; challenge: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "allowed" | "denied">("");
  const [error, setError] = useState("");

  async function allow() {
    setBusy(true);
    setError("");
    const out = await approveDesktop(redirectURI, state, challenge);
    if ("error" in out) {
      setError(out.error);
      setBusy(false);
      return;
    }
    setDone("allowed");
    window.location.assign(out.url);
  }

  function cancel() {
    setDone("denied");
    window.location.assign(`${redirectURI}?${new URLSearchParams({ error: "access_denied", state })}`);
  }

  if (done) {
    return (
      <div className="auth-card">
        <h1>{done === "allowed" ? "You're signed in" : "Sign-in cancelled"}</h1>
        <p className="auth-lead">You can close this tab and go back to the HingeLab app.</p>
      </div>
    );
  }
  return (
    <div className="auth-card">
      <MonitorDown size={28} aria-hidden />
      <h1>Sign in to HingeLab for Windows?</h1>
      <p className="auth-lead">
        The HingeLab desktop app on this computer will use your account{email ? <> (<b>{email}</b>)</> : null}: your plan, and designs
        built on our servers. Only allow this if you just chose Sign in in the app.
      </p>
      {error && <p className="auth-msg err" role="alert">{error}</p>}
      <button type="button" className="btn-primary" onClick={allow} disabled={busy}>{busy ? "Please wait…" : "Allow"}</button>
      <div className="auth-links">
        <button type="button" className="linklike" onClick={cancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}
