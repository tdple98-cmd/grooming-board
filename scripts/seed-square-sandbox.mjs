/**
 * Seed Square SANDBOX with grooming bookings for today + next 2 days (Melbourne).
 * Port of client's seed_square_sandbox.py — includes TODAY (day 0).
 *
 * Requires in .env.local: SQUARE_ACCESS_TOKEN, SQUARE_ENVIRONMENT=sandbox
 * Run: npm run seed:square
 */

import { randomUUID } from "crypto";
import { loadEnvFiles } from "./load-env.mjs";
import { squareRequest, listLocations } from "../api/lib/square.js";
import { todayMelbourneDateString, melbourneDateString } from "../api/lib/melbourne.js";

loadEnvFiles();

const accessToken = (process.env.SQUARE_ACCESS_TOKEN || "").trim();
const environment = process.env.SQUARE_ENVIRONMENT || "sandbox";

if (!accessToken) {
  console.error("Missing SQUARE_ACCESS_TOKEN in .env.local");
  process.exit(1);
}

const CURRENCY = "AUD";
const SLOTS = [
  { h: 9, m: 0 },
  { h: 10, m: 30 },
  { h: 13, m: 0 },
];
const PEOPLE = [
  { first: "Adam", last: "Mach", dog: "Pumpkin" },
  { first: "Sarah", last: "Nguyen", dog: "Luna" },
  { first: "James", last: "Carter", dog: "Bailey" },
];

function idem() {
  return randomUUID();
}

/** Build UTC ISO for a Melbourne calendar date + local time. */
function melbourneSlotIso(dateStr, hour, minute) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Australia/Melbourne",
    timeZoneName: "shortOffset",
  }).formatToParts(probe);
  const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value || "+10:00";
  const match = offsetPart.match(/([+-])(\d{1,2}):?(\d{2})?/);
  let offsetMin = 600;
  if (match) {
    const sign = match[1] === "-" ? -1 : 1;
    const hours = parseInt(match[2], 10);
    const mins = parseInt(match[3] || "0", 10);
    offsetMin = sign * (hours * 60 + mins);
  }
  const localMs = Date.UTC(y, m - 1, d, hour, minute, 0);
  return new Date(localMs - offsetMin * 60 * 1000).toISOString();
}

function shiftDateStr(dateStr, delta) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  return melbourneDateString(dt.toISOString());
}

function die(msg, payload) {
  console.error("FAILED:", msg);
  if (payload) console.error(JSON.stringify(payload, null, 2).slice(0, 1500));
  process.exit(1);
}

console.log("1/5  Looking up location ...");
const locations = await listLocations({ environment, accessToken });
if (!locations.length) die("could not list locations", null);
const locationId = locations[0].id;
console.log(`     location: ${locations[0].name || "(unnamed)"}  [${locationId}]`);

console.log("2/5  Finding a bookable team member ...");
let members = [];
try {
  const search = await squareRequest("/v2/team-members/search", {
    environment,
    accessToken,
    method: "POST",
    body: { query: { filter: { status: "ACTIVE" } } },
  });
  members = search.team_members || [];
} catch {
  members = [];
}

if (!members.length) {
  const created = await squareRequest("/v2/team-members", {
    environment,
    accessToken,
    method: "POST",
    body: {
      idempotency_key: idem(),
      team_member: {
        given_name: "Wendy",
        family_name: "Groomer",
        assigned_locations: { assignment_type: "ALL_CURRENT_AND_FUTURE_LOCATIONS" },
      },
    },
  });
  members = [created.team_member];
}

const teamMemberId = members[0].id;
console.log(
  `     team member: ${members[0].given_name || ""} ${members[0].family_name || ""}  [${teamMemberId}]`
);

console.log("3/5  Creating bookable 'Full Groom' service ...");
let serviceVariationId;
let serviceVariationVersion;

try {
  const catalog = await squareRequest("/v2/catalog/object", {
    environment,
    accessToken,
    method: "POST",
    body: {
      idempotency_key: idem(),
      object: {
        type: "ITEM",
        id: "#full_groom",
        item_data: {
          name: "Full Groom",
          product_type: "APPOINTMENTS_SERVICE",
          description: "Test service seeded for Grooming Board integration.",
          variations: [{
            type: "ITEM_VARIATION",
            id: "#full_groom_std",
            item_variation_data: {
              name: "Standard",
              pricing_type: "FIXED_PRICING",
              price_money: { amount: 9500, currency: CURRENCY },
              service_duration: 90 * 60 * 1000,
              available_for_booking: true,
              team_member_ids: [teamMemberId],
            },
          }],
        },
      },
    },
  });
  const variation = catalog.catalog_object.item_data.variations[0];
  serviceVariationId = variation.id;
  serviceVariationVersion = variation.version;
} catch (err) {
  die("could not create the service (is Appointments enabled on this sandbox seller?)", { error: err.message });
}

console.log(`     service variation: ${serviceVariationId}  (v${serviceVariationVersion})`);

console.log("4/5  Creating customers ...");
const customerIds = [];
for (const { first, last, dog } of PEOPLE) {
  try {
    const res = await squareRequest("/v2/customers", {
      environment,
      accessToken,
      method: "POST",
      body: {
        idempotency_key: idem(),
        given_name: first,
        family_name: last,
        note: `Dog: ${dog} (seeded test data)`,
      },
    });
    customerIds.push({ id: res.customer.id, dog, name: `${first} ${last}` });
    console.log(`     ${first} ${last} (owner of ${dog})  [${res.customer.id}]`);
  } catch (err) {
    console.log(`     warn: could not create ${first} ${last}: ${err.message}`);
  }
}

if (!customerIds.length) die("no customers created", null);

console.log("5/5  Creating bookings for today + next 2 days (Melbourne) ...");
const today = todayMelbourneDateString();
let created = 0;

for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
  const dayStr = shiftDateStr(today, dayOffset);
  for (let i = 0; i < SLOTS.length; i++) {
    const { h, m } = SLOTS[i];
    const cust = customerIds[i % customerIds.length];
    const startIso = melbourneSlotIso(dayStr, h, m);

    try {
      const res = await squareRequest("/v2/bookings", {
        environment,
        accessToken,
        method: "POST",
        body: {
          idempotency_key: idem(),
          booking: {
            location_id: locationId,
            start_at: startIso,
            customer_id: cust.id,
            customer_note: `Dog: ${cust.dog}`,
            appointment_segments: [{
              team_member_id: teamMemberId,
              service_variation_id: serviceVariationId,
              service_variation_version: serviceVariationVersion,
              duration_minutes: 90,
            }],
          },
        },
      });
      created++;
      console.log(`     OK  ${dayStr} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}  -> ${res.booking.id} (${cust.dog})`);
    } catch (err) {
      console.log(`     FAIL ${dayStr} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}  -> ${err.message}`);
    }
  }
}

console.log(`\nDone. Created ${created} booking(s) in Square SANDBOX (includes today: ${today}).`);
console.log("Next: npm run sync:square\n");
