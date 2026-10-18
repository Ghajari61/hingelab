/**
 * Database types for the Supabase client. Mirrors supabase/migrations; regenerate with
 * `npx supabase gen types typescript --local` after changing the schema.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Plan = "free" | "pro" | "business" | "lifetime";
export type ProductId = "hinge-box" | "letters" | "parametric";

export type ProfileRow = {
  id: string;
  email: string | null;
  stripe_customer_id: string | null;
  /** Set by the webhook from the subscription item. Absent until the pricing migration is applied. */
  stripe_price_id: string | null;
  /** Founder Lifetime, kept even if a later Business subscription ends. */
  founder: boolean;
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

export type GalleryRow = {
  id: string;
  user_id: string;
  product: string;
  name: string;
  params: Json;
  thumbnail: string;
  hidden: boolean;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      gallery_designs: {
        Row: GalleryRow;
        Insert: Partial<GalleryRow> & { product: string; name: string; params: Json; thumbnail: string };
        Update: Partial<GalleryRow>;
        Relationships: [];
      };
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
    Functions: {
      /** Service role only: counts one request against a fixed window (security migration). */
      rate_limit_hit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number };
        Returns: { allowed: boolean; retry_after: number }[];
      };
      rate_limit_refund: {
        Args: { p_key: string; p_amount: number };
        Returns: undefined;
      };
      desktop_code_create: {
        Args: { p_user: string; p_code_hash: string; p_challenge: string; p_redirect: string; p_ttl_seconds: number };
        Returns: undefined;
      };
      desktop_code_take: {
        Args: { p_code_hash: string };
        Returns: { user_id: string; code_challenge: string; redirect_uri: string; expired: boolean }[];
      };
      desktop_session_create: {
        Args: { p_user: string; p_access_hash: string; p_access_ttl: number; p_refresh_hash: string; p_refresh_ttl: number; p_device: string };
        Returns: string;
      };
      desktop_session_user: {
        Args: { p_access_hash: string };
        Returns: { session_id: string; user_id: string }[];
      };
      desktop_session_refresh: {
        Args: { p_refresh_hash: string; p_access_hash: string; p_access_ttl: number; p_refresh_hash_new: string; p_refresh_ttl: number };
        Returns: { session_id: string | null; user_id: string | null; outcome: "ok" | "expired" | "reused" | "unknown" }[];
      };
      desktop_session_revoke: {
        Args: { p_hash: string };
        Returns: boolean;
      };
      desktop_sessions_revoke_all: {
        Args: { p_user: string };
        Returns: number;
      };
      /** Service role only: the AI designer's example library (ai_examples migration). */
      ai_is_curator: {
        Args: { p_user: string };
        Returns: boolean;
      };
      ai_examples_list: {
        Args: Record<string, never>;
        Returns: { id: string; title: string; description: string; tags: string; width_mm: number; height_mm: number; render_path: string; svg_path: string; photo_path: string | null; created_at: string }[];
      };
      ai_example_add: {
        Args: { p_user: string; p_id: string; p_title: string; p_description: string; p_tags: string; p_width: number; p_height: number; p_render_path: string; p_svg_path: string; p_photo_path: string | null };
        Returns: undefined;
      };
      ai_example_delete: {
        Args: { p_user: string; p_id: string };
        Returns: { render_path: string; svg_path: string; photo_path: string | null }[];
      };
      /** How many Founder Lifetime seats are still unsold (200 cap). */
      founder_seats_left: { Args: Record<string, never>; Returns: number };
      /** Claims one Founder seat for this user. False when all 200 are taken. Service role only. */
      grant_founder: { Args: { p_user: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
