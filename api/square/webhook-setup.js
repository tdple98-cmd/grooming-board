import { createClient } from "@supabase/supabase-js";
import { squareRequest } from "../lib/square.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";
import crypto from "node:crypto";

const EVENT_TYPES = ["booking.created", "booking.updated"];
const SUBSCRIPTION_NAME = "grooming-board-live-sync";

function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (!accessToken || !supabaseUrl || !anonKey) {
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  // Staff sign-in required, same gate as the sync button.
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Sign in required" });

  const base = (process.env.PUBLIC_BOARD_URL || "https://grooming-board.vercel.app").replace(/\/$/, "");
  const notificationUrl = `${base}/api/square/webhook${cronSecret ? `?key=${cronSecret}` : ""}`;

  try {
    const list = await squareRequest("/v2/webhooks/subscriptions?include_disabled=true", {
      environment,
      accessToken,
    });
    const existing = (list.subscriptions || []).find((s) => s.name === SUBSCRIPTION_NAME);

    if (existing) {
      // Keep URL + events current in case the secret or domain changed.
      const updated = await squareRequest(`/v2/webhooks/subscriptions/${existing.id}`, {
        environment,
        accessToken,
        method: "PUT",
        body: {
          subscription: {
            name: SUBSCRIPTION_NAME,
            notification_url: notificationUrl,
            event_types: EVENT_TYPES,
            enabled: true,
          },
        },
      });
      return res.status(200).json({
        ok: true,
        action: "updated",
        id: updated.subscription?.id || existing.id,
        eventTypes: EVENT_TYPES,
      });
    }

    const created = await squareRequest("/v2/webhooks/subscriptions", {
      environment,
      accessToken,
      method: "POST",
      body: {
        idempotency_key: crypto.randomUUID(),
        subscription: {
          name: SUBSCRIPTION_NAME,
          notification_url: notificationUrl,
          event_types: EVENT_TYPES,
        },
      },
    });

    return res.status(200).json({
      ok: true,
      action: "created",
      id: created.subscription?.id,
      eventTypes: EVENT_TYPES,
    });
  } catch (err) {
    console.error("Webhook setup error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
