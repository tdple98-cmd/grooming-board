import { createClient } from "@supabase/supabase-js";
import { captureAuthIntentFromUrl } from "./authIntent";

// Capture invite/recovery intent before the client processes the URL hash.
captureAuthIntentFromUrl();

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("https://") &&
  supabaseUrl.includes(".supabase.co") &&
  supabaseAnonKey.length > 20
);

export const supabaseHost = (() => {
  try {
    return supabaseUrl ? new URL(supabaseUrl).host : null;
  } catch {
    return null;
  }
})();

if (!isSupabaseConfigured) {
  console.error(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild/redeploy."
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
