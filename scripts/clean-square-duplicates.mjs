/**
 * Cancel duplicate Square sandbox bookings (same customer + Melbourne slot).
 * Keeps the oldest booking per slot; cancels the rest.
 *
 * Run: npm run clean:square
 * Then: npm run sync:square
 */

import { randomUUID } from "crypto";
import { loadEnvFiles } from "./load-env.mjs";
import {
  batchRetrieveCustomers,
  listBookingsInRange,
  listLocations,
  squareRequest,
} from "../api/lib/square.js";
import {
  getDefaultSyncWindow,
  melbourneRangeChunks,
} from "../api/lib/syncSquareToSupabase.js";
import { melbourneDateString, melbourneTimeString } from "../api/lib/melbourne.js";
import { parseDogName, customerDisplayName } from "../api/lib/mapBooking.js";

loadEnvFiles();

const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";

if (!accessToken) {
  console.error("Missing SQUARE_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

async function cancelBooking(booking) {
  return squareRequest(`/v2/bookings/${booking.id}/cancel`, {
    environment,
    accessToken,
    method: "POST",
    body: {
      idempotency_key: randomUUID(),
      booking_version: booking.version,
    },
  });
}

function slotKey(booking, customersById) {
  const customer = customersById[booking.customer_id];
  const dog = parseDogName(booking.customer_note, customer);
  const date = melbourneDateString(booking.start_at);
  const time = melbourneTimeString(booking.start_at);
  return `${dog}|${date}|${time}`;
}

function isActive(booking) {
  return booking.status === "ACCEPTED" || booking.status === "PENDING";
}

const window = getDefaultSyncWindow();
const locations = await listLocations({ environment, accessToken });
const locationId = locations[0]?.id;

if (!locationId) {
  console.error("No Square locations found.");
  process.exit(1);
}

console.log(`Scanning Square bookings (${window.startDate} → ${window.windowEnd})...`);

const byId = new Map();
for (const chunk of melbourneRangeChunks(window.startDate, window.days)) {
  const batch = await listBookingsInRange({
    environment,
    accessToken,
    locationId,
    startAtMin: chunk.startAtMin,
    startAtMax: chunk.startAtMax,
  });
  for (const booking of batch) {
    byId.set(booking.id, booking);
  }
}

const bookings = [...byId.values()].filter(isActive);
const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean))];
const customersById = await batchRetrieveCustomers({ environment, accessToken, customerIds });

const groups = new Map();
for (const booking of bookings) {
  const key = slotKey(booking, customersById);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(booking);
}

let cancelled = 0;
let kept = 0;

for (const [, rows] of groups) {
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const keep = rows[0];
  kept++;

  const customer = customersById[keep.customer_id];
  const label = `${parseDogName(keep.customer_note, customer)} (${customerDisplayName(customer)})`;
  const when = `${melbourneDateString(keep.start_at)} ${melbourneTimeString(keep.start_at)}`;

  if (rows.length === 1) continue;

  console.log(`\nKeep: ${label} — ${when}`);
  for (const dup of rows.slice(1)) {
    try {
      await cancelBooking(dup);
      console.log(`  Cancelled duplicate: ${dup.id.slice(0, 10)}…`);
      cancelled++;
    } catch (err) {
      console.error(`  Failed to cancel ${dup.id}: ${err.message}`);
    }
  }
}

console.log(`\nDone. Kept ${kept} unique slot(s), cancelled ${cancelled} duplicate(s).`);
if (cancelled) {
  console.log("Next: npm run sync:square");
}
