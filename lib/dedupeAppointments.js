/** Shared dedupe logic for Square sync and one-off cleanup. */

function scoreRow(row, keepSquareIds) {
  if (row.square_booking_id && keepSquareIds.has(row.square_booking_id)) return 3;
  if (["checkedin", "grooming", "ready"].includes(row.status) || row.collected) return 2;
  if (row.square_booking_id) return 1;
  return 0;
}

/**
 * Remove duplicate appointment rows (same Square booking or same dog slot).
 * Keeps the highest-scored row per group.
 */
export async function dedupeDuplicateSlots(supabase, windowStart, windowEnd, squareBookingIds = []) {
  const keep = new Set(squareBookingIds);
  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, dog_id, appointment_date, drop_time, square_booking_id, status, collected, dogs(name, owner_name)")
    .gte("appointment_date", windowStart)
    .lte("appointment_date", windowEnd);

  if (error) throw error;

  const groups = new Map();
  for (const a of appts || []) {
    const owner = a.dogs?.owner_name || "";
    const name = a.dogs?.name || "";
    const key = a.square_booking_id
      ? `sq:${a.square_booking_id}`
      : `${a.appointment_date}|${owner}|${name}|${a.drop_time}`;
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
