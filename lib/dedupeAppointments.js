/** Shared dedupe logic for Square sync and board cleanup. */

import { baseSquareBookingId } from "./squareBookingId.js";

function hasNotes(row) {
  const n = row.today_notes || {};
  return Boolean(String(n.cut || "").trim() || String(n.watch || "").trim() || String(n.svc || "").trim());
}

/** Prefer rows staff have actually worked on. */
export function appointmentEditScore(row) {
  let score = 0;
  if (row.collected) score += 200;
  if (row.groom_photo_url) score += 80;
  if (row.checked_in_at) score += 60;
  if (["checkedin", "grooming", "ready"].includes(row.status)) score += 50;
  if (row.status && row.status !== "booked" && row.status !== "noshow") score += 20;
  if (hasNotes(row)) score += 40;
  if (row.groomer) score += 10;
  if (row.deposit_paid) score += 5;
  if (row.late) score += 5;
  return score;
}

function scoreRow(row, keepSquareIds) {
  let score = appointmentEditScore(row);
  if (row.square_booking_id && keepSquareIds.has(row.square_booking_id)) score += 3;
  return score;
}

/** Exact Square slot id, or owner+name+time for legacy rows. */
function groupKey(a) {
  if (a.square_booking_id) return `sq:${a.square_booking_id}`;
  const owner = a.dogs?.owner_name || "";
  const name = a.dogs?.name || "";
  return `slot:${a.appointment_date}|${owner}|${name}|${a.drop_time}`;
}

/**
 * Remove duplicate appointment rows (same Square slot or same dog slot).
 * Keeps the row staff edited; drops untouched duplicates.
 */
export async function dedupeDuplicateSlots(supabase, windowStart, windowEnd, squareBookingIds = []) {
  const keep = new Set(squareBookingIds);
  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      "id, dog_id, appointment_date, drop_time, square_booking_id, status, collected, groom_photo_url, checked_in_at, groomer, deposit_paid, late, today_notes, dogs(name, owner_name)"
    )
    .gte("appointment_date", windowStart)
    .lte("appointment_date", windowEnd);

  if (error) throw error;

  const groups = new Map();
  for (const a of appts || []) {
    const key = groupKey(a);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  let removedAppointments = 0;
  const removedDogIds = new Set();
  const removedDetails = [];

  for (const [key, rows] of groups.entries()) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => scoreRow(b, keep) - scoreRow(a, keep));
    for (const dup of rows.slice(1)) {
      await supabase.from("appointments").delete().eq("id", dup.id);
      removedAppointments++;
      removedDetails.push({
        key,
        id: dup.id,
        dog: dup.dogs?.name,
        owner: dup.dogs?.owner_name,
        drop: dup.drop_time,
        squareBookingId: dup.square_booking_id,
        editScore: appointmentEditScore(dup),
      });
      if (dup.dog_id) removedDogIds.add(dup.dog_id);
    }
  }

  let removedDogs = 0;
  for (const dogId of removedDogIds) {
    const { count } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("dog_id", dogId);
    if (count === 0) {
      await supabase.from("dogs").delete().eq("id", dogId);
      removedDogs++;
    }
  }

  return { removedAppointments, removedDogs, removedDetails, duplicateGroups: groups.size };
}

/** Pick the best row when multiple share the same square_booking_id. */
export function pickBestAppointmentRow(rows, keepSquareIds = new Set()) {
  if (!rows?.length) return null;
  if (rows.length === 1) return rows[0];
  return [...rows].sort((a, b) => scoreRow(b, keepSquareIds) - scoreRow(a, keepSquareIds))[0];
}
