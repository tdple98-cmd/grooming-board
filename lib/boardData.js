import { formatVisitDate } from "./dates.js";

const DEFAULT_SPECS = { cut: "", coat: "", temperament: "", health: "", flag: "" };
const DEFAULT_TODAY = { cut: "", watch: "", svc: "" };

function isPhotoPath(value) {
  return Boolean(value && value !== "pending" && !value.startsWith("http"));
}

export function rowToBoardDog(appt, visit, photoUrls = {}) {
  const dog = appt.dogs || {};
  const specs = { ...DEFAULT_SPECS, ...(dog.specs || {}) };
  const today = { ...DEFAULT_TODAY, ...(appt.today_notes || {}) };

  const groomPhotoPath = isPhotoPath(appt.groom_photo_url) ? appt.groom_photo_url : null;

  let lastVisit = null;
  if (visit) {
    const visitPhotoPath = isPhotoPath(visit.photo_url) ? visit.photo_url : null;
    lastVisit = {
      date: formatVisitDate(visit.visit_date),
      groomer: visit.groomer || "",
      service: visit.service || "",
      did: visit.did || "",
      took: visit.duration || "",
      note: visit.note || "",
      photoPath: visitPhotoPath,
      photoUrl: visitPhotoPath ? photoUrls[visitPhotoPath] || null : null,
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
    groomPhotoPath,
    groomPhotoUrl: groomPhotoPath ? photoUrls[groomPhotoPath] || null : null,
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
    squareCustomerId: dog.square_customer_id || null,
    nameLocked: Boolean(dog.name_locked),
    readOnly: false,
    dueRebook: false,
    dueLabel: null,
    lastGroomDate: null,
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
  if ("groomPhotoPath" in patch) appt.groom_photo_url = patch.groomPhotoPath;
  if ("checkedInAt" in patch) {
    appt.checked_in_at = patch.checkedInAt ? new Date(patch.checkedInAt).toISOString() : null;
  }

  if ("specs" in patch) dog.specs = patch.specs;
  if ("dog" in patch) {
    dog.name = patch.dog;
    if (patch.nameLocked) dog.name_locked = true;
  }
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
  const presets = {
    today: { cut: [], watch: [], svc: [] },
    specs: { cut: [], coat: [], temperament: [], health: [], flag: [] },
  };
  for (const row of rows || []) {
    if (row.group_name === "today" && presets.today[row.key] !== undefined) {
      presets.today[row.key] = row.chips || [];
    }
    if (row.group_name === "specs" && presets.specs[row.key] !== undefined) {
      presets.specs[row.key] = row.chips || [];
    }
  }
  return presets;
}
