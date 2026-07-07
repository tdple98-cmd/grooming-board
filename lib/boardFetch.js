import { supabase } from "./supabase.js";
import { rowToBoardDog } from "./boardData.js";
import { baseSquareBookingId, petSlotLetter } from "./squareBookingId.js";

/** Load latest visit per dog (most recent visit_date first). */
export async function fetchLatestVisitsByDog(dogIds) {
  const visitByDog = {};
  if (!dogIds.length) return visitByDog;

  const { data: visits, error } = await supabase
    .from("visits")
    .select("*")
    .in("dog_id", dogIds)
    .order("visit_date", { ascending: false });

  if (error) throw error;
  for (const v of visits || []) {
    if (!visitByDog[v.dog_id]) visitByDog[v.dog_id] = v;
  }
  return visitByDog;
}

/** Today's appointments joined with dogs, ordered by band. */
export async function fetchTodayAppointments(date) {
  const { data: appointments, error } = await supabase
    .from("appointments")
    .select("*, dogs(*)")
    .eq("appointment_date", date)
    .order("band", { ascending: true });

  if (error) throw error;

  const rows = (appointments || []).filter(
    (a) => String(a.appointment_date).slice(0, 10) === date
  );
  return rows;
}

/** Fetch specific appointment rows (with dogs) by id. */
export async function fetchAppointmentsByIds(ids) {
  const uniq = [...new Set((ids || []).filter(Boolean))];
  if (!uniq.length) return [];

  const { data, error } = await supabase
    .from("appointments")
    .select("*, dogs(*)")
    .in("id", uniq);

  if (error) throw error;
  return data || [];
}

/** Map DB rows to board dogs. */
export function mapRowsToBoardDogs(rows, visitByDog, photoUrls = {}, thumbUrls = {}) {
  return rows.map((a) => rowToBoardDog(a, visitByDog[a.dog_id], photoUrls, thumbUrls));
}

/** Client-side dedupe: exact Square slot id, or same dog+time. */
export function dedupeBoardDogs(rows) {
  const seen = new Map();
  const out = [];
  for (const row of rows) {
    const key = row.squareBookingId
      ? `sq:${row.squareBookingId}`
      : `${row.dogId}|${row.dropTime}|${row.dog}`;
    if (seen.has(key)) continue;
    seen.set(key, true);
    out.push(row);
  }
  return out;
}

/** Mark cards that share one Square booking (A / B / C). */
export function annotateLinkedBookings(rows) {
  const byBase = new Map();
  for (const row of rows) {
    const base = baseSquareBookingId(row.squareBookingId);
    if (!base) continue;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base).push(row);
  }

  return rows.map((row) => {
    const base = baseSquareBookingId(row.squareBookingId);
    const group = base ? byBase.get(base) : null;
    if (!group || group.length <= 1) {
      return { ...row, linkedBookingLetter: null, linkedBookingCount: 0 };
    }
    return {
      ...row,
      linkedBookingBaseId: base,
      linkedBookingLetter: petSlotLetter(row.squareBookingId),
      linkedBookingCount: group.length,
    };
  });
}
