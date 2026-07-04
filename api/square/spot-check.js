import { createClient } from "@supabase/supabase-js";
import { spotCheckTodayBoard } from "../lib/squareSpotCheck.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

function getConfig() {
  const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!accessToken || !supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("Missing server configuration");
  }
  return { accessToken, environment, supabaseUrl, anonKey, serviceRoleKey };
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

async function authorizeStaff(req, { supabaseUrl, anonKey }) {
  const token = bearerToken(req);
  if (!token) {
    const err = new Error("Sign in required");
    err.status = 401;
    throw err;
  }
  const authClient = createClient(supabaseUrl, anonKey);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);
  if (error || !user) {
    const err = new Error("Sign in required");
    err.status = 401;
    throw err;
  }
}

export default async function handler(req, res) {
  loadEnvFiles();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    await authorizeStaff(req, config);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await spotCheckTodayBoard({
      accessToken: config.accessToken,
      environment: config.environment,
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      date: body.date,
    });

    if (!result.ok) {
      return res.status(500).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || "Spot check failed" });
  }
}
