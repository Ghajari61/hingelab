"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "./useAccount";

function initials(email: string | undefined, name: string | undefined) {
  const src = (name || email || "?").trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (name && parts[1] ? parts[1][0] : "")).toUpperCase();
}

/** Top-right of the menubar: avatar menu when signed in, "Sign in" otherwise, nothing in guest mode. */
export function UserMenu() {
  const { configured, loading, user, profile } = useAccount();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!configured || loading) return null;
  if (!user) {
    const next = typeof window !== "undefined" ? window.location.pathname : "/app";
    return <Link className="btn-signin" href={`/login?next=${encodeURIComponent(next === "/app/editor/local" ? "/app" : next)}`}>Sign in</Link>;
  }

  const meta = user.user_metadata as { full_name?: string; avatar_url?: string } | undefined;
  return (
    <div className={`menu user-menu${open ? " open" : ""}`}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="true"
        aria-label="Account"
        title={user.email}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {meta?.avatar_url
          ? <img src={meta.avatar_url} alt="" referrerPolicy="no-referrer" />
          : initials(user.email, meta?.full_name)}
      </button>
      {open && (
        <div className="dropdown" role="menu" style={{ left: "auto", right: 0 }}>
          <div className="user-head">
            <b>{meta?.full_name || user.email}</b>
            <span>{profile?.plan === "pro" ? "Pro plan" : "Free plan"}</span>
          </div>
          <hr />
          <Link role="menuitem" href="/app">My boxes</Link>
          <Link role="menuitem" href="/app/billing">Billing</Link>
          <hr />
          <form action="/auth/signout" method="post">
            <button type="submit" role="menuitem">Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
