import Link from "next/link";
import { LogoMark } from "./LogoMark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <Link href="/" className="site-logo"><LogoMark size={22} /> HingeLab</Link>
      <nav aria-label="Legal">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <p>© {new Date().getFullYear()} HingeLab. Living-hinge boxes, ready to cut.</p>
    </footer>
  );
}
