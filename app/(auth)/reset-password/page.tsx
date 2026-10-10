import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Reset password · HingeLab" };

export default function ResetPasswordPage() {
  return <AuthForm mode="reset" />;
}
