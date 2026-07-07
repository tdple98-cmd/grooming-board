/** Square booking IDs — one booking can map to multiple cards via `bookingId#2`. */

export function baseSquareBookingId(id) {
  if (!id) return "";
  return id.split("#")[0];
}

/** Stable slot id: bookingId, bookingId#2, bookingId#3, … */
export function squareBookingKey(bookingId, petIndex, total) {
  if (!bookingId) return "";
  if (total <= 1) return bookingId;
  return petIndex === 0 ? bookingId : `${bookingId}#${petIndex + 1}`;
}

/** 0-based slot from stored id (bare id = 0, #2 = 1, …). */
export function petSlotIndex(storedId) {
  if (!storedId) return 0;
  const hash = storedId.indexOf("#");
  if (hash === -1) return 0;
  const n = parseInt(storedId.slice(hash + 1), 10);
  return Number.isFinite(n) && n > 1 ? n - 1 : 0;
}

/** Display label for linked cards on the same Square booking (1, 2, 3…). */
export function petSlotLetter(storedId) {
  return String(petSlotIndex(storedId) + 1);
}

export function isSameSquareBooking(a, b) {
  if (!a || !b) return false;
  return baseSquareBookingId(a) === baseSquareBookingId(b);
}

export function squareBookingIdMatches(storedId, keepId) {
  if (!storedId || !keepId) return false;
  return storedId === keepId;
}

/** True if storedId is one of the ids Square sync expects for this window. */
export function isKeptSquareBookingId(storedId, keepIds) {
  if (!storedId) return false;
  for (const keepId of keepIds) {
    if (storedId === keepId) return true;
  }
  return false;
}

/** All square_booking_id values produced from one Square booking row. */
export function squareBookingKeysForPetCount(bookingId, petCount) {
  const n = Math.max(1, petCount);
  const keys = [];
  for (let i = 0; i < n; i++) keys.push(squareBookingKey(bookingId, i, n));
  return keys;
}
