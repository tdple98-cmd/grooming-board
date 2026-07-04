/** Comma-separated chip strings used on today notes and groom specs. */

export function parseChips(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function joinChips(chips) {
  return chips.join(", ");
}

export function chipIsSelected(selected, chip) {
  const lower = chip.toLowerCase();
  return selected.some((s) => s.toLowerCase() === lower);
}

export function toggleChipInList(selected, chip) {
  const lower = chip.toLowerCase();
  const i = selected.findIndex((s) => s.toLowerCase() === lower);
  if (i >= 0) return selected.filter((_, idx) => idx !== i);
  return [...selected, chip];
}

export function addChipToList(selected, chip) {
  const v = (chip || "").trim();
  if (!v || chipIsSelected(selected, v)) return selected;
  return [...selected, v];
}
