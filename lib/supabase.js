import { createClient } from "@supabase/supabase-js";
import { primeAuthTypeFromUrl } from "./authIntent";

// Snapshot URL intent before the client processes the hash.
primeAuthTypeFromUrl();

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export function getSupabaseConfigStatus() {
  const issues = [];
  if (!supabaseUrl) issues.push("VITE_SUPABASE_URL is missing");
  else if (!supabaseUrl.startsWith("https://")) issues.push("VITE_SUPABASE_URL must start with https://");
  else if (!supabaseUrl.includes(".supabase.co")) issues.push("VITE_SUPABASE_URL must be your *.supabase.co project URL");

  if (!supabaseAnonKey) issues.push("VITE_SUPABASE_ANON_KEY is missing");
  else if (supabaseAnonKey.startsWith("sb_secret_")) {
    issues.push("VITE_SUPABASE_ANON_KEY must be the publishable key (sb_publishable_...), not the secret key");
  } else if (supabaseAnonKey.length < 20) issues.push("VITE_SUPABASE_ANON_KEY looks too short");

  return {
    ok: issues.length === 0,
    issues,
    hasUrl: Boolean(supabaseUrl),
    hasKey: Boolean(supabaseAnonKey),
  };
}

export const isSupabaseConfigured = getSupabaseConfigStatus().ok;

if (!isSupabaseConfigured) {
  console.error(
    "Supabase is not configured at build time:",
    getSupabaseConfigStatus().issues.join("; ")
  );
}

export const supabase = createClient(
  supabaseUrl || "https://invalid.supabase.co",
  supabaseAnonKey || "invalid-key",
  {
    auth: {
      detectSessionInUrl: true,
    },
  }
);
