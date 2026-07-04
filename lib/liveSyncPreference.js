const STORAGE_KEY = "grooming-board-live-sync";

export function readLiveSyncEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0" || v === "false") return false;
    return true;
  } catch {
    return true;
  }
}

export function writeLiveSyncEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
