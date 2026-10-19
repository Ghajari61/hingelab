"use client";

import Link from "next/link";
import { useAccount } from "@/components/auth/useAccount";
import { LogoMark } from "./LogoMark";
import { SiteNav } from "./SiteNav";

/** Header of the public pages. Signed-in users get "My designs" instead of "Sign in". */
export function SiteHeader({ sections = true }: { sections?: boolean }) {
  const { configured, user } = useAccount();
  return (
    <header className="site-header">
      <Link href="/" className="site-logo"><LogoMark size={28} /> HingeLab</Link>
      {sections && <SiteNav />}
      <div className="site-cta">
        {configured && (user
          ? <Link href="/app" className="site-link">My designs</Link>
          : <Link href="/login" className="site-link">Sign in</Link>)}
        <Link href="/app/editor/local" className="btn-primary site-open">Open <span className="site-open-the">the </span>editor</Link>
      </div>
    </header>
  );
}
