import { melbourneDateString, melbourneTimeString } from "./melbourne.js";

const BG_COLORS = ["#E9D9C6", "#DBCBB6", "#CDBB9E", "#E4D5C0", "#DCCDB8", "#D6C4AE"];

function hashColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BG_COLORS[h % BG_COLORS.length];
}

/** Try to pull a dog name from customer_note (e.g. "Dog: Pumpkin" or first line). */
export function parseDogName(customerNote, customer) {
  const note = (customerNote || customer?.note || "").trim();
  if (note) {
    const labeled = note.match(/(?:dog|pet|puppy)\s*[:\-]\s*([^\n,]+)/i);
    if (labeled) return labeled[1].trim();
    const firstLine = note.split("\n")[0].trim();
    if (firstLine && firstLine.length < 40) return firstLine;
  }
  const given = customer?.given_name?.trim();
  if (given) return `${given}'s pet`;
  return "Pet";
}

export function customerDisplayName(customer) {
  if (!customer) return "Unknown owner";
  const parts = [customer.given_name, customer.family_name].filter(Boolean);
  return parts.join(" ") || customer.email_address || "Unknown owner";
}

export function mapSquareBookingToRows(booking, { customer, catalogById, teamById }) {
  const segments = booking.appointment_segments || [];
  const primary = segments[0] || {};
  const durationMin = segments.reduce((sum, s) => sum + (s.duration_minutes || 0), 0) || 60;

  const serviceVariationId = primary.service_variation_id;
  const catalogObj = serviceVariationId ? catalogById[serviceVariationId] : null;
  const serviceName =
    catalogObj?.item_variation_data?.name ||
    catalogObj?.item_data?.name ||
    "Grooming appointment";

  const teamMember = primary.team_member_id ? teamById[primary.team_member_id] : null;
  const groomer =
    teamMember?.given_name ||
    teamMember?.family_name ||
    "";

  const startIso = booking.start_at;
  const endMs = new Date(startIso).getTime() + durationMin * 60 * 1000;
  const endIso = new Date(endMs).toISOString();

  const dogName = parseDogName(booking.customer_note || customer?.note, customer);
  const ownerName = customerDisplayName(customer);
  const phone = customer?.phone_number || "";

  return {
    dog: {
      name: dogName,
      owner_name: ownerName,
      phone,
      avatar: "🐕",
      bg_color: hashColor(booking.customer_id || booking.id),
    },
    appointment: {
      square_booking_id: booking.id,
      appointment_date: melbourneDateString(startIso),
      drop_time: melbourneTimeString(startIso),
      pick_time: melbourneTimeString(endIso),
      service: serviceName,
      status: booking.status === "CANCELLED_BY_CUSTOMER" || booking.status === "CANCELLED_BY_SELLER"
        ? "noshow"
        : "booked",
      groomer: groomer || "",
      deposit_paid: false,
      late: false,
      collected: false,
      today_notes: { cut: "", watch: "", svc: "" },
    },
    squareStatus: booking.status,
  };
}
