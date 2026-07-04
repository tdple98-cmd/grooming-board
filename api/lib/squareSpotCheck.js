import { createClient } from "@supabase/supabase-js";
import { listBookingsInRange, listLocations } from "./square.js";
import { melbourneDayBounds, todayMelbourneDateString } from "./melbourne.js";

const ACTIVE = new Set(["ACCEPTED", "PENDING"]);

function boardHasSquareBooking(dbIds, bookingId) {
  if (dbIds.has(bookingId)) return true;
  const prefix = `${bookingId}#`;
  for (const id of dbIds) {
    if (id.startsWith(prefix)) return true;
  }
  return false;
}

/** Compare today's Square bookings vs Supabase appointments; return gaps. */
export async function spotCheckTodayBoard({
  accessToken,
  environment,
  supabaseUrl,
  serviceRoleKey,
  date,
}) {
  const targetDate = date || todayMelbourneDateString();
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const locations = await listLocations({ environment, accessToken });
  const locationId = locations[0]?.id;
  const { startAtMin, startAtMax } = melbourneDayBounds(targetDate);

  let bookings = [];
  try {
    bookings = await listBookingsInRange({
      environment,
      accessToken,
      startAtMin,
      startAtMax,
      locationId,
    });
  } catch (err) {
    return { ok: false, error: err.message, date: targetDate };
  }

  bookings = bookings.filter((b) => ACTIVE.has(b.status));

  const { data: appts, error: dbErr } = await supabase
    .from("appointments")
    .select("id, square_booking_id, drop_time, dogs(name, owner_name)")
    .eq("appointment_date", targetDate);

  if (dbErr) throw dbErr;

  const dbIds = new Set((appts || []).map((a) => a.square_booking_id).filter(Boolean));
  const missingInBoard = bookings
    .filter((b) => !boardHasSquareBooking(dbIds, b.id))
    .map((b) => ({ id: b.id, startAt: b.start_at }));

  const squareIdSet = new Set(bookings.map((b) => b.id));
  const extraOnBoard = (appts || [])
    .filter((a) => {
      const sid = a.square_booking_id;
      if (!sid) return false;
      const base = sid.includes("#") ? sid.split("#")[0] : sid;
      return !squareIdSet.has(base);
    })
    .map((a) => ({
      id: a.id,
      squareBookingId: a.square_booking_id,
      dog: a.dogs?.name,
      owner: a.dogs?.owner_name,
    }));

  return {
    ok: true,
    date: targetDate,
    squareBookings: bookings.length,
    boardAppointments: (appts || []).length,
    missingInBoard,
    extraOnBoard,
    needsSync: missingInBoard.length > 0,
  };
}
