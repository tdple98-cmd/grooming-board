import { createClient } from "@supabase/supabase-js";
import {
  batchListCustomerCustomAttributes,
  batchRetrieveCatalog,
  batchRetrieveCustomers,
  listBookingsInRange,
  listLocations,
  searchTeamMembers,
} from "./square.js";
import { isGenericPetName, mapSquareBookingToRows } from "./mapBooking.js";
import { melbourneDayBounds, melbourneDateString, todayMelbourneDateString } from "./melbourne.js";

function shiftMelbourneDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12);
  return melbourneDateString(new Date(utc).toISOString());
}

/** Default sync window: today + upcoming days (Melbourne). Past rows in Supabase are kept. */
export function getDefaultSyncWindow() {
  const totalDays = Math.max(1, parseInt(process.env.SQUARE_SYNC_DAYS || "7", 10));
  const back = Math.max(0, parseInt(process.env.SQUARE_SYNC_DAYS_BACK || "0", 10));
  const forward = Math.max(0, parseInt(process.env.SQUARE_SYNC_DAYS_FORWARD || String(totalDays - 1), 10));
  const today = todayMelbourneDateString();
  const startDate = shiftMelbourneDateString(today, -back);
  const days = back + forward + 1;
  const windowEnd = shiftMelbourneDateString(startDate, days - 1);
  return { startDate, days, windowEnd, today, back, forward };
}

/** History backfill: past N days through upcoming week (for due-to-rebook data). */
export function getHistorySyncWindow() {
  const forward = Math.max(0, parseInt(process.env.SQUARE_SYNC_DAYS_FORWARD || "6", 10));
  const back = Math.max(1, parseInt(process.env.SQUARE_SYNC_DAYS_BACK || "90", 10));
  const today = todayMelbourneDateString();
  const startDate = shiftMelbourneDateString(today, -back);
  const days = back + forward + 1;
  const windowEnd = shiftMelbourneDateString(startDate, days - 1);
  return { startDate, days, windowEnd, today, back, forward, mode: "history" };
}

export function melbourneRangeBounds(startDateStr, dayCount) {
  const first = melbourneDayBounds(startDateStr);
  const lastDay = shiftMelbourneDateString(startDateStr, Math.max(0, dayCount - 1));
  const last = melbourneDayBounds(lastDay);
  return { startAtMin: first.startAtMin, startAtMax: last.startAtMax, dates: [] };
}

export function dateRangeFromStart(startDateStr, dayCount) {
  const dates = [];
  for (let i = 0; i < dayCount; i++) {
    dates.push(shiftMelbourneDateString(startDateStr, i));
  }
  return dates;
}

/** Square allows at most 31 days between start_at_min and start_at_max (wall-clock, not calendar). */
const SQUARE_MAX_RANGE_DAYS = 30;

/** Split a multi-day window into chunks Square accepts (max 30 Melbourne calendar days each). */
export function melbourneRangeChunks(startDateStr, dayCount) {
  const chunks = [];
  for (let offset = 0; offset < dayCount; offset += SQUARE_MAX_RANGE_DAYS) {
    const days = Math.min(SQUARE_MAX_RANGE_DAYS, dayCount - offset);
    const chunkStart = shiftMelbourneDateString(startDateStr, offset);
    const { startAtMin, startAtMax } = melbourneRangeBounds(chunkStart, days);
    chunks.push({ startAtMin, startAtMax, startDate: chunkStart, days });
  }
  return chunks;
}

async function listAllBookingsInWindow({ environment, accessToken, startDate, days, locationId }) {
  const chunks = melbourneRangeChunks(startDate, days);
  const byId = new Map();

  for (const chunk of chunks) {
    const batch = await listBookingsInRange({
      environment,
      accessToken,
      startAtMin: chunk.startAtMin,
      startAtMax: chunk.startAtMax,
      locationId,
    });
    for (const booking of batch) {
      byId.set(booking.id, booking);
    }
  }

  return [...byId.values()];
}

