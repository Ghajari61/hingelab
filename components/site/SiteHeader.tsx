"use client";

import Link from "next/link";
import { useAccount } from "@/components/auth/useAccount";
import { LogoMark } from "./LogoMark";

/** Header of the public pages. Signed-in users get "My boxes" instead of "Sign in". */
export function SiteHeader({ sections = true }: { sections?: boolean }) {
  const { configured, user } = useAccount();
  return (
    <header className="site-header">
      <Link href="/" className="site-logo"><LogoMark size={26} /> HingeLab</Link>
      {sections && (
        <nav className="site-nav" aria-label="Sections">
          <a href="/#how">How it works</a>
          <a href="/#examples">Examples</a>
          <a href="/#pricing">Pricing</a>
          <a href="/#faq">FAQ</a>
        </nav>
      )}
      <div className="site-cta">
        {configured && (user
          ? <Link href="/app" className="site-link">My boxes</Link>
          : <Link href="/login" className="site-link">Sign in</Link>)}
        <Link href="/app/editor/local" className="btn-primary">Open the editor</Link>
      </div>
    </header>
  );
}
