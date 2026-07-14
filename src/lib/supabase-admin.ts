/**
 * Server-side Supabase client (service role preferred, anon fallback).
 * Used by vault ingest/search and brand kits.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const isRealKey = (k?: string): k is string => !!k && /^(eyJ|sb_)/.test(k);

export function supabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    (isRealKey(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.SUPABASE_SERVICE_ROLE_KEY) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !!(url && isRealKey(key));
}

let _db: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient | null {
  if (_db) return _db;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = isRealKey(service) ? service : isRealKey(anon) ? anon : undefined;
  if (!url || !key) return null;
  _db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _db;
}