async function purgeStaleSquareInWindow(supabase, squareBookingIds, windowStart, windowEnd) {
  const keep = new Set(squareBookingIds);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, dog_id, square_booking_id, appointment_date")
    .gte("appointment_date", windowStart)
    .lte("appointment_date", windowEnd);

  if (error) throw error;

  // Only remove Square-linked rows inside the sync window that Square no longer returned.
  // Past days and dates outside the window are never deleted.
  const toRemove = (appts || []).filter(
    (a) => a.square_booking_id && !keep.has(a.square_booking_id)
  );

  if (!toRemove.length) return { removedAppointments: 0, removedDogs: 0 };

  const removedIds = toRemove.map((a) => a.id);
  const { error: delErr } = await supabase.from("appointments").delete().in("id", removedIds);
  if (delErr) throw delErr;

  const dogIds = [...new Set(toRemove.map((a) => a.dog_id).filter(Boolean))];
  let removedDogs = 0;
  for (const dogId of dogIds) {
    const { count } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .eq("dog_id", dogId);
    if (count === 0) {
      await supabase.from("dogs").delete().eq("id", dogId);
      removedDogs++;
    }
  }

  return { removedAppointments: toRemove.length, removedDogs };
}

const OPTIONAL_DOG_COLUMNS = ["name_locked", "square_customer_id"];

function isMissingColumnError(err) {
  const msg = err?.message || "";
  return OPTIONAL_DOG_COLUMNS.some((col) => msg.includes(col));
}

function baseDogRow(dogPayload) {
  return {
    name: dogPayload.name,
    owner_name: dogPayload.owner_name,
    phone: dogPayload.phone ?? null,
    avatar: dogPayload.avatar ?? "🐕",
    bg_color: dogPayload.bg_color ?? null,
    weight: dogPayload.weight || null,
    specs: dogPayload.specs ?? undefined,
  };
}

function fullDogRow(dogPayload) {
  const row = baseDogRow(dogPayload);
  if (dogPayload.square_customer_id) row.square_customer_id = dogPayload.square_customer_id;
  return row;
}

async function readDogNameLocked(supabase, dogId) {
  const { data, error } = await supabase
    .from("dogs")
    .select("name_locked")
    .eq("id", dogId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error)) return false;
    throw error;
  }
  return Boolean(data?.name_locked);
}

async function insertDogRow(supabase, dogPayload) {
  let { data, error } = await supabase.from("dogs").insert(fullDogRow(dogPayload)).select("id").single();
  if (error && isMissingColumnError(error)) {
    ({ data, error } = await supabase.from("dogs").insert(baseDogRow(dogPayload)).select("id").single());
  }
  if (error) throw error;
  return data.id;
}

async function updateDogRow(supabase, dogId, dogPayload, { preserveName = false } = {}) {
  const update = {
    phone: dogPayload.phone,
    avatar: dogPayload.avatar,
    bg_color: dogPayload.bg_color,
  };
  if (!preserveName) update.name = dogPayload.name;
  if (dogPayload.weight) update.weight = dogPayload.weight;
  if (dogPayload.specs) update.specs = dogPayload.specs;
  if (dogPayload.square_customer_id) update.square_customer_id = dogPayload.square_customer_id;

  let { error } = await supabase.from("dogs").update(update).eq("id", dogId);
  if (error && isMissingColumnError(error)) {
    delete update.square_customer_id;
    ({ error } = await supabase.from("dogs").update(update).eq("id", dogId));
  }
  if (error) throw error;
}

