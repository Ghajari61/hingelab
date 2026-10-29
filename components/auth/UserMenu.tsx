"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, Clock3, CreditCard, Crown, FolderOpen, LogOut, Mail, Settings, UserRound } from "lucide-react";
import { avatarBackground, avatarInitials } from "@/lib/account/avatar";
import { hasPro, effectivePlan } from "@/lib/plans";
import { useAccount } from "./useAccount";

/** A round avatar: the account's picture, or its initials on its own colour (also when the picture fails). */
export function Avatar({ email, name, src, size = 32, pro = false }: { email?: string | null; name?: string | null; src?: string | null; size?: number; pro?: boolean }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const letters = avatarInitials(email, name);
  return (
    <span
      className={`avatar-face${pro ? " is-pro" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * (letters.length > 1 ? 0.38 : 0.44)), background: avatarBackground(email || name) }}
      aria-hidden="true"
    >
      {src && !broken
        ? <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
        : letters}
    </span>
  );
}

/** Top-right of the menubar: avatar menu when signed in, "Sign in" otherwise, nothing in guest mode. */
export function UserMenu() {
  const { configured, loading, user, profile } = useAccount();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // A click anywhere closes the menu, except on Sign out: closing removes its form from the page
    // before the click submits it, and the browser then drops the submission (nothing happened).
    const close = (e: MouseEvent) => { if (!(e.target instanceof Element && e.target.closest(".user-signout"))) setOpen(false); };
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
    return <Link className="btn-signin" href={`/login?next=${encodeURIComponent(next === "/app/editor/local" ? "/app" : next)}`}><UserRound size={15} aria-hidden="true" />Sign in</Link>;
  }

  const meta = user.user_metadata as { full_name?: string; name?: string; avatar_url?: string; picture?: string } | undefined;
  const name = meta?.full_name || meta?.name || "";
  const pro = hasPro(effectivePlan(profile?.plan, profile?.current_period_end));
  return (
    <div className={`menu user-menu${open ? " open" : ""}`}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account: ${name || user.email}`}
        title={user.email}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <Avatar email={user.email} name={name} src={meta?.avatar_url || meta?.picture} pro={pro} />
      </button>
      {open && (
        <div className="dropdown" role="menu" style={{ left: "auto", right: 0 }}>
          <div className="user-head">
            <Avatar email={user.email} name={name} src={meta?.avatar_url || meta?.picture} size={40} pro={pro} />
            <div>
              <b>{name || user.email}</b>
              {name && <span>{user.email}</span>}
              <span className={`plan-chip${pro ? " pro" : ""}`}>{pro ? <><Crown size={11} aria-hidden="true" />Pro plan</> : "Free plan"}</span>
            </div>
          </div>
          <hr />
          <Link role="menuitem" href="/account"><UserRound size={15} aria-hidden="true" />Profile</Link>
          <Link role="menuitem" href="/projects"><FolderOpen size={15} aria-hidden="true" />My projects</Link>
          <Link role="menuitem" href="/bookmarks"><Bookmark size={15} aria-hidden="true" />Bookmarks</Link>
          <Link role="menuitem" href="/exports"><Clock3 size={15} aria-hidden="true" />Export history</Link>
          <Link role="menuitem" href="/app/billing"><CreditCard size={15} aria-hidden="true" />{pro ? "Plan" : "Plan · upgrade"}</Link>
          <Link role="menuitem" href="/invite"><Mail size={15} aria-hidden="true" />Invite friends</Link>
          <Link role="menuitem" href="/preferences"><Settings size={15} aria-hidden="true" />Preferences</Link>
          <hr />
          <form className="user-signout" action="/auth/signout" method="post">
            <button type="submit" role="menuitem"><LogOut size={15} aria-hidden="true" />Sign out</button>
          </form>
        </div>
      )}
    </div>
  );
}
