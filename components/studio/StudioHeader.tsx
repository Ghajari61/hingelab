"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { UserMenu } from "@/components/auth/UserMenu";
import { LogoMark } from "@/components/site/LogoMark";
import { SiteNav } from "@/components/site/SiteNav";

export function StudioHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="studio-top">
      <Link href="/home" className="brand"><LogoMark />HingeLab</Link>
      <SiteNav />
      <div className="right">{children}<UserMenu /></div>
    </header>
  );
}