async function findOrCreateDog(supabase, dogPayload, { squareBookingId }) {
  const { data: existingAppt, error: apptLookupErr } = await supabase
    .from("appointments")
    .select("dog_id")
    .eq("square_booking_id", squareBookingId)
    .maybeSingle();
  if (apptLookupErr) throw apptLookupErr;

  if (existingAppt?.dog_id) {
    const locked = await readDogNameLocked(supabase, existingAppt.dog_id);
    await updateDogRow(supabase, existingAppt.dog_id, dogPayload, { preserveName: locked });
    return existingAppt.dog_id;
  }

  if (!isGenericPetName(dogPayload.name)) {
    const { data: matches, error } = await supabase
      .from("dogs")
      .select("id")
      .eq("owner_name", dogPayload.owner_name)
      .eq("name", dogPayload.name)
      .limit(1);
    if (error) throw error;
    if (matches?.length) {
      const dogId = matches[0].id;
      const locked = await readDogNameLocked(supabase, dogId);
      await updateDogRow(supabase, dogId, dogPayload, { preserveName: locked });
      return dogId;
    }
  }

  return insertDogRow(supabase, dogPayload);
}

async function findExistingAppointment(supabase, { squareBookingId, dogId, appointmentDate, dropTime }) {
  const { data: bySquare, error: sqErr } = await supabase
    .from("appointments")
    .select("id, dog_id, status, collected, square_booking_id")
    .eq("square_booking_id", squareBookingId)
    .maybeSingle();
  if (sqErr) throw sqErr;
  if (bySquare) return bySquare;

  const { data: bySlot, error: slotErr } = await supabase
    .from("appointments")
    .select("id, dog_id, status, collected, square_booking_id")
    .eq("dog_id", dogId)
    .eq("appointment_date", appointmentDate)
    .eq("drop_time", dropTime)
    .maybeSingle();
  if (slotErr) throw slotErr;
  return bySlot;
}

