import { melbourneDateString, melbourneTimeString } from "./melbourne.js";
import { squareBookingKey } from "../../lib/squareBookingId.js";

const BG_COLORS = ["#E9D9C6", "#DBCBB6", "#CDBB9E", "#E4D5C0", "#DCCDB8", "#D6C4AE"];

/** Square customer custom attribute keys (The Poodle Specialist). */
export const DOG_NAME_KEY = "dog_name";
export const PET_NAME_INTAKE_KEY = "square:cdd3e144-5bdd-41e5-81b2-103b90dd284d";

const WEIGHT_SUFFIX_RE =
  /\s+(?:\d+(?:\.\d+)?\s*(?:kg|kgs?)|under\s+\d+\s*kgs?)\s*$/i;

function hashColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BG_COLORS[h % BG_COLORS.length];
}

function attrValue(attr) {
  if (attr == null) return "";
  if (typeof attr === "string") return attr.trim();
  const raw = attr.value ?? attr.string_value ?? attr.custom_attribute?.value;
  if (raw == null) return "";
  return String(raw).trim();
}

/** Build a key → value map from ListCustomerCustomAttributes results. */
export function customerAttrsByKey(customerCustomAttributes) {
  const map = {};
  for (const attr of customerCustomAttributes || []) {
    const key = attr.key || attr.custom_attribute?.key;
    if (!key) continue;
    const val = attrValue(attr);
    if (!val) continue;

    map[key] = val;

    if (key === DOG_NAME_KEY || key.endsWith(`:${DOG_NAME_KEY}`) || /(^|:)dog_name$/i.test(key)) {
      map[DOG_NAME_KEY] = val;
    }
    if (
      key === PET_NAME_INTAKE_KEY ||
      key.includes("cdd3e144-5bdd-41e5-81b2-103b90dd284d")
    ) {
      map[PET_NAME_INTAKE_KEY] = val;
    }

    const defName = (attr.definition?.name || "").toLowerCase();
    if (defName.includes("dog name")) map[DOG_NAME_KEY] = val;
    if (defName.includes("pet's name") || defName.includes("pets name")) {
      map[PET_NAME_INTAKE_KEY] = val;
    }
  }
  return map;
}

export function stripWeightFromPetName(text) {
  let s = String(text || "").trim();
  while (WEIGHT_SUFFIX_RE.test(s)) {
    s = s.replace(WEIGHT_SUFFIX_RE, "").trim();
  }
  return s;
}

function extractWeightFromIntake(intakeText) {
  if (!intakeText) return "";
  const m = String(intakeText).match(/(\d+(?:\.\d+)?\s*(?:kg|kgs?)|under\s+\d+\s*kgs?)/i);
  return m ? m[1].trim() : "";
}

function cleanPetName(raw) {
  const s = stripWeightFromPetName(String(raw || "").trim());
  if (!s || s.length > 60) return "";
  return s.replace(/^\(\d+\s*dogs?\)\s*/i, "").trim();
}

/** Names that should not be treated as real pet names from Square. */
export function isGenericPetName(name, customer) {
  if (!name) return true;
  const lower = name.toLowerCase().trim();
  if (["pet", "pets", "dog", "dogs", "puppy", "puppies", "animal", "animals"].includes(lower)) return true;
  if (/'s pet$/i.test(name) || /'s dog$/i.test(name)) return true;
  if (/^\d+\s*dogs?$/i.test(name)) return true;
  const given = customer?.given_name?.trim().toLowerCase();
  if (given && (lower === `${given} dogs` || lower === `${given}'s dogs` || lower === `${given}'s dog`)) {
    return true;
  }
  return false;
}

