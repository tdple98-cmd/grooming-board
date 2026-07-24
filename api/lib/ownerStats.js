import { computeDueToRebook } from "../../lib/dueToRebook.js";
import { searchOrdersForDay, summarizeOrdersRevenue, listLocations } from "./square.js";
import { melbourneDayBounds } from "./melbourne.js";

/** How far back "repeat customer" looks — long enough that a normal 4-8 week rebook cycle shows
 * up as a repeat, short enough to stay a recent-behaviour signal rather than lifetime history. */
const REPEAT_WINDOW_DAYS = 180;

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
 *
 * When rosterNames is given (today's actual roster from the reply-engine), the workload list is
 * built from that real roster — every rostered person shows even at 0 dogs, and a booking
 * assigned to someone NOT on today's roster (stale/wrong Square team-member mapping) is dropped
 * rather than inventing a phantom "groomer" who isn't actually in today. Falls back to whichever
 * names appear on bookings when no roster has been set for the day yet.
 */
export async function computeTodayStats(supabase, dateStr, rosterNames = null) {
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

  const usingRoster = Array.isArray(rosterNames) && rosterNames.length > 0;
  const byGroomer = new Map();
  if (usingRoster) {
    for (const name of rosterNames) byGroomer.set(name, { groomer: name, dogs: 0, estimatedRevenueCents: 0 });
  }
  for (const r of active) {
    if (!r.groomer) continue;
    if (usingRoster && !byGroomer.has(r.groomer)) continue; // not on today's roster — skip, don't invent
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
    workloadSource: usingRoster ? "roster" : "bookings",
  };
}

/** Bounded to the last year + next 60 days — matches the 12-month backfill, keeps the query cheap. */
export async function computeDueToRebookCount(supabase, todayStr) {
  const start = shiftDate(todayStr, -365);
  const end = shiftDate(todayStr, 60);
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("dog_id, appointment_date, service, status, dogs(id)")
    .gte("appointment_date", start)
    .lte("appointment_date", end);
  if (error) throw error;
  // A no-show never happened — it must not count as the dog's last real groom.
  const realRows = (rows || []).filter((r) => r.status !== "noshow");
  return computeDueToRebook(realRows, todayStr).length;
}

const WEEKDAY_WINDOW_DAYS = 90;

/**
 * Busiest weekday + top services over the last 90 days; repeat-customer rate over a longer
 * REPEAT_WINDOW_DAYS (180) — a 90-day window is too short to catch a dog on a 6-8 week cycle
 * twice, which was silently understating the rate. One query sized to the longer window, the
 * weekday/service stats then filtered down to their own shorter recency slice.
 */
export async function computeTrends(supabase, todayStr) {
  const start = shiftDate(todayStr, -REPEAT_WINDOW_DAYS);
  const weekdayStart = shiftDate(todayStr, -WEEKDAY_WINDOW_DAYS);
  const { data: rows, error } = await supabase
    .from("appointments")
    .select("appointment_date, service, dog_id")
    .gte("appointment_date", start)
    .lte("appointment_date", todayStr)
    .neq("status", "noshow");
  if (error) throw error;

  const all = rows || [];
  const recent = all.filter((r) => r.appointment_date >= weekdayStart);
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const byWeekdayCount = new Array(7).fill(0);
  const byWeekdayDays = new Array(7).fill(0).map(() => new Set());
  const byService = new Map();
  const dogVisits = new Map();

  for (const r of recent) {
    const d = new Date(r.appointment_date + "T12:00:00Z");
    const dow = d.getUTCDay();
    byWeekdayCount[dow] += 1;
    byWeekdayDays[dow].add(r.appointment_date);

    const svc = r.service || "Grooming appointment";
    byService.set(svc, (byService.get(svc) || 0) + 1);
  }
  for (const r of all) {
    if (r.dog_id) dogVisits.set(r.dog_id, (dogVisits.get(r.dog_id) || 0) + 1);
  }

  const byWeekday = WEEKDAYS.map((label, i) => ({
    weekday: label,
    avgDogs: byWeekdayDays[i].size ? Math.round((byWeekdayCount[i] / byWeekdayDays[i].size) * 10) / 10 : 0,
    dayCount: byWeekdayDays[i].size,
  }));

  const topServices = [...byService.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalDogs = dogVisits.size;
  const repeatDogs = [...dogVisits.values()].filter((n) => n > 1).length;
  const repeatRate = totalDogs ? repeatDogs / totalDogs : 0;

  return {
    windowDays: WEEKDAY_WINDOW_DAYS,
    repeatWindowDays: REPEAT_WINDOW_DAYS,
    byWeekday,
    topServices,
    repeatRate,
    totalDogs,
  };
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
