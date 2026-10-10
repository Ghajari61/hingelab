"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/site/LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";

const NAV = [
  { href: "/home", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/templates", label: "Templates" },
  { href: "/presets", label: "Presets" },
  { href: "/help", label: "Help" },
];

export function StudioHeader({ children }: { children?: ReactNode }) {
  const path = usePathname();
  return (
    <header className="studio-top">
      <Link href="/home" className="brand"><LogoMark />HingeLab</Link>
      <nav aria-label="Studio">
        {NAV.map((n) => <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined}>{n.label}</Link>)}
      </nav>
      <div className="right">{children}<UserMenu /></div>
    </header>
  );
}
