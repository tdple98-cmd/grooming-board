import { createClient } from "@supabase/supabase-js";
import { requireOwner } from "../lib/ownerAuth.js";
import { computeTodayStats, computeTrends, computeDueToRebookCount, computeSquareRevenue } from "../lib/ownerStats.js";
import { fetchRosterNames } from "../lib/rosterClient.js";
import { todayMelbourneDateString } from "../lib/melbourne.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const squareAccessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: "Server not configured" });
  }

  try {
    await requireOwner(req, { supabaseUrl, anonKey });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const dateParam = typeof req.query?.date === "string" ? req.query.date : "";
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayMelbourneDateString();

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  try {
    const rosterNames = await fetchRosterNames(dateStr);
    const [today, trends, dueToRebookCount, lastDigest, squareRevenue] = await Promise.all([
      computeTodayStats(supabase, dateStr, rosterNames),
      computeTrends(supabase, dateStr),
      computeDueToRebookCount(supabase, dateStr),
      supabase
        .from("daily_digests")
        .select("date, digest_text, created_at")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then((r) => r.data || null),
      squareAccessToken
        ? computeSquareRevenue({ environment: squareEnvironment, accessToken: squareAccessToken }, dateStr)
        : { ok: false, error: "Square not configured" },
    ]);
    return res.status(200).json({ date: dateStr, today, trends, dueToRebookCount, lastDigest, squareRevenue });
  } catch (err) {
    console.error("Owner dashboard error:", err);
    return res.status(500).json({ error: "Could not load dashboard" });
  }
}
