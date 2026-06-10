const TZ = "Australia/Melbourne";

/** YYYY-MM-DD in Melbourne for a given instant. */
export function melbourneDateString(iso) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** e.g. "9:00 AM" in Melbourne. */
export function melbourneTimeString(iso) {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Start/end of Melbourne calendar day as UTC ISO bounds for Square API. */
export function melbourneDayBounds(dateStr) {
  // dateStr = YYYY-MM-DD — approximate bounds using noon UTC offset trick
  const [y, m, d] = dateStr.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
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

  const startUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - offsetMin * 60 * 1000);
  const endUtc = new Date(Date.UTC(y, m - 1, d, 23, 59, 59) - offsetMin * 60 * 1000);

  return {
    startAtMin: startUtc.toISOString(),
    startAtMax: endUtc.toISOString(),
  };
}

export function todayMelbourneDateString() {
  return melbourneDateString(new Date().toISOString());
}
