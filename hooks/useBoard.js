import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayMelbourneDateString, formatVisitDate } from "../lib/dates";
import { chipsToPresets, patchToDb, rowToBoardDog } from "../lib/boardData";
import { defaultPresetsFromDefinitions, mergePresetsWithDefaults } from "../lib/presetChipDefaults.js";
import {
  uploadGroomPhoto,
  getGroomPhotoDisplayUrl,
  getGroomPhotoThumbUrl,
  signPhotoDisplayMap,
  startPhotoUrlRefreshLoop,
} from "../lib/groomPhotos.js";
import { computeDueToRebook, dueEntryToBoardDog } from "../lib/dueToRebook.js";
import {
  dedupeBoardDogs,
  fetchAppointmentsByIds,
  fetchLatestVisitsByDog,
  fetchTodayAppointments,
  mapRowsToBoardDogs,
} from "../lib/boardFetch.js";
import { createEditGuard, mergeDogLists, patchDogOnList } from "../lib/boardMerge.js";
import { isRealtimeLive, subscribeBoardRealtime } from "../lib/boardRealtime.js";
import { readLiveSyncEnabled, writeLiveSyncEnabled } from "../lib/liveSyncPreference.js";

const DEFAULT_PRESETS = defaultPresetsFromDefinitions();
const SPOT_CHECK_MIN_MS = 8 * 60 * 1000;
const SPOT_CHECK_MAX_MS = 15 * 60 * 1000;

async function attachPhotoUrls(rows) {
  const paths = [];
  for (const row of rows) {
    if (row.groomPhotoPath) paths.push(row.groomPhotoPath);
    if (row.lastVisit?.photoPath) paths.push(row.lastVisit.photoPath);
  }
  const { full, thumb } = await signPhotoDisplayMap(paths);
  return rows.map((row) => ({
    ...row,
    groomPhotoUrl: row.groomPhotoPath
      ? full[row.groomPhotoPath] || row.groomPhotoUrl || null
      : row.groomPhotoUrl || null,
    groomPhotoThumbUrl: row.groomPhotoPath
      ? thumb[row.groomPhotoPath] || full[row.groomPhotoPath] || row.groomPhotoThumbUrl || null
      : row.groomPhotoThumbUrl || null,
    lastVisit: row.lastVisit
      ? {
          ...row.lastVisit,
          photoUrl: row.lastVisit.photoPath
            ? full[row.lastVisit.photoPath] || row.lastVisit.photoUrl || null
            : row.lastVisit.photoUrl || null,
          photoThumbUrl: row.lastVisit.photoPath
            ? thumb[row.lastVisit.photoPath] ||
              full[row.lastVisit.photoPath] ||
              row.lastVisit.photoThumbUrl ||
              null
            : row.lastVisit.photoThumbUrl || null,
        }
      : null,
  }));
}

