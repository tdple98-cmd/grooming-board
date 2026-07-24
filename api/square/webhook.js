import { createClient } from "@supabase/supabase-js";
import { syncSquareToSupabase } from "../lib/syncSquareToSupabase.js";
import { melbourneDateString } from "../lib/melbourne.js";
import { loadEnvFiles } from "../lib/loadEnv.mjs";
import { baseSquareBookingId } from "../../lib/squareBookingId.js";

/**
 * Square webhook receiver: booking.created / booking.updated.
 * Trigger-only trust model — the payload just tells us WHICH booking moved;
 * the actual data is always re-fetched from Square by the day sync, so a
 * forged event can at worst cause a harmless extra sync.
 * The notification URL carries ?key=<CRON_SECRET> as shared-secret auth.
 */
export default async function handler(req, res) {
  loadEnvFiles();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cronSecret = (process.env.CRON_SECRET || "").trim();
  try {
    const url = new URL(req.url || "", "http://localhost");
    if (cronSecret && url.searchParams.get("key") !== cronSecret) {
      return res.status(401).json({ error: "Bad key" });
    }
  } catch {
    return res.status(401).json({ error: "Bad key" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  const eventType = body?.type || "";
  const booking = body?.data?.object?.booking;

  if (!eventType.startsWith("booking.") || !booking) {
    // Not a booking event (e.g. Square's test ping) — acknowledge and ignore.
    return res.status(200).json({ ok: true, ignored: true });
  }

  const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!accessToken || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, error: "Server not configured" });
  }

  const dates = new Set();
  if (booking.start_at) dates.add(melbourneDateString(booking.start_at));

  // A reschedule onto another day leaves stale rows on the old day —
  // find any dates the board currently has for this booking and re-sync those too.
  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: rows } = await supabase
      .from("appointments")
      .select("appointment_date, square_booking_id")
      .like("square_booking_id", `${booking.id}%`);
    for (const row of rows || []) {
      if (baseSquareBookingId(row.square_booking_id) === booking.id && row.appointment_date) {
        dates.add(row.appointment_date);
      }
    }
  } catch {
    /* old-date lookup is best-effort */
  }

  const synced = [];
  const errors = [];
  for (const date of dates) {
    try {
      const result = await syncSquareToSupabase({
        accessToken,
        environment,
        supabaseUrl,
        serviceRoleKey,
        startDate: date,
        days: 1,
        purge: true,
      });
      synced.push({ date, ok: result.ok, upserted: result.upserted });
    } catch (err) {
      errors.push({ date, error: err.message });
    }
  }

  // Always 200 so Square doesn't endlessly retry a partial failure —
  // the 8-15 min spot-check and twice-daily cron are the safety net.
  return res.status(200).json({ ok: errors.length === 0, event: eventType, synced, errors });
}
