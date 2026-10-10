import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Sign in · HingeLab" };

const ERRORS: Record<string, string> = {
  callback: "That sign-in link is invalid or has expired. Try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <AuthForm mode="login" next={next} notice={error ? ERRORS[error] ?? ERRORS.callback : undefined} />;
}
