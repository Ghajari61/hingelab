/**
 * Public Supabase settings. Both values are safe in the browser (the anon key only grants what
 * Row Level Security allows). Without them the app runs in guest mode: the editor works and saves
 * to this browser only, and account pages explain that sign-in is not set up yet.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function supabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}
