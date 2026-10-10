/**
 * Database types for the Supabase client. Mirrors supabase/migrations; regenerate with
 * `npx supabase gen types typescript --local` after changing the schema.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Plan = "free" | "pro";

export type ProfileRow = {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  plan: Plan;
  plan_status: string | null;
  current_period_end: string | null;
  created_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
