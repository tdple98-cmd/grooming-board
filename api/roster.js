import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnv.mjs";

/**
 * Staff-authed proxy to the reply-engine's roster-by-name (the same roster the owner sets each
 * night at 8pm on the reply-engine dashboard). Keeps the board same-origin for the browser and the
 * reply-engine's shared secret server-side only — never sent to the client.
 */
function bearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return "";
  return header.slice(7).trim();
}

export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const anonKey = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();
  const replyEngineUrl = (process.env.REPLY_ENGINE_URL || "").trim();
  const boardApiSecret = (process.env.BOARD_API_SECRET || "").trim();
  if (!supabaseUrl || !anonKey) return res.status(500).json({ error: "Server not configured" });
  if (!replyEngineUrl || !boardApiSecret) {
    return res.status(500).json({ error: "Roster integration not configured" });
  }

  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Sign in required" });

  const dateParam = typeof req.query?.date === "string" ? req.query.date : "";
  const qs = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? `?date=${dateParam}` : "";

  try {
    const upstream = await fetch(`${replyEngineUrl.replace(/\/$/, "")}/api/board/roster${qs}`, {
      headers: { "X-Board-Secret": boardApiSecret },
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data) {
      return res.status(502).json({ error: "Could not load roster" });
    }
    return res.status(200).json(data);
  } catch (err) {
    console.error("Roster proxy error:", err);
    return res.status(502).json({ error: "Could not load roster" });
  }
}
