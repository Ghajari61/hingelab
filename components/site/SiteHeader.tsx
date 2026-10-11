"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAccount } from "@/components/auth/useAccount";
import { GENERATOR_IDS, GENERATOR_INFO } from "@/lib/generators/ids";
import { LogoMark } from "./LogoMark";

const PRODUCTS = [
  { id: "hinge", name: "Hinge Box" },
  { id: "letters", name: "Letters" },
  { id: "parametric", name: "Parametric" },
  ...GENERATOR_IDS.map((id) => ({ id, name: GENERATOR_INFO[id].name })),
];

/** Header of the public pages. Signed-in users get "My designs" instead of "Sign in". */
export function SiteHeader({ sections = true }: { sections?: boolean }) {
  const { configured, user } = useAccount();
  return (
    <header className="site-header">
      <Link href="/" className="site-logo"><LogoMark size={28} /> HingeLab</Link>
      {sections && (
        <nav className="site-nav" aria-label="Sections">
          <div className="nav-menu">
            <a href="/#products" aria-haspopup="true">Products<ChevronDown size={14} aria-hidden="true" /></a>
            <div className="nav-drop" role="menu" aria-label="Products">
              {PRODUCTS.map((p) => (
                <Link key={p.id} role="menuitem" href={`/app/editor/local?p=${p.id}`}>{p.name}</Link>
              ))}
            </div>
          </div>
          <a href="/#occasions">Occasions</a>
          <a href="/#features">Features</a>
          <a href="/#desktop">Windows app</a>
          <a href="/#pricing">Pricing</a>
          <a href="/help">Help</a>
        </nav>
      )}
      <div className="site-cta">
        {configured && (user
          ? <Link href="/app" className="site-link">My designs</Link>
          : <Link href="/login" className="site-link">Sign in</Link>)}
        <Link href="/app/editor/local" className="btn-primary">Open the editor</Link>
      </div>
    </header>
  );
}
