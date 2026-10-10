import type { Metadata } from "next";
import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My boxes · HingeLab" };

export default async function MyBoxesPage() {
  const session = await getUser();
  return (
    <div className="page auth-page">
      <div className="auth-card">
        <h1>My boxes</h1>
        <p className="auth-lead">Signed in as {session?.user.email}.</p>
        <Link className="btn-primary" href="/app/editor/local">Open the editor</Link>
      </div>
    </div>
  );
}
