import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { listBookingsInRange, listLocations } from "../api/lib/square.js";
import { melbourneDayBounds, todayMelbourneDateString } from "../api/lib/melbourne.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv(envPath);
const accessToken = env.SQUARE_ACCESS_TOKEN;
const environment = env.SQUARE_ENVIRONMENT || "sandbox";

if (!accessToken) {
  console.error("Add SQUARE_ACCESS_TOKEN to .env.local (see SETUP_SQUARE.md)");
  process.exit(1);
}

const date = process.argv[2] || todayMelbourneDateString();
const { startAtMin, startAtMax } = melbourneDayBounds(date);

console.log("Square environment:", environment);
console.log("Melbourne date:", date);
console.log("Range:", startAtMin, "→", startAtMax);

try {
  const locations = await listLocations({ environment, accessToken });
  console.log("\nLocations:", locations.length);
  for (const loc of locations) {
    console.log(" -", loc.id, loc.name, loc.status);
  }

  const locationId = locations[0]?.id;
  const bookings = await listBookingsInRange({
    environment,
    accessToken,
    startAtMin,
    startAtMax,
    locationId,
  });

  console.log("\nBookings found:", bookings.length);
  for (const b of bookings) {
    console.log(" -", b.id, b.status, b.start_at, "customer:", b.customer_id);
  }

  if (!bookings.length) {
    console.log("\nNo bookings in range. Create test appointments in Square sandbox dashboard.");
  } else {
    console.log("\nSquare API OK. Next: npm run test:sync (with service role key) or vercel dev + POST /api/square/sync");
  }
} catch (err) {
  console.error("\nSquare test failed:", err.message);
  process.exit(1);
}