export function useBoard(session) {
  const [dogs, setDogs] = useState([]);
  const [dueDogs, setDueDogs] = useState([]);
  const [boardMode, setBoardMode] = useState("today");
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState("");
  const [boardNotice, setBoardNotice] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState("CONNECTING");
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(() => readLiveSyncEnabled());

  const boardModeRef = useRef(boardMode);
  const loadedForUserRef = useRef(null);
  const editGuardRef = useRef(createEditGuard());
  const liveSyncRef = useRef(liveSyncEnabled);
  const spotCheckRunningRef = useRef(false);

  boardModeRef.current = boardMode;
  liveSyncRef.current = liveSyncEnabled;

  const touchSynced = useCallback(() => {
    setLastSyncedAt(Date.now());
  }, []);

  const toggleLiveSync = useCallback(() => {
    setLiveSyncEnabled((on) => {
      const next = !on;
      writeLiveSyncEnabled(next);
      if (!next) setRealtimeStatus("PAUSED");
      return next;
    });
  }, []);

  const loadPresets = useCallback(async () => {
    const { data: chipRows, error } = await supabase.from("preset_chips").select("*");
    if (error) throw error;
    setPresets(mergePresetsWithDefaults(chipsToPresets(chipRows)));
  }, []);

  const loadBoard = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s) return;
    setBoardError("");
    const date = todayMelbourneDateString();

    const todayRows = await fetchTodayAppointments(date);
    const dogIds = [...new Set(todayRows.map((a) => a.dog_id).filter(Boolean))];
    const visitByDog = await fetchLatestVisitsByDog(dogIds);

    const mapped = dedupeBoardDogs(mapRowsToBoardDogs(todayRows, visitByDog));
    const withPhotos = await attachPhotoUrls(mapped);

    setDogs((current) =>
      mergeDogLists(current, withPhotos, editGuardRef.current, { replaceOrder: true })
    );
    await loadPresets();
    touchSynced();
  }, [loadPresets, touchSynced]);

  const loadDueDogs = useCallback(async () => {
    const {
      data: { session: s },
    } = await supabase.auth.getSession();
    if (!s) return;
    setBoardError("");
    const today = todayMelbourneDateString();

    const { data: appointments, error: apptErr } = await supabase
      .from("appointments")
      .select("appointment_date, service, dog_id, dogs(*)");

    if (apptErr) throw apptErr;

    const dueEntries = computeDueToRebook(appointments, today);
    const dogIds = dueEntries.map((e) => e.dogId);
    const visitByDog = await fetchLatestVisitsByDog(dogIds);

    const mapped = dueEntries.map((e) => dueEntryToBoardDog(e, visitByDog[e.dogId]));
    setDueDogs(await attachPhotoUrls(mapped));
  }, []);

  const applyAppointmentPatches = useCallback(
    async (ids) => {
      if (!ids.length) return;
      const rows = await fetchAppointmentsByIds(ids);
      const date = todayMelbourneDateString();
      const todayRows = rows.filter((a) => String(a.appointment_date).slice(0, 10) === date);
      if (!todayRows.length) return;

      const dogIds = [...new Set(todayRows.map((a) => a.dog_id).filter(Boolean))];
      const visitByDog = await fetchLatestVisitsByDog(dogIds);
      const mapped = dedupeBoardDogs(mapRowsToBoardDogs(todayRows, visitByDog));
      const withPhotos = await attachPhotoUrls(mapped);

      setDogs((current) => mergeDogLists(current, withPhotos, editGuardRef.current));
      touchSynced();
    },
    [touchSynced]
  );

  const removeAppointment = useCallback(
    (id) => {
      if (!id) return;
      setDogs((p) => p.filter((d) => d.id !== id));
      touchSynced();
    },
    [touchSynced]
  );

  const applyDogPatch = useCallback(
    async (dogId) => {
      if (!dogId) return;
      const { data: dog, error } = await supabase.from("dogs").select("*").eq("id", dogId).maybeSingle();
      if (error || !dog) return;

      const patch = {
        dog: dog.name || "",
        owner: dog.owner_name || "",
        phone: dog.phone || "",
        weight: dog.weight || "",
        avatar: dog.avatar || "🐕",
        bg: dog.bg_color || "#E9D9C6",
        specs: { cut: "", coat: "", temperament: "", health: "", flag: "", ...(dog.specs || {}) },
        nameLocked: Boolean(dog.name_locked),
        squareCustomerId: dog.square_customer_id || null,
      };

      setDogs((p) => patchDogOnList(p, dogId, patch));
      setDueDogs((p) => patchDogOnList(p, dogId, patch));
      touchSynced();
    },
    [touchSynced]
  );

  const applyVisitPatch = useCallback(
    async (dogId) => {
      if (!dogId) return;
      const visitByDog = await fetchLatestVisitsByDog([dogId]);
      const visit = visitByDog[dogId];
      if (!visit) return;

      const { full, thumb } = visit.photo_url
        ? await signPhotoDisplayMap([visit.photo_url])
        : { full: {}, thumb: {} };
      const lastVisit = rowToBoardDog(
        { id: "_", dogs: {}, today_notes: {} },
        visit,
        full,
        thumb
      ).lastVisit;

      setDogs((p) => patchDogOnList(p, dogId, { lastVisit }));
      setDueDogs((p) => patchDogOnList(p, dogId, { lastVisit }));
      touchSynced();
    },
    [touchSynced]
  );

  const softPoll = useCallback(() => {
    if (!liveSyncRef.current) return;
    loadBoard().catch(() => {});
    loadDueDogs().catch(() => {});
  }, [loadBoard, loadDueDogs]);

  const runSquareSpotCheck = useCallback(async ({ autoSync = true } = {}) => {
    if (spotCheckRunningRef.current) return null;
    spotCheckRunningRef.current = true;
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      if (!s) return null;

      const res = await fetch("/api/square/spot-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s.access_token || ""}`,
        },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) return null;

      if (json.needsSync) {
        const n = json.missingInBoard?.length || 0;
        setBoardNotice(
          n
            ? `${n} booking(s) in Square not on the board — syncing now…`
            : "Square check found updates — syncing now…"
        );
        if (autoSync) {
          const syncRes = await fetch("/api/square/sync", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${s.access_token || ""}`,
            },
            body: JSON.stringify({}),
          });
          const syncJson = await syncRes.json().catch(() => ({}));
          if (syncRes.ok && syncJson.ok) {
            await loadBoard();
            await loadDueDogs();
            setBoardNotice(`Square check synced ${syncJson.upserted || 0} appointment(s).`);
          }
        }
      }
      return json;
    } catch {
      return null;
    } finally {
      spotCheckRunningRef.current = false;
    }
  }, [loadBoard, loadDueDogs]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) {
      setDogs([]);
      setDueDogs([]);
      setBoardLoading(false);
      setRealtimeStatus("CLOSED");
      loadedForUserRef.current = null;
      return;
    }

    let mounted = true;
    const isFirstLoadForUser = loadedForUserRef.current !== userId;
    if (isFirstLoadForUser) {
      loadedForUserRef.current = userId;
      setBoardLoading(true);
    }

    Promise.all([loadBoard(), loadDueDogs()])
      .catch((e) => {
        if (mounted) setBoardError(e.message || "Could not load board data.");
      })
      .finally(() => {
        if (mounted) setBoardLoading(false);
      });

    const stopPhotoRefresh = startPhotoUrlRefreshLoop();

    const unsubscribe = subscribeBoardRealtime({
      enabled: liveSyncEnabled,
      onAppointmentIds: (ids) => {
        applyAppointmentPatches(ids).catch(() => softPoll());
      },
      onAppointmentDeleted: removeAppointment,
      onDogId: (dogId) => {
        applyDogPatch(dogId).catch(() => softPoll());
      },
      onVisitDogId: (dogId) => {
        applyVisitPatch(dogId).catch(() => softPoll());
      },
      onPresets: () => {
        loadPresets().catch(() => {});
      },
      onPoll: softPoll,
      onStatus: (status) => {
        if (mounted) setRealtimeStatus(status);
      },
    });

    return () => {
      mounted = false;
      stopPhotoRefresh();
      unsubscribe();
    };
  }, [
    session?.user?.id,
    liveSyncEnabled,
    loadBoard,
    loadDueDogs,
    loadPresets,
    applyAppointmentPatches,
    removeAppointment,
    applyDogPatch,
    applyVisitPatch,
    softPoll,
  ]);

  useEffect(() => {
    if (!session?.user?.id || !liveSyncEnabled) return;

    let timeoutId;
    let cancelled = false;

    const schedule = () => {
      const delay =
        SPOT_CHECK_MIN_MS + Math.random() * (SPOT_CHECK_MAX_MS - SPOT_CHECK_MIN_MS);
      timeoutId = setTimeout(async () => {
        if (cancelled || !liveSyncRef.current) return;
        await runSquareSpotCheck({ autoSync: true });
        if (!cancelled && liveSyncRef.current) schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [session?.user?.id, liveSyncEnabled, runSquareSpotCheck]);

  const persistPatch = async (id, patch, current) => {
    if (current.readOnly) return;

    const { appt, dog } = patchToDb(patch, current);

    if (Object.keys(appt).length) {
      const { error } = await supabase.from("appointments").update(appt).eq("id", id);
      if (error) throw error;
    }
    if (Object.keys(dog).length && current.dogId) {
      const { error } = await supabase.from("dogs").update(dog).eq("id", current.dogId);
      if (error) throw error;
    }

    if (patch.nameLocked && patch.dog?.trim() && current.squareCustomerId) {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/square/pet-name", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s?.access_token || ""}`,
        },
        body: JSON.stringify({
          square_customer_id: current.squareCustomerId,
          name: patch.dog.trim(),
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Saved on board but could not update Square.");
      }
    }

    if (patch.collected === true) {
      const { data: existingVisit } = await supabase
        .from("visits")
        .select("id")
        .eq("appointment_id", id)
        .maybeSingle();

      const visitDate = todayMelbourneDateString();
      const photoPath = current.groomPhotoPath || null;

      if (!existingVisit) {
        const { error } = await supabase.from("visits").insert({
          dog_id: current.dogId,
          appointment_id: id,
          visit_date: visitDate,
          groomer: current.groomer || null,
          service: current.service || null,
          did: [current.today?.cut, current.today?.svc].filter(Boolean).join(" · ") || null,
          duration: null,
          note: current.today?.watch || null,
          photo_url: photoPath,
        });
        if (error) throw error;
      }

      let photoUrl =
        current.groomPhotoUrl ||
        current.groomPhotoPreviewUrl ||
        current.lastVisit?.photoUrl ||
        null;
      if (photoPath && (!photoUrl || !photoUrl.startsWith("http"))) {
        try {
          photoUrl = await getGroomPhotoDisplayUrl(photoPath, 7200);
        } catch {
          photoUrl = current.groomPhotoUrl || current.groomPhotoPreviewUrl || null;
        }
      }

      const lastVisit = {
        date: formatVisitDate(visitDate),
        groomer: current.groomer || "",
        service: current.service || "",
        did: [current.today?.cut, current.today?.svc].filter(Boolean).join(" · ") || "",
        took: "",
        note: current.today?.watch || "",
        photoPath,
        photoUrl,
        photoThumbUrl: photoPath ? await getGroomPhotoThumbUrl(photoPath, 7200).catch(() => photoUrl) : null,
      };

      setDogs((p) =>
        p.map((d) => (d.id === id ? { ...d, ...current, collected: true, lastVisit } : d))
      );
    }
  };

  const markCollected = async (id) => {
    const current = dogs.find((d) => d.id === id);
    if (!current || current.readOnly) return;
    if (current.collected) return;

    const merged = { ...current, collected: true };
    setDogs((p) => p.map((d) => (d.id === id ? merged : d)));
    setBoardError("");
    try {
      await persistPatch(id, { collected: true }, merged);
    } catch (e) {
      setBoardError(e.message || "Could not mark as picked up.");
      await loadBoard();
      throw e;
    }
  };

  const update = (id, patch) => {
    const list = boardMode === "due" ? dueDogs : dogs;
    const current = list.find((d) => d.id === id);
    if (!current || current.readOnly) return;

    const merged = { ...current, ...patch };
    const setter = boardMode === "due" ? setDueDogs : setDogs;
    setter((p) => p.map((d) => (d.id === id ? merged : d)));
    persistPatch(id, patch, merged).catch((e) => {
      setBoardError(e.message || "Could not save changes. Refresh to retry.");
      if (boardMode === "due") loadDueDogs();
      else loadBoard();
    });
  };

  const setStatus = (id, v) => {
    const list = boardMode === "due" ? dueDogs : dogs;
    const current = list.find((d) => d.id === id);
    if (!current || current.readOnly) return;
    const patch = { status: v };
    if (v === "checkedin" && !current.checkedInAt) patch.checkedInAt = Date.now();
    update(id, patch);
  };

  const uploadPhoto = async (appointmentId, file) => {
    const current = dogs.find((d) => d.id === appointmentId);
    if (!current?.dogId || current.readOnly) return;

    const previewUrl = URL.createObjectURL(file);
    const withPreview = {
      ...current,
      groomPhotoPreviewUrl: previewUrl,
    };
    setDogs((p) => p.map((d) => (d.id === appointmentId ? withPreview : d)));

    setPhotoUploading(true);
    setBoardError("");
    try {
      const path = await uploadGroomPhoto({
        dogId: current.dogId,
        appointmentId,
        file,
      });
      let url = null;
      let thumbUrl = null;
      try {
        url = await getGroomPhotoDisplayUrl(path, 7200);
        thumbUrl = await getGroomPhotoThumbUrl(path, 7200);
      } catch (e) {
        setBoardError(
          (e.message || "Photo saved but could not load preview.") +
            " Check Supabase Storage RLS for groom-photos."
        );
      }
      const patch = {
        groomPhotoPath: path,
        groomPhotoUrl: url || previewUrl,
        groomPhotoThumbUrl: thumbUrl || url || previewUrl,
        groomPhotoPreviewUrl: url ? null : previewUrl,
      };
      const merged = { ...withPreview, ...patch };
      if (url) URL.revokeObjectURL(previewUrl);
      setDogs((p) => p.map((d) => (d.id === appointmentId ? merged : d)));
      await persistPatch(appointmentId, { groomPhotoPath: path }, merged);
    } catch (e) {
      URL.revokeObjectURL(previewUrl);
      setBoardError(e.message || "Could not upload photo.");
      loadBoard();
    } finally {
      setPhotoUploading(false);
    }
  };

  const addPreset = async (group, key, chip) => {
    const v = (chip || "").trim();
    if (!v) return;
    const current = presets[group]?.[key] || [];
    if (current.some((c) => c.toLowerCase() === v.toLowerCase())) return;
    const next = [...current, v];
    setPresets((p) => ({
      ...p,
      [group]: { ...p[group], [key]: next },
    }));

    const { data: row } = await supabase
      .from("preset_chips")
      .select("id")
      .eq("group_name", group)
      .eq("key", key)
      .maybeSingle();

    const { error } = row
      ? await supabase.from("preset_chips").update({ chips: next }).eq("id", row.id)
      : await supabase.from("preset_chips").insert({ group_name: group, key, chips: next });

    if (error) {
      setBoardError("Could not save preset chips.");
      loadBoard();
    }
  };

  const removePreset = async (group, key, chip) => {
    const current = presets[group]?.[key] || [];
    const next = current.filter((x) => x !== chip);
    setPresets((p) => ({
      ...p,
      [group]: { ...p[group], [key]: next },
    }));

    const { data: row } = await supabase
      .from("preset_chips")
      .select("id")
      .eq("group_name", group)
      .eq("key", key)
      .maybeSingle();

    if (!row) return;

    const { error } = await supabase.from("preset_chips").update({ chips: next }).eq("id", row.id);
    if (error) {
      setBoardError("Could not save preset chips.");
      loadBoard();
    }
  };

  const syncSquare = async () => {
    setSyncing(true);
    setBoardError("");
    setBoardNotice("");
    try {
      const {
        data: { session: s },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/square/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${s?.access_token || ""}`,
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let json = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error("Square sync failed. Try again.");
        }
      } else if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Sign in to sync from Square."
            : res.status === 404
              ? "Square sync is unavailable right now."
              : "Square sync failed. Try again."
        );
      }

      if (!res.ok || !json?.ok) {
        const msg = json?.error || "Square sync failed";
        throw new Error(json?.hint || msg);
      }

      const warnings = json.warnings || [];
      if (json.bookingsFound === 0) {
        setBoardNotice(warnings[0] || "Sync completed but found 0 bookings in Square.");
      } else if (warnings.length) {
        setBoardNotice(
          `Synced ${json.upserted} appointment(s) from ${json.bookingsFound} booking(s). ${warnings.join(" ")}`
        );
      } else {
        setBoardNotice(
          `Synced ${json.upserted} appointment(s) from ${json.bookingsFound} booking(s).`
        );
      }

      if (boardMode === "due") await loadDueDogs();
      else await loadBoard();
    } catch (e) {
      setBoardNotice("");
      setBoardError(e.message || "Square sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const registerEdit = useCallback((key, active) => {
    if (active) editGuardRef.current.start(key);
    else editGuardRef.current.end(key);
  }, []);

  const liveBadgeOn =
    liveSyncEnabled && (isRealtimeLive(realtimeStatus) || realtimeStatus === "CONNECTING");
  const liveBadgeColor = liveBadgeOn ? "green" : "amber";
  const liveBadgeLabel = liveSyncEnabled
    ? isRealtimeLive(realtimeStatus)
      ? "LIVE"
      : "SYNC"
    : "PAUSED";

  return {
    dogs,
    dueDogs,
    boardMode,
    setBoardMode,
    presets,
    boardLoading,
    boardError,
    boardNotice,
    syncing,
    photoUploading,
    liveSyncEnabled,
    toggleLiveSync,
    liveBadgeOn,
    liveBadgeColor,
    liveBadgeLabel,
    realtimeStatus,
    lastSyncedAt,
    update,
    setStatus,
    uploadPhoto,
    addPreset,
    removePreset,
    markCollected,
    syncSquare,
    registerEdit,
  };
}
