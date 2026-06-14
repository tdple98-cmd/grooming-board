import { createClient } from "@supabase/supabase-js";
import {
  batchRetrieveCatalog,
  batchRetrieveCustomers,
  listBookingsInRange,
  listLocations,
  searchTeamMembers,
} from "./square.js";
import { mapSquareBookingToRows } from "./mapBooking.js";
import { melbourneDayBounds, melbourneDateString, todayMelbourneDateString } from "./melbourne.js";

function shiftMelbourneDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12);
  return melbourneDateString(new Date(utc).toISOString());
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

async function purgeNonSquareData(supabase, squareBookingIds) {
  const keep = new Set(squareBookingIds);

  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, dog_id, square_booking_id");

  if (error) throw error;

  const toRemove = (appts || []).filter(
    (a) => !a.square_booking_id || !keep.has(a.square_booking_id)
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

export async function syncSquareToSupabase({
  accessToken,
  environment,
  supabaseUrl,
  serviceRoleKey,
  startDate,
  days = 1,
  locationId,
  purge = true,
}) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const date = startDate || todayMelbourneDateString();
  const syncDates = dateRangeFromStart(date, days);
  const { startAtMin, startAtMax } = melbourneRangeBounds(date, days);

  const locations = await listLocations({ environment, accessToken });
  const resolvedLocationId = locationId || locations[0]?.id;

  let bookings = [];
  let fetchError = null;
  try {
    bookings = await listBookingsInRange({
      environment,
      accessToken,
      startAtMin,
      startAtMax,
      locationId: resolvedLocationId,
    });
  } catch (err) {
    fetchError = err;
    bookings = [];
  }

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

  const bookingsByDate = {};
  for (const d of syncDates) bookingsByDate[d] = [];

  for (const booking of bookings) {
    const d = melbourneDateString(booking.start_at);
    if (bookingsByDate[d]) bookingsByDate[d].push(booking);
  }

  for (const d of syncDates) {
    bookingsByDate[d].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  }

  let upserted = 0;
  let skipped = 0;
  const errors = [];
  const squareBookingIds = bookings.map((b) => b.id);

  for (const d of syncDates) {
    const dayBookings = bookingsByDate[d] || [];
    for (let i = 0; i < dayBookings.length; i++) {
      const booking = dayBookings[i];
      try {
        const customer = customersById[booking.customer_id];
        const mapped = mapSquareBookingToRows(booking, { customer, catalogById, teamById });

        const { data: existingAppt } = await supabase
          .from("appointments")
          .select("id, dog_id, status, collected")
          .eq("square_booking_id", booking.id)
          .maybeSingle();

        let dogId = existingAppt?.dog_id;

        if (!dogId) {
          const { data: dogRow, error: dogErr } = await supabase
            .from("dogs")
            .insert(mapped.dog)
            .select("id")
            .single();
          if (dogErr) throw dogErr;
          dogId = dogRow.id;
        } else {
          const { error: dogUpdErr } = await supabase.from("dogs").update({
            name: mapped.dog.name,
            owner_name: mapped.dog.owner_name,
            phone: mapped.dog.phone,
          }).eq("id", dogId);
          if (dogUpdErr) throw dogUpdErr;
        }

        const apptPayload = {
          ...mapped.appointment,
          dog_id: dogId,
          band: i + 1,
        };

        if (existingAppt) {
          const preserveStatus = existingAppt.collected ||
            ["checkedin", "grooming", "ready"].includes(existingAppt.status);
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
      } catch (e) {
        errors.push({ bookingId: booking.id, message: e.message });
        skipped++;
      }
    }
  }

  let purgeResult = { removedAppointments: 0, removedDogs: 0 };
  if (purge) {
    purgeResult = await purgeNonSquareData(supabase, squareBookingIds);
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
