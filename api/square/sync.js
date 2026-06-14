import { createClient } from "@supabase/supabase-js";
import { syncSquareToSupabase } from "../lib/syncSquareToSupabase.js";
import { todayMelbourneDateString } from "../lib/melbourne.js";

function getConfig() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!accessToken) throw new Error("Missing SQUARE_ACCESS_TOKEN");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return { accessToken, environment, supabaseUrl, serviceRoleKey };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, environment, supabaseUrl, serviceRoleKey } = getConfig();
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    const result = await syncSquareToSupabase({
      accessToken,
      environment,
      supabaseUrl,
      serviceRoleKey,
      startDate: body.date || todayMelbourneDateString(),
      days: body.days || 1,
      locationId: body.location_id,
      purge: body.purge !== false,
    });

    if (!result.ok) {
      return res.status(500).json({
        ...result,
        error: result.squareFetchError,
        hint: "Enable Appointments on the sandbox seller, seed bookings, then sync again.",
      });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error("Square sync error:", err);
    const msg = err.message || "Square sync failed";
    const hint = msg.toLowerCase().includes("onboarded")
      ? "Enable Appointments on the sandbox seller, seed bookings via npm run seed:square, then sync again."
      : undefined;
    return res.status(500).json({ ok: false, error: msg, hint });
  }
}
