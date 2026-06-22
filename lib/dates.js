const TZ = "Australia/Melbourne";

/** After this hour (Melbourne), the board shows the next day's appointments. */
const BOARD_ROLLOVER_HOUR = 18;

export function todayMelbourneDateString(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function melbourneHour(now = new Date()) {
  return parseInt(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: TZ,
      hour: "numeric",
      hour12: false,
    }).format(now),
    10
  );
}

function shiftMelbourneDateString(dateStr, deltaDays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + deltaDays, 12);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

/** Appointment date the board should load (rolls to tomorrow after salon close). */
export function boardDateMelbourneString(now = new Date()) {
  const today = todayMelbourneDateString(now);
  if (melbourneHour(now) >= BOARD_ROLLOVER_HOUR) {
    return shiftMelbourneDateString(today, 1);
  }
  return today;
}

export function formatBoardHeaderDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  return noon.toLocaleDateString("en-AU", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatVisitDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
