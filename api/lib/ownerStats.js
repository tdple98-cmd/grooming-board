import { computeDueToRebook } from "../../lib/dueToRebook.js";

/**
 * Revenue here is an ESTIMATE built from Square catalog prices captured at sync time — it ignores
 * discounts/surcharges applied at checkout and is not the books. Square/Xero stay the ledger.
 */
export async function computeTodayStats(supabase, dateStr) {
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("status, collected, groomer, price_cents")
    .eq("appointment_date", dateStr);
  if (error) throw error;

  const all = rows || [];
  const dogsTotal = all.length;
  const noShows = all.filter((r) => r.status === "noshow").length;
  const active = all.filter((r) => r.status !== "noshow");
  const collected = all.filter((r) => r.collected).length;
  const notArrived = all.filter((r) => r.status === "booked").length;
  const checkedIn = all.filter((r) => r.status === "checkedin").length;
  const grooming = all.filter((r) => r.status === "grooming").length;
  const ready = all.filter((r) => r.status === "ready").length;

  const revenueCents = active.reduce((sum, r) => sum + (r.price_cents || 0), 0);
  const revenueKnownCount = active.filter((r) => r.price_cents != null).length;

  const byGroomer = new Map();
  for (const r of active) {
    if (!r.groomer) continue;
    const cur = byGroomer.get(r.groomer) || { groomer: r.groomer, dogs: 0, revenueCents: 0 };
    cur.dogs += 1;
    cur.revenueCents += r.price_cents || 0;
    byGroomer.set(r.groomer, cur);
  }
  const perGroomer = [...byGroomer.values()].sort((a, b) => b.dogs - a.dogs);

  return {
    date: dateStr,
    dogsTotal,
    notArrived,
    checkedIn,
    grooming,
    ready,
    collected,
    noShows,
    noShowRate: dogsTotal ? noShows / dogsTotal : 0,
    revenueCents,
    revenueKnownCount,
    revenueTotalCount: active.length,
    perGroomer,
  };
}

/** Bounded to the last year + next 60 days — matches the 12-month backfill, keeps the query cheap. */
export async function computeDueToRebookCount(supabase, todayStr) {
  const start = shiftDate(todayStr, -365);
  const end = shiftDate(todayStr, 60);
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("dog_id, appointment_date, service, dogs(id)")
    .gte("appointment_date", start)
    .lte("appointment_date", end);
  if (error) throw error;
  return computeDueToRebook(rows || [], todayStr).length;
}

/** Last 90 non-no-show days: busiest weekday, top services, repeat-customer rate. */
export async function computeTrends(supabase, todayStr) {
  const start = shiftDate(todayStr, -90);
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("appointment_date, service, dog_id")
    .gte("appointment_date", start)
    .lte("appointment_date", todayStr)
    .neq("status", "noshow");
  if (error) throw error;

  const all = rows || [];
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byWeekdayCount = new Array(7).fill(0);
  const byWeekdayDays = new Array(7).fill(0).map(() => new Set());
  const byService = new Map();
  const dogVisits = new Map();

  for (const r of all) {
    const d = new Date(r.appointment_date + "T12:00:00Z");
    const dow = d.getUTCDay();
    byWeekdayCount[dow] += 1;
    byWeekdayDays[dow].add(r.appointment_date);

    const svc = r.service || "Grooming appointment";
    byService.set(svc, (byService.get(svc) || 0) + 1);

    if (r.dog_id) dogVisits.set(r.dog_id, (dogVisits.get(r.dog_id) || 0) + 1);
  }

  const byWeekday = WEEKDAYS.map((label, i) => ({
    weekday: label,
    avgDogs: byWeekdayDays[i].size ? Math.round((byWeekdayCount[i] / byWeekdayDays[i].size) * 10) / 10 : 0,
  }));

  const topServices = [...byService.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalDogs = dogVisits.size;
  const repeatDogs = [...dogVisits.values()].filter((n) => n > 1).length;
  const repeatRate = totalDogs ? repeatDogs / totalDogs : 0;

  return { windowDays: 90, byWeekday, topServices, repeatRate, totalDogs };
}

function shiftDate(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + deltaDays, 12)).toISOString().slice(0, 10);
}

function money(cents) {
  return "$" + (Math.round(cents) / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatDigestText(stats) {
  const t = stats.today;
  const lines = [
    `TPS ${stats.date} wrap-up:`,
    `${t.dogsTotal} dogs · ${t.collected} picked up · ${t.noShows} no-show${t.noShows === 1 ? "" : "s"}`,
    `Revenue est: ${money(t.revenueCents)}${t.revenueKnownCount < t.revenueTotalCount ? ` (${t.revenueKnownCount}/${t.revenueTotalCount} priced)` : ""}`,
  ];
  if (t.perGroomer.length) {
    lines.push(t.perGroomer.map((g) => `${g.groomer} ${g.dogs}`).join(" · "));
  }
  if (stats.dueToRebookCount != null) {
    lines.push(`${stats.dueToRebookCount} due to rebook`);
  }
  return lines.join("\n");
}
