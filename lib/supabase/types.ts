/**
 * Database types for the Supabase client. Mirrors supabase/migrations; regenerate with
 * `npx supabase gen types typescript --local` after changing the schema.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Plan = "free" | "pro";
export type ProductId = "hinge-box" | "letters" | "parametric";

export type ProfileRow = {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  plan: Plan;
  plan_status: string | null;
  current_period_end: string | null;
  created_at: string | null;
};

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  product: ProductId;
  params: Json;
  thumbnail_svg: string | null;
  engine_version: number;
  created_at: string | null;
  updated_at: string | null;
};

export type UserPresetRow = {
  id: string;
  user_id: string;
  product: ProductId;
  name: string;
  params: Json;
  created_at: string | null;
};

export type Database = {
  public: {
    Tables: {
      user_presets: {
        Row: UserPresetRow;
        Insert: Partial<UserPresetRow> & { product: ProductId; name: string; params: Json };
        Update: Partial<UserPresetRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      projects: {
        Row: ProjectRow;
        Insert: Partial<ProjectRow> & { params: Json };
        Update: Partial<ProjectRow>;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
