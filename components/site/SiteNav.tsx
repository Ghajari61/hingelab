"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { useAccount } from "@/components/auth/useAccount";
import { NAV_GROUPS } from "@/lib/generators/navLinks";

/** Make / Community / Learn. Desktop menus, plus a drawer on a narrow screen. */
export function SiteNav() {
  const [drawer, setDrawer] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const { user } = useAccount();
  return (
    <>
      <nav className="site-nav ia-nav" aria-label="Sections">
        {NAV_GROUPS.map((g) => (
          <div className="nav-menu" key={g.id}>
            <a href={g.links[0].href} aria-haspopup="true">{g.label}</a>
            <div className="nav-drop" role="menu" aria-label={g.label}>
              {g.links.map((l) => <Link key={l.href} role="menuitem" href={l.href}>{l.label}</Link>)}
            </div>
          </div>
        ))}
        <form className="ia-search" action="/generators" role="search">
          <Search size={14} aria-hidden="true" />
          <input name="q" type="search" placeholder="Search generators" aria-label="Search generators" />
        </form>
      </nav>
      <button type="button" className="ia-menu-btn" aria-expanded={drawer} aria-controls="ia-drawer" onClick={() => setDrawer(true)}>
        <Menu size={18} aria-hidden="true" /> Menu
      </button>
      {drawer && (
        <div className="ia-drawer-back" onClick={() => setDrawer(false)}>
          <div className="ia-drawer" id="ia-drawer" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ia-drawer-close" onClick={() => setDrawer(false)} aria-label="Close menu"><X size={18} /></button>
            <button type="button" className="ia-acc" aria-expanded={accountOpen} onClick={() => setAccountOpen((v) => !v)}>Account</button>
            {accountOpen && (
              <div className="ia-acc-links">
                {user ? <Link href="/account" onClick={() => setDrawer(false)}>Profile</Link> : <Link href="/login" onClick={() => setDrawer(false)}>Sign in</Link>}
                <Link href="/projects" onClick={() => setDrawer(false)}>My projects</Link>
                <Link href="/app/billing" onClick={() => setDrawer(false)}>Plan</Link>
                <Link href="/bookmarks" onClick={() => setDrawer(false)}>Bookmarks</Link>
              </div>
            )}
            {NAV_GROUPS.map((g) => (
              <div key={g.id}>
                <p className="ia-group">{g.label}</p>
                {g.links.map((l) => <Link key={l.href} href={l.href} onClick={() => setDrawer(false)}>{l.label}</Link>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
