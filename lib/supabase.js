import { createClient } from "@supabase/supabase-js";
import { captureAuthIntentFromUrl } from "./authIntent";

// Capture invite/recovery intent before the client processes the URL hash.
captureAuthIntentFromUrl();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Auth and data sync will not work until env vars are set."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder-key",
  {
    auth: {
      detectSessionInUrl: true,
    },
  }
);
