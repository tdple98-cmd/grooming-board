const TZ = "Australia/Melbourne";

export function todayMelbourneDateString(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function formatVisitDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function shiftMelbourneDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

/** 90-day backfill split into Square/Vercel-safe chunks (default 30 days each). */
export function historySyncChunks({ back = 90, forward = 7, chunkDays = 30 } = {}) {
  const startDate = shiftMelbourneDateString(todayMelbourneDateString(), -back);
  const totalDays = back + forward + 1;
  const chunks = [];
  for (let offset = 0; offset < totalDays; offset += chunkDays) {
    chunks.push({
      date: shiftMelbourneDateString(startDate, offset),
      days: Math.min(chunkDays, totalDays - offset),
    });
  }
  return {
    startDate,
    windowEnd: shiftMelbourneDateString(startDate, totalDays - 1),
    chunks,
  };
}
