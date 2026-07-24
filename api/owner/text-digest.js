import { createClient } from "@supabase/supabase-js";
import { requireOwner } from "../lib/ownerAuth.js";
import { buildAndDeliverDigest } from "../lib/ownerDigest.js";
import { todayMelbourneDateString } from "../lib/melbourne.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

/** Owner-gated "Text me this now" button — same digest the nightly cron sends. */
export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    await requireOwner(req, { supabaseUrl, anonKey });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : todayMelbourneDateString();

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  try {
    const result = await buildAndDeliverDigest(supabase, dateStr, { sendSms: true });
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error("Manual digest send failed:", err);
    return res.status(500).json({ error: "Could not send digest" });
  }
}
