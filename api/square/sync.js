import { createClient } from "@supabase/supabase-js";
import { syncSquareToSupabase } from "../lib/syncSquareToSupabase.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";

function getConfig() {
  const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const cronSecret = (process.env.CRON_SECRET || "").trim();

  if (!accessToken) throw new Error("Missing SQUARE_ACCESS_TOKEN");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("Missing Supabase or Square server configuration");
  }

  return { accessToken, environment, supabaseUrl, anonKey, serviceRoleKey, cronSecret };
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

async function authorizeRequest(req, { supabaseUrl, anonKey, cronSecret }) {
  const token = bearerToken(req);
  if (!token) throw unauthorized();

  if (cronSecret && token === cronSecret) {
    return { type: "cron" };
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user) throw unauthorized();

  return { type: "staff", user };
}

function squareFetchHint(message = "") {
  const m = message.toLowerCase();
  if (m.includes("onboarded")) {
    return "Confirm Square Appointments is enabled for this account, then try again.";
  }
  return "Could not load bookings from Square. Try again in a few minutes.";
}

function parseBody(req) {
  if (req.method === "GET") return {};
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
}

export default async function handler(req, res) {
  loadEnvFiles();

  const isCronGet = req.method === "GET";
  const isStaffPost = req.method === "POST";
  if (!isCronGet && !isStaffPost) {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = getConfig();
    const auth = await authorizeRequest(req, config);

    if (isCronGet && auth.type !== "cron") {
      throw unauthorized();
    }

    const body = parseBody(req);
    const syncOpts = {
      accessToken: config.accessToken,
      environment: config.environment,
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      locationId: body.location_id,
      purge: body.purge !== false,
    };

    if (body.date != null || body.days != null) {
      syncOpts.startDate = body.date;
      syncOpts.days = body.days ?? 1;
    }

    const result = await syncSquareToSupabase(syncOpts);

    if (!result.ok) {
      return res.status(500).json({
        ok: false,
        error: result.squareFetchError || "Square sync failed",
        hint: squareFetchHint(result.squareFetchError || ""),
        environment: config.environment,
      });
    }

    const warnings = [];
    if (result.bookingsFound === 0) {
      warnings.push(
        `No bookings found in Square for the next ${result.syncDates?.length || 7} days. Check Square Appointments or your sync window.`
      );
    }
    if (result.bookingsFound > 0 && result.customersWithPetAttrs === 0) {
      warnings.push(
        `Found ${result.bookingsFound} booking(s) but no pet custom attributes from Square. If testing locally, set SQUARE_ENVIRONMENT=production with the live token — sandbox customers have no dog_name fields.`
      );
    }
    if (result.skipped > 0) {
      warnings.push(`${result.skipped} booking(s) could not be saved.`);
    }
    if (result.errors?.length) {
      const detail = result.errors.slice(0, 2).map((e) => e.message).join(" ");
      if (detail) warnings.push(detail);
    }

    return res.status(200).json({
      ok: true,
      upserted: result.upserted,
      bookingsFound: result.bookingsFound,
      skipped: result.skipped,
      windowDays: result.syncDates?.length,
      warnings,
      environment: config.environment,
      customersWithPetAttrs: result.customersWithPetAttrs,
    });
  } catch (err) {
    console.error("Square sync error:", err);
    const status = err.status || 500;
    const msg = err.message || "Square sync failed";
    const hint =
      status === 401
        ? undefined
        : msg.toLowerCase().includes("onboarded")
          ? squareFetchHint(msg)
          : status >= 500
            ? "Try again in a few minutes."
            : undefined;
    return res.status(status).json({ ok: false, error: msg, hint });
  }
}
