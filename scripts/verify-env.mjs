import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
const url = (env.VITE_SUPABASE_URL || "").trim();
const key = (env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!existsSync(envPath)) {
  console.error("Missing .env.local — copy .env.example and add your Supabase URL + anon key.");
  process.exit(1);
}

if (!url || !key) {
  console.error(".env.local is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.");
  process.exit(1);
}

if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
  console.error("VITE_SUPABASE_URL looks wrong:", url);
  process.exit(1);
}

const placeholders = [
  "YOUR_PROJECT_REF",
  "your_anon_public_key",
  "your-project-ref",
  "xxxxx",
];
const looksLikePlaceholder = (v) =>
  placeholders.some((p) => v.toUpperCase().includes(p.toUpperCase()));

if (looksLikePlaceholder(url) || looksLikePlaceholder(key)) {
  console.error("\n.env.local still has placeholder values from .env.example.");
  console.error("Replace them with real values from Supabase dashboard:\n");
  console.error("  1. Open https://supabase.com/dashboard → your project");
  console.error("  2. Project Settings → API");
  console.error("  3. Copy Project URL  → VITE_SUPABASE_URL");
  console.error("  4. Copy anon public  → VITE_SUPABASE_ANON_KEY");
  console.error("\nExample .env.local (use YOUR values, not these literals):\n");
  console.error("  VITE_SUPABASE_URL=https://abcdefghij.supabase.co");
  console.error("  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...");
  process.exit(1);
}

console.log("Checking Supabase:", url);

try {
  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("Auth health:", health.status, health.status === 200 ? "OK" : "FAILED");
  if (!health.ok) process.exit(1);

  const settings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log("Auth settings:", settings.status, settings.ok ? "OK" : "FAILED");
  if (!settings.ok) process.exit(1);

  console.log("\nSupabase connection looks good. Run npm run dev and test login in the browser.");
} catch (err) {
  console.error("\nCould not reach Supabase:", err.message);
  console.error("Check project URL, anon key, and that the project is not paused.");
  process.exit(1);
}
