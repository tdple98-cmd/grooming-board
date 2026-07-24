import { createClient } from "@supabase/supabase-js";
import { buildAndDeliverDigest } from "../lib/ownerDigest.js";
import { todayMelbourneDateString } from "../lib/melbourne.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

/** Vercel Cron only — same CRON_SECRET convention as api/square/sync.js. */
export default async function handler(req, res) {
  loadEnvFiles();

  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const token = bearerToken(req);
  if (!cronSecret || token !== cronSecret) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: "Server not configured" });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const dateStr = todayMelbourneDateString();
  try {
    const result = await buildAndDeliverDigest(supabase, dateStr, { sendSms: true });
    return res.status(200).json({ ok: true, smsSent: result.smsSent });
  } catch (err) {
    console.error("Nightly digest failed:", err);
    return res.status(500).json({ ok: false, error: "Digest failed" });
  }
}
