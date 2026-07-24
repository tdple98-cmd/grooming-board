import { createClient } from "@supabase/supabase-js";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

/** Staff sign-in required AND the signed-in email must match VITE_OWNER_EMAIL. */
export async function requireOwner(req, { supabaseUrl, anonKey }) {
  const ownerEmail = (process.env.VITE_OWNER_EMAIL || "").trim().toLowerCase();
  if (!ownerEmail) {
    const err = new Error("Owner dashboard not configured");
    err.status = 500;
    throw err;
  }

  const token = bearerToken(req);
  if (!token) {
    const err = new Error("Sign in required");
    err.status = 401;
    throw err;
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) {
    const err = new Error("Sign in required");
    err.status = 401;
    throw err;
  }

  if ((user.email || "").trim().toLowerCase() !== ownerEmail) {
    const err = new Error("Owner only");
    err.status = 403;
    throw err;
  }

  return user;
}
