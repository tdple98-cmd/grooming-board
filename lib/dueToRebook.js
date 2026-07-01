import { cycleDaysForService } from "./serviceCycles.js";
import { formatVisitDate } from "./dates.js";

function dateOnly(str) {
  return String(str || "").slice(0, 10);
}

function addDays(dateStr, days) {
  const [y, m, d] = dateOnly(dateStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const [y1, m1, d1] = dateOnly(fromStr).split("-").map(Number);
  const [y2, m2, d2] = dateOnly(toStr).split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

/**
 * Compute dogs due for rebook from Supabase appointment rows (with joined dogs).
 * @returns {Array<{ dogId, dog, lastGroomDate, lastService, dueDate, daysOverdue }>}
 */
export function computeDueToRebook(appointments, today) {
  const todayStr = dateOnly(today);
  const byDog = new Map();

  for (const row of appointments || []) {
    const dogId = row.dog_id;
    if (!dogId || !row.dogs) continue;
    if (!byDog.has(dogId)) {
      byDog.set(dogId, { dog: row.dogs, past: [], future: [] });
    }
    const bucket = byDog.get(dogId);
    const d = dateOnly(row.appointment_date);
    if (d < todayStr) bucket.past.push(row);
    else bucket.future.push(row);
  }

  const due = [];
  for (const [dogId, { dog, past, future }] of byDog) {
    if (future.length) continue;
    if (!past.length) continue;

    const last = past.reduce((best, row) => {
      const d = dateOnly(row.appointment_date);
      return !best || d > dateOnly(best.appointment_date) ? row : best;
    }, null);

    const lastGroomDate = dateOnly(last.appointment_date);
    const lastService = last.service || "";
    const cycle = cycleDaysForService(lastService);
    const dueDate = addDays(lastGroomDate, cycle);
    if (todayStr < dueDate) continue;

    due.push({
      dogId,
      dog,
      lastGroomDate,
      lastService,
      dueDate,
      daysOverdue: daysBetween(dueDate, todayStr),
    });
  }

  due.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return due;
}

/** Map due entry to board card shape (read-only due view). */
export function dueEntryToBoardDog(entry, visit, photoUrls = {}) {
  const dog = entry.dog;
  const visitPhotoPath = visit?.photo_url;
  let lastVisit = null;
  if (visit) {
    lastVisit = {
      date: formatVisitDate(visit.visit_date),
      groomer: visit.groomer || "",
      service: visit.service || "",
      did: visit.did || "",
      took: visit.duration || "",
      note: visit.note || "",
      photoPath: isPhotoPath(visitPhotoPath) ? visitPhotoPath : null,
      photoUrl: isPhotoPath(visitPhotoPath) ? photoUrls[visitPhotoPath] || null : null,
    };
  }

  const overdueLabel =
    entry.daysOverdue <= 0
      ? "Due today"
      : entry.daysOverdue < 7
        ? `${entry.daysOverdue}d overdue`
        : `${Math.floor(entry.daysOverdue / 7)}w overdue`;

  return {
    id: `due-${entry.dogId}`,
    dogId: entry.dogId,
    readOnly: true,
    dueRebook: true,
    dueLabel: overdueLabel,
    lastGroomDate: formatVisitDate(entry.lastGroomDate),
    band: 0,
    dropTime: "",
    pickTime: "",
    owner: dog.owner_name || "",
    phone: dog.phone || "",
    dog: dog.name || "",
    weight: dog.weight || "",
    service: entry.lastService,
    status: "booked",
    avatar: dog.avatar || "🐕",
    bg: dog.bg_color || "#E9D9C6",
    groomPhotoPath: null,
    groomPhotoUrl: null,
    collected: false,
    groomer: "",
    checkedInAt: null,
    depositPaid: true,
    late: false,
    specs: {
      cut: dog.specs?.cut || "",
      coat: dog.specs?.coat || "",
      temperament: dog.specs?.temperament || "",
      health: dog.specs?.health || "",
      flag: dog.specs?.flag || "",
    },
    today: { cut: "", watch: "", svc: "" },
    lastVisit,
    litterId: dog.litter_id || null,
    litterMates: dog.litter_mates || null,
    squareBookingId: null,
    squareCustomerId: dog.square_customer_id || null,
    nameLocked: Boolean(dog.name_locked),
  };
}

function isPhotoPath(value) {
  return Boolean(value && value !== "pending" && !value.startsWith("http"));
}
