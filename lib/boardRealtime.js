import { supabase } from "./supabase.js";
import { todayMelbourneDateString } from "./dates.js";

const POLL_MS = 90_000;
const DEBOUNCE_MS = 300;

/**
 * Subscribe to board-relevant Supabase Realtime events when live sync is enabled.
 */
export function subscribeBoardRealtime({
  enabled = true,
  onAppointmentIds,
  onAppointmentDeleted,
  onDogId,
  onVisitDogId,
  onPresets,
  onPoll,
  onStatus,
}) {
  if (!enabled) {
    onStatus?.("PAUSED");
    return () => {};
  }

  const date = todayMelbourneDateString();
  let pendingIds = new Set();
  let debounceTimer = null;

  const flushAppointments = () => {
    debounceTimer = null;
    if (!pendingIds.size) return;
    const ids = [...pendingIds];
    pendingIds = new Set();
    onAppointmentIds?.(ids);
  };

  const queueAppointment = (id) => {
    if (!id) return;
    pendingIds.add(id);
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushAppointments, DEBOUNCE_MS);
  };

  const channel = supabase
    .channel(`grooming-board-${date}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "appointments",
        filter: `appointment_date=eq.${date}`,
      },
      (payload) => {
        if (payload.eventType === "DELETE") {
          onAppointmentDeleted?.(payload.old?.id);
          return;
        }
        queueAppointment(payload.new?.id);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dogs" },
      (payload) => {
        const id = payload.new?.id || payload.old?.id;
        if (id) onDogId?.(id);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "visits" },
      (payload) => {
        const dogId = payload.new?.dog_id || payload.old?.dog_id;
        if (dogId) onVisitDogId?.(dogId);
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "preset_chips" },
      () => onPresets?.()
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  const pollTimer = setInterval(() => {
    if (document.visibilityState === "visible") onPoll?.();
  }, POLL_MS);

  const onVisible = () => {
    if (document.visibilityState === "visible") onPoll?.();
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    clearTimeout(debounceTimer);
    clearInterval(pollTimer);
    document.removeEventListener("visibilitychange", onVisible);
    supabase.removeChannel(channel);
  };
}

export function isRealtimeLive(status) {
  return status === "SUBSCRIBED";
}
