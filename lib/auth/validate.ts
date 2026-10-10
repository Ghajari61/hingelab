/** Client-side checks for the sign-in forms. Supabase checks again on the server. */

export const MIN_PASSWORD = 8;

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export type CredentialErrors = { email?: string; password?: string; confirm?: string };

export function checkCredentials(
  mode: "login" | "signup" | "reset" | "update",
  email: string,
  password: string,
  confirm?: string,
): CredentialErrors {
  const errors: CredentialErrors = {};
  if (mode !== "update" && !validEmail(email)) errors.email = "Enter a valid email address.";
  if (mode === "login" && !password) errors.password = "Enter your password.";
  if (mode === "signup" || mode === "update") {
    if (password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`;
    else if (confirm !== undefined && confirm !== password) errors.confirm = "The passwords do not match.";
  }
  return errors;
}

/** Turns Supabase auth error messages into plain sentences for the form. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password do not match an account.";
  if (m.includes("email not confirmed")) return "Confirm your email first. We sent you a link when you signed up.";
  if (m.includes("already registered") || m.includes("already been registered")) return "An account with this email already exists. Sign in instead.";
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) return "Google sign-in is not set up yet. Use email and password for now.";
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password should be")) return `Use at least ${MIN_PASSWORD} characters.`;
  if (m.includes("fetch") || m.includes("network")) return "Cannot reach the server. Check your connection and try again.";
  return message;
}
