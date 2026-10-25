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
        <Link href="/generators">Generators</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/tools">Free tools</Link>
        <Link href="/help">Guides</Link>
        <a href="/#pricing">Pricing</a>
      </nav>
      <nav aria-label="Company">
        <Link href="/about">About</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/privacy">Privacy</Link>
      </nav>
      <p className="f-copy">© {new Date().getFullYear()} HingeLab</p>
    </footer>
  );
}
