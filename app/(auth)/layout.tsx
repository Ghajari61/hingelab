import Link from "next/link";
import { LogoMark } from "@/components/site/LogoMark";

/** Centred card layout shared by the sign-in pages. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page auth-page">
      <Link href="/" className="auth-logo"><LogoMark /> HingeLab</Link>
      {children}
    </div>
  );
}
