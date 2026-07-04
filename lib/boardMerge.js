/**
 * Merge remote board rows into local state without clobbering in-progress edits
 * or local photo previews.
 */

const EDITABLE_APPT_KEYS = new Set(["today", "specs", "dog"]);
const ALWAYS_MERGE_KEYS = new Set([
  "status",
  "groomer",
  "collected",
  "depositPaid",
  "late",
  "checkedInAt",
  "groomPhotoPath",
  "groomPhotoUrl",
  "band",
  "dropTime",
  "pickTime",
  "service",
  "lastVisit",
  "readOnly",
  "dueRebook",
  "dueLabel",
  "lastGroomDate",
]);

export function createEditGuard() {
  const active = new Set();

  return {
    /** @param {string} key e.g. "apptId:field:today.cut" */
    start(key) {
      active.add(key);
    },
    end(key) {
      active.delete(key);
    },
    isEditingAppointment(apptId) {
      const prefix = `${apptId}:`;
      for (const k of active) {
        if (k.startsWith(prefix)) return true;
      }
      return false;
    },
    isEditingField(apptId, field) {
      return active.has(`${apptId}:field:${field}`);
    },
  };
}

function mergeOne(existing, incoming, editGuard) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const editing = editGuard?.isEditingAppointment?.(existing.id);
  const merged = { ...existing };

  for (const key of ALWAYS_MERGE_KEYS) {
    if (key in incoming) merged[key] = incoming[key];
  }

  if (incoming.groomPhotoPreviewUrl) {
    merged.groomPhotoPreviewUrl = incoming.groomPhotoPreviewUrl;
  } else if (existing.groomPhotoPreviewUrl && !incoming.groomPhotoPath) {
    merged.groomPhotoPreviewUrl = existing.groomPhotoPreviewUrl;
  }

  if (!editing) {
    for (const key of EDITABLE_APPT_KEYS) {
      if (key in incoming) merged[key] = incoming[key];
    }
    merged.owner = incoming.owner ?? merged.owner;
    merged.phone = incoming.phone ?? merged.phone;
    merged.weight = incoming.weight ?? merged.weight;
    merged.avatar = incoming.avatar ?? merged.avatar;
    merged.bg = incoming.bg ?? merged.bg;
    merged.nameLocked = incoming.nameLocked ?? merged.nameLocked;
    merged.squareCustomerId = incoming.squareCustomerId ?? merged.squareCustomerId;
    merged.squareBookingId = incoming.squareBookingId ?? merged.squareBookingId;
    merged.dogId = incoming.dogId ?? merged.dogId;
  } else {
    if (editGuard.isEditingField(existing.id, "dog")) {
      /* keep local name */
    } else if (incoming.dog !== existing.dog) {
      merged.dog = incoming.dog;
    }

    if (!editGuard.isEditingField(existing.id, "today")) {
      merged.today = incoming.today;
    }
    if (!editGuard.isEditingField(existing.id, "specs")) {
      merged.specs = incoming.specs;
    }
  }

  return merged;
}

/** Merge incoming list into current by appointment id; preserve order from incoming when full refresh. */
export function mergeDogLists(current, incoming, editGuard, { replaceOrder = false } = {}) {
  const byId = new Map(current.map((d) => [d.id, d]));

  const merged = incoming.map((row) => mergeOne(byId.get(row.id), row, editGuard));

  if (replaceOrder) return merged;

  const incomingIds = new Set(incoming.map((d) => d.id));
  const extras = current.filter((d) => !incomingIds.has(d.id));
  return [...merged, ...extras];
}

/** Patch dog fields on every appointment row sharing dogId. */
export function patchDogOnList(list, dogId, patch) {
  return list.map((d) => (d.dogId === dogId ? { ...d, ...patch } : d));
}
