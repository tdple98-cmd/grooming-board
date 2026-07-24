import { createClient } from "@supabase/supabase-js";
import { dedupeDuplicateSlots } from "../../lib/dedupeAppointments.js";
import { todayMelbourneDateString } from "../lib/melbourne.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays, 12)).toISOString().slice(0, 10);
}

/**
 * Collapse exact-duplicate appointment rows (same square_booking_id, or same dog/date/time slot)
 * across the full backfilled range. Reads only Supabase — no Square API calls, so it's safe to
 * run any time and doesn't touch rate limits. Staff-authed, same gate as the sync button.
 */
export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server not configured" });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Sign in required" });

  const today = todayMelbourneDateString();
  const start = shiftDate(today, -370);
  const end = shiftDate(today, 60);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  try {
    const result = await dedupeDuplicateSlots(supabase, start, end, []);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Dedupe error:", err);
    return res.status(500).json({ ok: false, error: err.message || "Dedupe failed" });
  }
}
