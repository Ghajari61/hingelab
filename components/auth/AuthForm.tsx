"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getBrowserClient } from "@/lib/supabase/client";
import { checkCredentials, friendlyAuthError, type CredentialErrors } from "@/lib/auth/validate";
import { GUEST_EDITOR, safeNext } from "@/lib/auth/routes";

export type AuthMode = "login" | "signup" | "reset" | "update";

const TITLES: Record<AuthMode, { title: string; lead: string; submit: string }> = {
  login: { title: "Sign in", lead: "Open your boxes on any computer.", submit: "Sign in" },
  signup: { title: "Create your account", lead: "Save your boxes to the cloud and open them anywhere.", submit: "Create account" },
  reset: { title: "Reset your password", lead: "We will email you a link to choose a new password.", submit: "Send reset link" },
  update: { title: "Choose a new password", lead: "Use at least 8 characters.", submit: "Save password" },
};

const GOOGLE_ICON = (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export function AuthForm({ mode, next, notice }: { mode: AuthMode; next?: string; notice?: string }) {
  const router = useRouter();
  const supabase = getBrowserClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(notice ? { kind: "err", text: notice } : null);
  const [busy, setBusy] = useState(false);
  const target = safeNext(next);
  const t = TITLES[mode];

  if (!supabase) {
    return (
      <div className="auth-card">
        <h1>{t.title}</h1>
        <p className="auth-lead">Accounts are not set up on this server yet. You can still use the editor; your work is saved in this browser.</p>
        <Link className="btn-primary" href={GUEST_EDITOR}>Open the editor</Link>
      </div>
    );
  }

  const callback = (after: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(after)}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || busy) return;
    const found = checkCredentials(mode, email, password, mode === "signup" || mode === "update" ? confirm : undefined);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        router.replace(target);
        router.refresh();
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: callback(target) },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(target);
          router.refresh();
        } else {
          setMessage({ kind: "ok", text: `We sent a confirmation link to ${email.trim()}. Open it to finish creating your account.` });
        }
      } else if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: callback("/update-password") });
        if (error) throw error;
        setMessage({ kind: "ok", text: "If an account exists for this email, a reset link is on its way." });
      } else {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        router.replace("/app");
        router.refresh();
      }
    } catch (err) {
      setMessage({ kind: "err", text: friendlyAuthError(err instanceof Error ? err.message : String(err)) });
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!supabase) return;
    setMessage(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback(target) } });
    if (error) setMessage({ kind: "err", text: friendlyAuthError(error.message) });
  }

  const withNext = (path: string) => (next ? `${path}?next=${encodeURIComponent(target)}` : path);

  return (
    <div className="auth-card">
      <h1>{t.title}</h1>
      <p className="auth-lead">{t.lead}</p>
      {(mode === "login" || mode === "signup") && (
        <>
          <button type="button" className="btn-google" onClick={google}>{GOOGLE_ICON} Continue with Google</button>
          <div className="auth-or"><span>or</span></div>
        </>
      )}
      <form onSubmit={submit} noValidate>
        {mode !== "update" && (
          <label className="auth-field">
            <span>Email</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errors.email} autoFocus />
            {errors.email && <em>{errors.email}</em>}
          </label>
        )}
        {mode !== "reset" && (
          <label className="auth-field">
            <span>{mode === "update" ? "New password" : "Password"}</span>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              autoFocus={mode === "update"}
            />
            {errors.password && <em>{errors.password}</em>}
          </label>
        )}
        {(mode === "signup" || mode === "update") && (
          <label className="auth-field">
            <span>Repeat password</span>
            <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={!!errors.confirm} />
            {errors.confirm && <em>{errors.confirm}</em>}
          </label>
        )}
        {message && <p className={`auth-msg ${message.kind}`} role={message.kind === "err" ? "alert" : "status"}>{message.text}</p>}
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Please wait…" : t.submit}</button>
      </form>
      <div className="auth-links">
        {mode === "login" && <><Link href="/reset-password">Forgot your password?</Link><span>New here? <Link href={withNext("/signup")}>Create an account</Link></span></>}
        {mode === "signup" && <span>Already have an account? <Link href={withNext("/login")}>Sign in</Link></span>}
        {mode === "reset" && <Link href="/login">Back to sign in</Link>}
        <Link href={GUEST_EDITOR}>Continue without an account</Link>
      </div>
    </div>
  );
}
