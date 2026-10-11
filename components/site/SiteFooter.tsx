import Link from "next/link";
import { LogoMark } from "./LogoMark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="f-brand">
        <Link href="/" className="site-logo"><LogoMark size={24} /> HingeLab</Link>
        <p>Laser-cut generators for boxes, toppers, signs, trophies and more.</p>
      </div>
      <nav aria-label="Product">
        <a href="/#products">Products</a>
        <a href="/#desktop">Windows app</a>
        <a href="/#pricing">Pricing</a>
        <Link href="/help">Help centre</Link>
      </nav>
      <nav aria-label="Legal">
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <p className="f-copy">© {new Date().getFullYear()} HingeLab</p>
    </footer>
  );
}
