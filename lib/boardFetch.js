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

const PHOTO_HISTORY_CAP = 12;

function isStoragePhotoPath(value) {
  return Boolean(value && value !== "pending" && !value.startsWith("http"));
}

/**
 * All known groom photos per dog: past appointments' groom_photo_url merged
 * with visits.photo_url (covers rows whose appointment was later removed).
 * Returns { [dogId]: [{ date, path }] } newest first, deduped by path.
 */
export async function fetchPhotoHistoryByDog(dogIds) {
  const historyByDog = {};
  if (!dogIds.length) return historyByDog;

  const [apptRes, visitRes] = await Promise.all([
    supabase
      .from("appointments")
      .select("dog_id, appointment_date, groom_photo_url")
      .in("dog_id", dogIds)
      .not("groom_photo_url", "is", null)
      .order("appointment_date", { ascending: false }),
    supabase
      .from("visits")
      .select("dog_id, visit_date, photo_url")
      .in("dog_id", dogIds)
      .not("photo_url", "is", null)
      .order("visit_date", { ascending: false }),
  ]);
  if (apptRes.error) throw apptRes.error;
  if (visitRes.error) throw visitRes.error;

  const entries = [
    ...(apptRes.data || []).map((r) => ({ dogId: r.dog_id, date: r.appointment_date, path: r.groom_photo_url })),
    ...(visitRes.data || []).map((r) => ({ dogId: r.dog_id, date: r.visit_date, path: r.photo_url })),
  ].filter((e) => isStoragePhotoPath(e.path));

  entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));

  const seen = new Set();
  for (const e of entries) {
    const key = `${e.dogId}|${e.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = historyByDog[e.dogId] || (historyByDog[e.dogId] = []);
    if (list.length < PHOTO_HISTORY_CAP) list.push({ date: e.date, path: e.path });
  }
  return historyByDog;
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
export function mapRowsToBoardDogs(rows, visitByDog, photoUrls = {}, thumbUrls = {}, historyByDog = {}) {
  return rows.map((a) =>
    rowToBoardDog(a, visitByDog[a.dog_id], photoUrls, thumbUrls, historyByDog[a.dog_id] || [])
  );
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
