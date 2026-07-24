import { computeDueToRebook } from "../../lib/dueToRebook.js";
import { searchOrdersForDay, summarizeOrdersRevenue, listLocations } from "./square.js";
import { melbourneDayBounds } from "./melbourne.js";

/**
 * Real revenue from Square's own completed Orders for the day — the same data Square's Sales
 * Report is built from, so this matches what's on the owner's phone (gross/net/discounts/returns).
 * Returns { ok: false, error } instead of a number if Square can't be reached, rather than guess.
 */
export async function computeSquareRevenue({ environment, accessToken, locationId }, dateStr) {
  try {
    const resolvedLocationId = locationId || (await listLocations({ environment, accessToken }))[0]?.id;
    if (!resolvedLocationId) return { ok: false, error: "No Square location found" };

    const { startAtMin, startAtMax } = melbourneDayBounds(dateStr);
    const orders = await searchOrdersForDay({
      environment,
      accessToken,
      locationId: resolvedLocationId,
      startAt: startAtMin,
      endAt: startAtMax,
    });
    return { ok: true, ...summarizeOrdersRevenue(orders) };
  } catch (err) {
    return { ok: false, error: err.message || "Square orders lookup failed" };
  }
}

/**
 * Dog counts, no-show rate, and groomer WORKLOAD (dog count; $ here is a catalog-price estimate
 * for relative comparison only, not real money — computeSquareRevenue is the accurate figure).
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

  const byGroomer = new Map();
  for (const r of active) {
    if (!r.groomer) continue;
    const cur = byGroomer.get(r.groomer) || { groomer: r.groomer, dogs: 0, estimatedRevenueCents: 0 };
    cur.dogs += 1;
    cur.estimatedRevenueCents += r.price_cents || 0;
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
  const rev = stats.squareRevenue;
  const lines = [
    `TPS ${stats.date} wrap-up:`,
    `${t.dogsTotal} dogs · ${t.collected} picked up · ${t.noShows} no-show${t.noShows === 1 ? "" : "s"}`,
    rev?.ok
      ? `Net sales: ${money(rev.netCents)}${rev.returnCents ? ` (gross ${money(rev.grossCents)})` : ""}`
      : "Revenue: unavailable (Square lookup failed)",
  ];
  if (t.perGroomer.length) {
    lines.push(t.perGroomer.map((g) => `${g.groomer} ${g.dogs}`).join(" · "));
  }
  if (stats.dueToRebookCount != null) {
    lines.push(`${stats.dueToRebookCount} due to rebook`);
  }
  return lines.join("\n");
}
