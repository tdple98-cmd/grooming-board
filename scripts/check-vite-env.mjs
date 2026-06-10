import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Load .env.local for local builds (Vercel injects env automatically).
for (const file of [".env.local", ".env"]) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

// Fails the build if Supabase client env vars are missing at build time.
const url = (process.env.VITE_SUPABASE_URL || "").trim();
const key = (process.env.VITE_SUPABASE_ANON_KEY || "").trim();

const issues = [];
if (!url) issues.push("VITE_SUPABASE_URL");
if (!key) issues.push("VITE_SUPABASE_ANON_KEY");
if (key.startsWith("sb_secret_")) issues.push("VITE_SUPABASE_ANON_KEY must be publishable (sb_publishable_...), not secret");

if (issues.length) {
  console.error("\n❌ Build blocked — missing Supabase env vars at build time:\n");
  for (const i of issues) console.error(`   • ${i}`);
  console.error("\nIn Vercel → Environment Variables:");
  console.error("   1. Add both VITE_* vars");
  console.error("   2. Enable for Production AND Preview (not Production only)");
  console.error("   3. Redeploy without build cache\n");
  process.exit(1);
}

console.log("✓ Supabase VITE_ env vars present at build time");
