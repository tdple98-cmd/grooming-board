import { createClient } from "@supabase/supabase-js";
import { DOG_NAME_KEY } from "../lib/mapBooking.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";
import { upsertCustomerCustomAttribute } from "../lib/square.js";

function getConfig() {
  const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();

  if (!accessToken) throw new Error("Missing SQUARE_ACCESS_TOKEN");
  if (!supabaseUrl || !anonKey) throw new Error("Missing Supabase configuration");

  return { accessToken, environment, supabaseUrl, anonKey };
}

function unauthorized() {
  const err = new Error("Sign in required");
  err.status = 401;
  return err;
}

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

async function authorizeStaff(req, { supabaseUrl, anonKey }) {
  const token = bearerToken(req);
  if (!token) throw unauthorized();

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) throw unauthorized();
}

export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    await authorizeStaff(req, config);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const customerId = (body.square_customer_id || body.customer_id || "").trim();
    const name = (body.name || "").trim();

    if (!customerId) {
      return res.status(400).json({ ok: false, error: "Missing square_customer_id" });
    }
    if (!name) {
      return res.status(400).json({ ok: false, error: "Missing pet name" });
    }

    await upsertCustomerCustomAttribute({
      environment: config.environment,
      accessToken: config.accessToken,
      customerId,
      key: DOG_NAME_KEY,
      value: name,
    });

    return res.status(200).json({ ok: true, square_customer_id: customerId, name });
  } catch (err) {
    console.error("Square pet-name write error:", err);
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "Could not save pet name to Square",
    });
  }
}
