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

/** Inclusive day count between two Melbourne YYYY-MM-DD strings. */
export function daysBetweenMelbourne(startDate, endDate) {
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
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

/**
 * Resume backfill without wiping earlier data.
 * Re-syncs from the last stored appointment day (cleared first) through today + forward days.
 */
export function resumeSyncChunks({ lastDate, back = 90, forward = 7, chunkDays = 30, today } = {}) {
  const todayStr = today || todayMelbourneDateString();
  const windowEnd = shiftMelbourneDateString(todayStr, forward);

  if (!lastDate) {
    const full = historySyncChunks({ back, forward, chunkDays });
    return {
      syncFrom: full.startDate,
      windowEnd: full.windowEnd,
      clearedDate: null,
      chunks: full.chunks,
      upToDate: false,
      isFullBackfill: true,
    };
  }

  const last = String(lastDate).slice(0, 10);
  if (last >= windowEnd) {
    return {
      syncFrom: last,
      windowEnd,
      clearedDate: null,
      chunks: [],
      upToDate: true,
      isFullBackfill: false,
    };
  }

  const syncFrom = last;
  const dayCount = daysBetweenMelbourne(syncFrom, windowEnd) + 1;
  const chunks = [];
  for (let offset = 0; offset < dayCount; offset += chunkDays) {
    chunks.push({
      date: shiftMelbourneDateString(syncFrom, offset),
      days: Math.min(chunkDays, dayCount - offset),
    });
  }

  return {
    syncFrom,
    windowEnd,
    clearedDate: last,
    chunks,
    upToDate: false,
    isFullBackfill: false,
  };
}
