import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth/AuthForm";
import { getUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "New password · HingeLab" };

/** Reached from the reset email (through /auth/callback, which signs the user in). */
export default async function UpdatePasswordPage() {
  if (supabaseConfigured() && !(await getUser())) {
    return (
      <div className="auth-card">
        <h1>Link expired</h1>
        <p className="auth-lead">This password reset link is no longer valid. Ask for a new one.</p>
        <Link className="btn-primary" href="/reset-password">Send a new link</Link>
      </div>
    );
  }
  return <AuthForm mode="update" />;
}
