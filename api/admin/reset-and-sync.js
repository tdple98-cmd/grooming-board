import { loadEnvFiles } from "../lib/loadEnv.mjs";
import { resetBoardAndSync } from "../lib/resetBoardData.js";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

function parseBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}

/** Temporary admin route — CRON_SECRET only. Remove before final delivery. */
export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const cronSecret = (process.env.CRON_SECRET || "").trim();
  const token = bearerToken(req);
  if (!cronSecret || token !== cronSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = parseBody(req);
  const dryRun = body.dry_run === true;

  if (!dryRun && body.confirm !== "RESET") {
    return res.status(400).json({
      error: 'Send { "confirm": "RESET" } to wipe Supabase board data and sync Square. Or { "dry_run": true } to preview counts.',
    });
  }

  try {
    const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
    const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
    const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
    const environment = process.env.SQUARE_ENVIRONMENT || "production";

    if (!supabaseUrl || !serviceRoleKey || !accessToken) {
      return res.status(500).json({ error: "Missing Supabase or Square server configuration" });
    }

    const summary = await resetBoardAndSync({
      supabaseUrl,
      serviceRoleKey,
      accessToken,
      environment,
      dryRun,
      syncAfterWipe: body.sync !== false,
      syncDaysBack: Math.max(90, parseInt(process.env.SYNC_DAYS_BACK || "90", 10)),
      syncDaysForward: Math.max(7, parseInt(process.env.SYNC_DAYS_FORWARD || "7", 10)),
    });

    return res.status(200).json(summary);
  } catch (err) {
    console.error("reset-and-sync error:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || "Reset failed",
      detail: err.result || undefined,
    });
  }
}
