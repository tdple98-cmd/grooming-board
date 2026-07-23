import { createClient } from "@supabase/supabase-js";
import {
  batchListCustomerCustomAttributes,
  batchRetrieveCatalog,
  batchRetrieveCustomers,
  listBookingsInRange,
  listLocations,
  listTeamMemberIds,
  searchTeamMembers,
} from "./square.js";
import { isGenericPetName, mapSquareBookingToRows, assignPetNamesForDayBookings } from "./mapBooking.js";
import { melbourneDayBounds, melbourneDateString, todayMelbourneDateString } from "./melbourne.js";
import { dedupeDuplicateSlots, pickBestAppointmentRow } from "../../lib/dedupeAppointments.js";
import { baseSquareBookingId, isKeptSquareBookingId } from "../../lib/squareBookingId.js";

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

export async function listAllBookingsInWindow({ environment, accessToken, startDate, days, locationId }) {
  const chunks = melbourneRangeChunks(startDate, days);
  const byId = new Map();

  const addBatch = (batch) => {
    for (const booking of batch) {
      byId.set(booking.id, booking);
    }
  };

  let teamMemberIds = [];
  try {
    teamMemberIds = await listTeamMemberIds({ environment, accessToken });
  } catch {
    teamMemberIds = [];
  }

  for (const chunk of chunks) {
    const baseArgs = {
      environment,
      accessToken,
      startAtMin: chunk.startAtMin,
      startAtMax: chunk.startAtMax,
    };

    addBatch(await listBookingsInRange(baseArgs));
    if (locationId) {
      addBatch(await listBookingsInRange({ ...baseArgs, locationId }));
    }
    for (const teamMemberId of teamMemberIds) {
      addBatch(
        await listBookingsInRange({
          ...baseArgs,
          locationId: locationId || undefined,
          teamMemberId,
        })
      );
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
    (a) => a.square_booking_id && !isKeptSquareBookingId(a.square_booking_id, keep)
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

/**
 * Two same-day cards sharing one dog row are two different physical dogs
 * (legacy duplicate-name corruption) — give this booking its own dog row.
 */
async function splitSharedDogRow(supabase, { apptId, dogId, dogPayload, squareBookingId, appointmentDate }) {
  if (!apptId || !appointmentDate || !dogPayload.name) return null;

  const { data: dogRow, error: dogErr } = await supabase
    .from("dogs")
    .select("name")
    .eq("id", dogId)
    .maybeSingle();
  if (dogErr || !dogRow) return null;
  if ((dogRow.name || "").trim().toLowerCase() === dogPayload.name.trim().toLowerCase()) return null;

  const { data: siblings, error: sibErr } = await supabase
    .from("appointments")
    .select("id, square_booking_id")
    .eq("dog_id", dogId)
    .eq("appointment_date", appointmentDate)
    .neq("id", apptId);
  if (sibErr) return null;

  const base = baseSquareBookingId(squareBookingId);
  const shared = (siblings || []).some((s) => baseSquareBookingId(s.square_booking_id) !== base);
  if (!shared) return null;

  const newDogId = await insertDogRow(supabase, dogPayload);
  const { error: relinkErr } = await supabase
    .from("appointments")
    .update({ dog_id: newDogId })
    .eq("id", apptId);
  if (relinkErr) throw relinkErr;
  return newDogId;
}

async function findOrCreateDog(supabase, dogPayload, { squareBookingId, appointmentDate }) {
  const { data: existingAppt, error: apptLookupErr } = await supabase
    .from("appointments")
    .select("id, dog_id")
    .eq("square_booking_id", squareBookingId)
    .maybeSingle();
  if (apptLookupErr) throw apptLookupErr;

  if (existingAppt?.dog_id) {
    const locked = await readDogNameLocked(supabase, existingAppt.dog_id);
    if (!locked) {
      const relinked = await splitSharedDogRow(supabase, {
        apptId: existingAppt.id,
        dogId: existingAppt.dog_id,
        dogPayload,
        squareBookingId,
        appointmentDate,
      });
      if (relinked) return relinked;
    }
    await updateDogRow(supabase, existingAppt.dog_id, dogPayload, { preserveName: locked });
    return existingAppt.dog_id;
  }

  if (dogPayload.square_customer_id && !isGenericPetName(dogPayload.name)) {
    const { data: byCustomer, error: custErr } = await supabase
      .from("dogs")
      .select("id")
      .eq("square_customer_id", dogPayload.square_customer_id)
      .eq("name", dogPayload.name)
      .limit(1);
    if (custErr && !isMissingColumnError(custErr)) throw custErr;
    if (byCustomer?.length) {
      const dogId = byCustomer[0].id;
      const locked = await readDogNameLocked(supabase, dogId);
      await updateDogRow(supabase, dogId, dogPayload, { preserveName: locked });
      return dogId;
    }
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

async function findExistingAppointment(
  supabase,
  { squareBookingId, dogId, appointmentDate, dropTime },
  keepSquareIds = new Set()
) {
  if (squareBookingId) {
    const { data: exactRows, error: sqErr } = await supabase
      .from("appointments")
      .select(
        "id, dog_id, status, collected, square_booking_id, groom_photo_url, checked_in_at, groomer, deposit_paid, late, today_notes"
      )
      .eq("square_booking_id", squareBookingId);
    if (sqErr) throw sqErr;
    const best = pickBestAppointmentRow(exactRows, keepSquareIds);
    if (best) return best;
    return null;
  }

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
  const squareBookingIds = [];

  for (const d of activeDates) {
    const dayBookings = bookingsByDate[d] || [];
    const siblingCountByCustomer = new Map();
    for (const booking of dayBookings) {
      const cid = booking.customer_id || booking.id;
      siblingCountByCustomer.set(cid, (siblingCountByCustomer.get(cid) || 0) + 1);
    }

    const petNamesByBookingId = assignPetNamesForDayBookings(
      dayBookings,
      customersById,
      customerCustomAttrsById
    );
    let dayBand = 0;
    const keepIds = new Set();

    for (const booking of dayBookings) {
      try {
        const customer = customersById[booking.customer_id];
        const customerCustomAttributes = customerCustomAttrsById[booking.customer_id] || [];
        const siblingBookingCount = siblingCountByCustomer.get(booking.customer_id || booking.id) || 1;
        const mappedRows = mapSquareBookingToRows(booking, {
          customer,
          catalogById,
          teamById,
          customerCustomAttributes,
          petNameOverride: petNamesByBookingId.get(booking.id),
          siblingBookingCount,
        });

        for (const mapped of mappedRows) {
          keepIds.add(mapped.appointment.square_booking_id);
        }

        for (const mapped of mappedRows) {
          dayBand++;
          const squareBookingId = mapped.appointment.square_booking_id;
          squareBookingIds.push(squareBookingId);
          const dogId = await findOrCreateDog(supabase, mapped.dog, {
            squareBookingId,
            appointmentDate: mapped.appointment.appointment_date,
          });

          const existingAppt = await findExistingAppointment(
            supabase,
            {
              squareBookingId,
              dogId,
              appointmentDate: mapped.appointment.appointment_date,
              dropTime: mapped.appointment.drop_time,
            },
            keepIds
          );

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
