import { createClient } from "@supabase/supabase-js";
import {
  batchRetrieveCatalog,
  batchRetrieveCustomers,
  listBookingsInRange,
  listLocations,
  searchTeamMembers,
} from "../lib/square.js";
import { mapSquareBookingToRows } from "../lib/mapBooking.js";
import { melbourneDayBounds, todayMelbourneDateString } from "../lib/melbourne.js";

function getConfig() {
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!accessToken) throw new Error("Missing SQUARE_ACCESS_TOKEN");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return { accessToken, environment, supabaseUrl, serviceRoleKey };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { accessToken, environment, supabaseUrl, serviceRoleKey } = getConfig();
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const date = body.date || todayMelbourneDateString();
    const { startAtMin, startAtMax } = melbourneDayBounds(date);

    const locations = await listLocations({ environment, accessToken });
    const locationId = body.location_id || locations[0]?.id;

    const bookings = await listBookingsInRange({
      environment,
      accessToken,
      startAtMin,
      startAtMax,
      locationId,
    });

    const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean))];
    const customersById = await batchRetrieveCustomers({ environment, accessToken, customerIds });

    const variationIds = [
      ...new Set(
        bookings.flatMap((b) =>
          (b.appointment_segments || []).map((s) => s.service_variation_id).filter(Boolean)
        )
      ),
    ];
    const catalogById = await batchRetrieveCatalog({ environment, accessToken, variationIds });

    const teamIds = [
      ...new Set(
        bookings.flatMap((b) =>
          (b.appointment_segments || []).map((s) => s.team_member_id).filter(Boolean)
        )
      ),
    ];
    const teamById = await searchTeamMembers({ environment, accessToken, teamIds });

    let upserted = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < bookings.length; i++) {
      const booking = bookings[i];
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
          await supabase.from("dogs").update({
            name: mapped.dog.name,
            owner_name: mapped.dog.owner_name,
            phone: mapped.dog.phone,
          }).eq("id", dogId);
        }

        const apptPayload = {
          ...mapped.appointment,
          dog_id: dogId,
          band: i + 1,
        };

        if (existingAppt) {
          const preserveStatus = existingAppt.collected ||
            ["checkedin", "grooming", "ready"].includes(existingAppt.status);
          if (preserveStatus) {
            delete apptPayload.status;
          }
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

    return res.status(200).json({
      ok: true,
      date,
      timezone: "Australia/Melbourne",
      locationId: locationId || null,
      bookingsFound: bookings.length,
      upserted,
      skipped,
      errors,
    });
  } catch (err) {
    console.error("Square sync error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
