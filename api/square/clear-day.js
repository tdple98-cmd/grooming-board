import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";
import { clearAppointmentsOnDate } from "../lib/clearAppointmentDay.js";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

async function authorizeStaff(req) {
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const token = bearerToken(req);
  if (!token || !supabaseUrl || !anonKey) {
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
}

export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    await authorizeStaff(req);
  } catch (err) {
    return res.status(err.status || 401).json({ error: err.message });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const date = String(body.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Missing or invalid date (YYYY-MM-DD)" });
  }

  try {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: "Missing Supabase server configuration" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const result = await clearAppointmentsOnDate(supabase, date);

    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("clear-day error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Could not clear day" });
  }
}
