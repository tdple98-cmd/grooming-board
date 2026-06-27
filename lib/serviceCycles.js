/**
 * Days between grooms per service name.
 * Update to match Thanh's Apps Script rebooking job when values are confirmed.
 */
const CYCLE_RULES = [
  { match: /full\s*groom|complete\s*groom|standard\s*groom/i, days: 42 },
  { match: /bath\s*(and|&|\+)\s*tidy|tidy\s*up|maintenance|between\s*full/i, days: 28 },
  { match: /puppy|first\s*groom|introduction/i, days: 28 },
  { match: /nail|face\s*feet|sanitary|touch/i, days: 21 },
];

const DEFAULT_CYCLE_DAYS = 42;

export function cycleDaysForService(serviceName) {
  const s = String(serviceName || "").trim();
  if (!s) return DEFAULT_CYCLE_DAYS;
  for (const rule of CYCLE_RULES) {
    if (rule.match.test(s)) return rule.days;
  }
  return DEFAULT_CYCLE_DAYS;
}
