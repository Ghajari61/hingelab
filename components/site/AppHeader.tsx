import Link from "next/link";
import { LogoMark } from "./LogoMark";
import { UserMenu } from "@/components/auth/UserMenu";

/** Top bar of the account pages (Projects, Billing): same chrome as the editor menubar. */
export function AppHeader({ current }: { current: "boxes" | "billing" | "ai" }) {
  return (
    <header className="menubar app-header">
      <Link href="/app" className="logo"><LogoMark /> HingeLab</Link>
      <nav className="app-nav" aria-label="Account">
        <Link href="/app" aria-current={current === "boxes" ? "page" : undefined}>Projects</Link>
        <Link href="/app/ai" aria-current={current === "ai" ? "page" : undefined}>AI designer</Link>
        <Link href="/app/billing" aria-current={current === "billing" ? "page" : undefined}>Billing</Link>
      </nav>
      <span className="grow" />
      <UserMenu />
    </header>
  );
}
