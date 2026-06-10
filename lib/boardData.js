import { formatVisitDate } from "./dates.js";

const DEFAULT_SPECS = { cut: "", coat: "", temperament: "", health: "" };
const DEFAULT_TODAY = { cut: "", watch: "", svc: "" };

export function rowToBoardDog(appt, visit) {
  const dog = appt.dogs || {};
  const specs = { ...DEFAULT_SPECS, ...(dog.specs || {}) };
  const today = { ...DEFAULT_TODAY, ...(appt.today_notes || {}) };

  let lastVisit = null;
  if (visit) {
    lastVisit = {
      date: formatVisitDate(visit.visit_date),
      groomer: visit.groomer || "",
      service: visit.service || "",
      did: visit.did || "",
      took: visit.duration || "",
      note: visit.note || "",
      photo: Boolean(visit.photo_url),
    };
  }

  return {
    id: appt.id,
    dogId: dog.id,
    band: appt.band,
    dropTime: appt.drop_time || "",
    pickTime: appt.pick_time || "",
    owner: dog.owner_name || "",
    phone: dog.phone || "",
    dog: dog.name || "",
    weight: dog.weight || "",
    service: appt.service || "",
    status: appt.status,
    avatar: dog.avatar || "🐕",
    bg: dog.bg_color || "#E9D9C6",
    groomPhoto: Boolean(appt.groom_photo_url),
    collected: appt.collected,
    groomer: appt.groomer || "",
    checkedInAt: appt.checked_in_at ? new Date(appt.checked_in_at).getTime() : null,
    depositPaid: appt.deposit_paid,
    late: appt.late,
    specs,
    today,
    lastVisit,
    litterId: dog.litter_id || null,
    litterMates: dog.litter_mates || null,
    squareBookingId: appt.square_booking_id || null,
  };
}

export function patchToDb(patch, current) {
  const appt = {};
  const dog = {};

  if ("status" in patch) appt.status = patch.status;
  if ("groomer" in patch) appt.groomer = patch.groomer;
  if ("depositPaid" in patch) appt.deposit_paid = patch.depositPaid;
  if ("late" in patch) appt.late = patch.late;
  if ("collected" in patch) appt.collected = patch.collected;
  if ("today" in patch) appt.today_notes = patch.today;
  if ("groomPhoto" in patch) appt.groom_photo_url = patch.groomPhoto ? "pending" : null;
  if ("checkedInAt" in patch) {
    appt.checked_in_at = patch.checkedInAt ? new Date(patch.checkedInAt).toISOString() : null;
  }

  if ("specs" in patch) dog.specs = patch.specs;
  if ("dog" in patch) dog.name = patch.dog;
  if ("weight" in patch) dog.weight = patch.weight;
  if ("owner" in patch) dog.owner_name = patch.owner;
  if ("phone" in patch) dog.phone = patch.phone;
  if ("avatar" in patch) dog.avatar = patch.avatar;
  if ("bg" in patch) dog.bg_color = patch.bg;
  if ("litterId" in patch) dog.litter_id = patch.litterId;
  if ("litterMates" in patch) dog.litter_mates = patch.litterMates;

  return { appt, dog };
}

export function chipsToPresets(rows) {
  const presets = { today: { cut: [], watch: [], svc: [] }, specs: { coat: [], temperament: [] } };
  for (const row of rows || []) {
    if (row.group_name === "today" && presets.today[row.key]) {
      presets.today[row.key] = row.chips || [];
    }
    if (row.group_name === "specs" && presets.specs[row.key]) {
      presets.specs[row.key] = row.chips || [];
    }
  }
  return presets;
}