function splitMultiPetNames(text, customer) {
  if (!text?.trim()) return [];
  const cleaned = stripWeightFromPetName(text.trim());
  const parts = cleaned.split(/\s*(?:,|&|\band\b|\/|\|)\s*/i);
  const names = [];
  for (const part of parts) {
    const name = cleanPetName(part);
    if (name && !isGenericPetName(name, customer)) {
      if (!names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
    }
  }
  return names;
}

function ownerDogFallback(customer) {
  const given = customer?.given_name?.trim();
  return given ? `${given}'s dog` : "Dog";
}

/** Pet name typed on the booking itself (most reliable for multi-dog households). */
export function petNameFromBookingNotes(booking) {
  for (const raw of [booking?.customer_note, booking?.seller_note]) {
    const s = String(raw || "").trim();
    if (!s) continue;
    const line = s.split(/\r?\n/)[0].trim();
    const cleaned = cleanPetName(line);
    if (cleaned && !isGenericPetName(cleaned)) return cleaned;
  }
  return "";
}

/** Assign pet names for all bookings on a day, grouped by customer + start time. */
export function assignPetNamesForDayBookings(dayBookings, customersById, customerCustomAttrsById) {
  const byCustomer = new Map();
  for (const booking of dayBookings) {
    const cid = booking.customer_id || booking.id;
    if (!byCustomer.has(cid)) byCustomer.set(cid, []);
    byCustomer.get(cid).push(booking);
  }

  const nameByBookingId = new Map();
  for (const [cid, bookings] of byCustomer) {
    const sorted = [...bookings].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    const customer = customersById[cid];
    const attrs = customerCustomAttrsById[cid] || [];
    const profileNames = parseDogNames({ customer, customerCustomAttributes: attrs });

    for (let i = 0; i < sorted.length; i++) {
      const booking = sorted[i];
      let name = petNameFromBookingNotes(booking);
      if (!name && profileNames.length === sorted.length) name = profileNames[i];
      else if (!name && profileNames.length === 1) name = profileNames[0];
      else if (!name && profileNames.length) name = profileNames[Math.min(i, profileNames.length - 1)];
      else if (!name) name = ownerDogFallback(customer);
      nameByBookingId.set(booking.id, name);
    }
  }
  return nameByBookingId;
}

/**
 * Resolve pet name(s) from Square customer custom attributes (priority order from client).
 * 1. dog_name
 * 2. Pet's Name intake field (strip weight)
 * 3. "[owner]'s dog"
 */
export function parseDogNames({ customer, customerCustomAttributes }) {
  const byKey = customerAttrsByKey(customerCustomAttributes);

  const fromDogName = splitMultiPetNames(byKey[DOG_NAME_KEY], customer);
  if (fromDogName.length) return fromDogName;

  const fromIntake = splitMultiPetNames(byKey[PET_NAME_INTAKE_KEY], customer);
  if (fromIntake.length) return fromIntake;

  return [ownerDogFallback(customer)];
}

/** Map bonus Square customer custom attributes to board dog fields. */
export function mapDogFieldsFromCustomerAttrs(customerCustomAttributes) {
  const byKey = customerAttrsByKey(customerCustomAttributes);

  const weight =
    byKey.dog_weight?.trim() ||
    extractWeightFromIntake(byKey[PET_NAME_INTAKE_KEY]) ||
    "";

  const specs = {
    cut: byKey.preferred_cut?.trim() || "",
    coat: byKey.coat_type?.trim() || "",
    temperament: byKey.temperament?.trim() || "",
    health: byKey.health_alerts?.trim() || "",
  };

  return { weight, specs };
}

export function customerDisplayName(customer) {
  if (!customer) return "Unknown owner";
  const parts = [customer.given_name, customer.family_name].filter(Boolean);
  return parts.join(" ") || customer.email_address || "Unknown owner";
}

/** Resolve pet name list for one Square booking (may become multiple cards). */
export function resolvePetNamesForBooking(
  booking,
  { customer, customerCustomAttributes, petNameOverride, siblingBookingCount = 1 }
) {
  if (petNameOverride) return [petNameOverride];

  const fromNotes = petNameFromBookingNotes(booking);
  if (fromNotes) return [fromNotes];

  const profileNames = parseDogNames({ customer, customerCustomAttributes });

  // Several Square bookings same owner today → one dog per booking, never split profile list.
  if (siblingBookingCount > 1) {
    if (profileNames.length) return [profileNames[0]];
    return [ownerDogFallback(customer)];
  }

  if (profileNames.length) return profileNames;
  return [ownerDogFallback(customer)];
}

/** Map one Square booking to one or more board rows (multi-pet on a single booking). */
export function mapSquareBookingToRows(
  booking,
  { customer, catalogById, teamById, customerCustomAttributes, petNameOverride, siblingBookingCount = 1 }
) {
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
  const groomer = teamMember?.given_name || teamMember?.family_name || "";

  const startIso = booking.start_at;
  const endMs = new Date(startIso).getTime() + durationMin * 60 * 1000;
  const endIso = new Date(endMs).toISOString();

  const petNames = resolvePetNamesForBooking(booking, {
    customer,
    customerCustomAttributes,
    petNameOverride,
    siblingBookingCount,
  });
  const { weight, specs } = mapDogFieldsFromCustomerAttrs(customerCustomAttributes);
  const ownerName = customerDisplayName(customer);
  const phone = customer?.phone_number || "";

  const baseDog = {
    owner_name: ownerName,
    phone,
    avatar: "🐕",
    bg_color: hashColor(booking.customer_id || booking.id),
    square_customer_id: booking.customer_id || null,
    weight,
    specs,
  };

  const baseAppointment = {
    appointment_date: melbourneDateString(startIso),
    drop_time: melbourneTimeString(startIso),
    pick_time: melbourneTimeString(endIso),
    service: serviceName,
    status:
      booking.status === "CANCELLED_BY_CUSTOMER" || booking.status === "CANCELLED_BY_SELLER"
        ? "noshow"
        : "booked",
    groomer: groomer || "",
    deposit_paid: false,
    late: false,
    collected: false,
    today_notes: { cut: "", watch: "", svc: "" },
  };

  return petNames.map((name, index) => ({
    dog: { ...baseDog, name },
    appointment: {
      ...baseAppointment,
      square_booking_id: squareBookingKey(booking.id, index, petNames.length),
    },
    squareStatus: booking.status,
  }));
}