/** Remove duplicate rows for the same dog + date + drop time (keeps Square-backed row). */
async function dedupeDuplicateSlots(supabase, windowStart, windowEnd, squareBookingIds) {
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

  const score = (row) => {
    if (row.square_booking_id && keep.has(row.square_booking_id)) return 3;
    if (["checkedin", "grooming", "ready"].includes(row.status) || row.collected) return 2;
    if (row.square_booking_id) return 1;
    return 0;
  };

  let removedAppointments = 0;
  const removedDogIds = new Set();
  for (const rows of groups.values()) {
    if (rows.length <= 1) continue;
    rows.sort((a, b) => score(b) - score(a));
    for (const dup of rows.slice(1)) {
      await supabase.from("appointments").delete().eq("id", dup.id);
      removedAppointments++;
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

  return { removedAppointments, removedDogs };
}

export async function syncSquareToSupabase({
  accessToken,
  environment,
  supabaseUrl,
  serviceRoleKey,
  startDate,
  days,
  locationId,
  purge = true,
  syncMode,
}) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const window =
    startDate != null || days != null
      ? {
          startDate: startDate || todayMelbourneDateString(),
          days: days ?? 1,
        }
      : syncMode === "history"
        ? getHistorySyncWindow()
        : getDefaultSyncWindow();
  const date = window.startDate;
  const dayCount = window.days;
  const syncDates = dateRangeFromStart(date, dayCount);

  const locations = await listLocations({ environment, accessToken });
  const resolvedLocationId = locationId || locations[0]?.id;

  let bookings = [];
  let fetchError = null;
  try {
    bookings = await listAllBookingsInWindow({
      environment,
      accessToken,
      startDate: date,
      days: dayCount,
      locationId: resolvedLocationId,
    });
  } catch (err) {
    fetchError = err;
    bookings = [];
  }

  bookings = bookings.filter((b) => b.status === "ACCEPTED" || b.status === "PENDING");

  const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean))];
  const customersById = await batchRetrieveCustomers({ environment, accessToken, customerIds });

  const variationIds = [
    ...new Set(
      bookings.flatMap((b) =>
        (b.appointment_segments || []).map((s) => s.service_variation_id).filter(Boolean)
      )
    ),
  ];
  const catalogById = await batchRetrieveCatalog({ environment, accessToken, objectIds: variationIds });

  const teamIds = [
    ...new Set(
      bookings.flatMap((b) =>
        (b.appointment_segments || []).map((s) => s.team_member_id).filter(Boolean)
      )
    ),
  ];
  const teamById = await searchTeamMembers({ environment, accessToken, teamMemberIds: teamIds });
  const customerCustomAttrsById = await batchListCustomerCustomAttributes({
    environment,
    accessToken,
    customerIds,
  });

  const bookingsByDate = {};
  for (const booking of bookings) {
    const d = melbourneDateString(booking.start_at);
    if (!bookingsByDate[d]) bookingsByDate[d] = [];
    bookingsByDate[d].push(booking);
  }

  const activeDates = Object.keys(bookingsByDate).sort();
  for (const d of activeDates) {
    bookingsByDate[d].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }

  let upserted = 0;
  let skipped = 0;
  const errors = [];
  const squareBookingIds = [...new Set(
    bookings.flatMap((booking) => {
      const customer = customersById[booking.customer_id];
      const customerCustomAttributes = customerCustomAttrsById[booking.customer_id] || [];
      const rows = mapSquareBookingToRows(booking, {
        customer,
        catalogById,
        teamById,
        customerCustomAttributes,
      });
      return [booking.id, ...rows.map((r) => r.appointment.square_booking_id).filter(Boolean)];
    })
  )];

  for (const d of activeDates) {
    const dayBookings = bookingsByDate[d] || [];
    let dayBand = 0;
    for (const booking of dayBookings) {
      try {
        const customer = customersById[booking.customer_id];
        const customerCustomAttributes = customerCustomAttrsById[booking.customer_id] || [];
        const mappedRows = mapSquareBookingToRows(booking, {
          customer,
          catalogById,
          teamById,
          customerCustomAttributes,
        });

        for (const mapped of mappedRows) {
          dayBand++;
          const squareBookingId = mapped.appointment.square_booking_id;
          const dogId = await findOrCreateDog(supabase, mapped.dog, { squareBookingId });

          const existingAppt = await findExistingAppointment(supabase, {
            squareBookingId,
            dogId,
            appointmentDate: mapped.appointment.appointment_date,
            dropTime: mapped.appointment.drop_time,
          });

          const apptPayload = {
            ...mapped.appointment,
            dog_id: dogId,
            band: dayBand,
            square_booking_id: squareBookingId,
          };

          if (existingAppt) {
            const preserveStatus =
              existingAppt.collected || ["checkedin", "grooming", "ready"].includes(existingAppt.status);
            if (preserveStatus) delete apptPayload.status;
            const { error: updErr } = await supabase
              .from("appointments")
              .update(apptPayload)
              .eq("id", existingAppt.id);
            if (updErr) throw updErr;
          } else {
            const { error: insErr } = await supabase.from("appointments").insert(apptPayload);
            if (insErr) throw insErr;
          }

          upserted++;
        }
      } catch (e) {
        errors.push({ bookingId: booking.id, message: e.message });
        skipped++;
      }
    }
  }

  let purgeResult = { removedAppointments: 0, removedDogs: 0, deduped: { removedAppointments: 0, removedDogs: 0 } };
  const windowEnd = syncDates[syncDates.length - 1];
  if (purge) {
    purgeResult = await purgeStaleSquareInWindow(
      supabase,
      squareBookingIds,
      syncDates[0],
      windowEnd
    );
    purgeResult.deduped = await dedupeDuplicateSlots(
      supabase,
      syncDates[0],
      windowEnd,
      squareBookingIds
    );
    purgeResult.removedAppointments += purgeResult.deduped.removedAppointments;
    purgeResult.removedDogs += purgeResult.deduped.removedDogs;
  }

  if (fetchError) {
    return {
      ok: false,
      squareFetchError: fetchError.message,
      timezone: "Australia/Melbourne",
      syncDates,
      locationId: resolvedLocationId || null,
      bookingsFound: 0,
      upserted,
      skipped,
      errors,
      purge: purgeResult,
    };
  }

  return {
    ok: true,
    timezone: "Australia/Melbourne",
    syncDates,
    locationId: resolvedLocationId || null,
    bookingsFound: bookings.length,
    upserted,
    skipped,
    errors,
    purge: purgeResult,
  };
}
