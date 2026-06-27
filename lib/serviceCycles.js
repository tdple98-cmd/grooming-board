/**
 * Weeks between grooms for due-to-rebook.
 * Set VITE_REBOOK_WEEKS in Vercel (e.g. 6) to use one cycle for all services.
 * When unset, service-name rules below apply.
 */
const CYCLE_RULES = [
  { match: /full\s*groom|complete\s*groom|standard\s*groom/i, weeks: 6 },
  { match: /bath\s*(and|&|\+)\s*tidy|tidy\s*up|maintenance|between\s*full/i, weeks: 4 },
  { match: /puppy|first\s*groom|introduction/i, weeks: 4 },
  { match: /nail|face\s*feet|sanitary|touch/i, weeks: 3 },
];

const DEFAULT_WEEKS = 6;

function envRebookWeeks() {
  const raw = import.meta.env.VITE_REBOOK_WEEKS;
  if (raw == null || raw === "") return null;
  const n = parseInt(String(raw).trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function rebookWeeksForService(serviceName) {
  const override = envRebookWeeks();
  if (override != null) return override;

  const s = String(serviceName || "").trim();
  if (!s) return DEFAULT_WEEKS;
  for (const rule of CYCLE_RULES) {
    if (rule.match.test(s)) return rule.weeks;
  }
  return DEFAULT_WEEKS;
}

export function cycleDaysForService(serviceName) {
  return rebookWeeksForService(serviceName) * 7;
}
