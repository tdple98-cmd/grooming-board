import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayMelbourneDateString, formatVisitDate } from "../lib/dates";
import { chipsToPresets, patchToDb, rowToBoardDog } from "../lib/boardData";
import { defaultPresetsFromDefinitions, mergePresetsWithDefaults } from "../lib/presetChipDefaults.js";
import { uploadGroomPhoto, getGroomPhotoDisplayUrl, signPhotoPathMap } from "../lib/groomPhotos.js";
import { computeDueToRebook, dueEntryToBoardDog } from "../lib/dueToRebook.js";

const DEFAULT_PRESETS = defaultPresetsFromDefinitions();

async function attachPhotoUrls(rows) {
  const paths = [];
  for (const row of rows) {
    if (row.groomPhotoPath) paths.push(row.groomPhotoPath);
    if (row.lastVisit?.photoPath) paths.push(row.lastVisit.photoPath);
  }
  const map = await signPhotoPathMap(paths);
  return rows.map((row) => ({
    ...row,
    groomPhotoUrl: row.groomPhotoPath
      ? map[row.groomPhotoPath] || row.groomPhotoUrl || null
      : row.groomPhotoUrl || null,
    lastVisit: row.lastVisit
      ? {
          ...row.lastVisit,
          photoUrl: row.lastVisit.photoPath
            ? map[row.lastVisit.photoPath] || row.lastVisit.photoUrl || null
            : row.lastVisit.photoUrl || null,
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
  const boardModeRef = useRef(boardMode);
  const loadedForUserRef = useRef(null);

  boardModeRef.current = boardMode;

  const loadBoard = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    setBoardError("");
    const date = todayMelbourneDateString();

    const { data: appointments, error: apptErr } = await supabase
      .from("appointments")
      .select("*, dogs(*)")
      .eq("appointment_date", date)
      .order("band", { ascending: true });

    if (apptErr) throw apptErr;

    const todayRows = (appointments || []).filter(
      (a) => String(a.appointment_date).slice(0, 10) === date
    );

    const dogIds = [...new Set(todayRows.map((a) => a.dog_id).filter(Boolean))];
    let visitByDog = {};

    if (dogIds.length) {
      const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("*")
        .in("dog_id", dogIds)
        .order("visit_date", { ascending: false });

      if (visitErr) throw visitErr;
      for (const v of visits || []) {
        if (!visitByDog[v.dog_id]) visitByDog[v.dog_id] = v;
      }
    }

    const { data: chipRows, error: chipErr } = await supabase
      .from("preset_chips")
      .select("*");

    if (chipErr) throw chipErr;

    const mapped = todayRows.map((a) => rowToBoardDog(a, visitByDog[a.dog_id]));
    setDogs(await attachPhotoUrls(mapped));
    setPresets(mergePresetsWithDefaults(chipsToPresets(chipRows)));
  }, []);

  const loadDueDogs = useCallback(async () => {
    const { data: { session: s } } = await supabase.auth.getSession();
    if (!s) return;
    setBoardError("");
    const today = todayMelbourneDateString();

    const { data: appointments, error: apptErr } = await supabase
      .from("appointments")
      .select("appointment_date, service, dog_id, dogs(*)");

    if (apptErr) throw apptErr;

    const dueEntries = computeDueToRebook(appointments, today);
    const dogIds = dueEntries.map((e) => e.dogId);
    let visitByDog = {};

    if (dogIds.length) {
      const { data: visits, error: visitErr } = await supabase
        .from("visits")
        .select("*")
        .in("dog_id", dogIds)
        .order("visit_date", { ascending: false });

      if (visitErr) throw visitErr;
      for (const v of visits || []) {
        if (!visitByDog[v.dog_id]) visitByDog[v.dog_id] = v;
      }
    }

    const mapped = dueEntries.map((e) => dueEntryToBoardDog(e, visitByDog[e.dogId]));
    setDueDogs(await attachPhotoUrls(mapped));
  }, []);

  const refreshBoard = useCallback(() => {
    const load = boardModeRef.current === "due" ? loadDueDogs : loadBoard;
    load().catch((e) => setBoardError(e.message || "Could not refresh board data."));
  }, [loadBoard, loadDueDogs]);

  useEffect(() => {
    const userId = session?.user?.id;

    if (!userId) {
      setDogs([]);
      setDueDogs([]);
      setBoardLoading(false);
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

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, refreshBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "dogs" }, refreshBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, refreshBoard)
      .on("postgres_changes", { event: "*", schema: "public", table: "preset_chips" }, () => {
        loadBoard().catch(() => {});
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadBoard, loadDueDogs, refreshBoard]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      Promise.all([loadBoard(), loadDueDogs()]).catch(() => {});
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [session?.user?.id, loadBoard, loadDueDogs]);

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
      const { data: { session: s } } = await supabase.auth.getSession();
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
      await loadBoard();
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
    persistPatch(id, patch, merged)
      .then(async () => {
        if (patch.collected === true) await loadBoard();
      })
      .catch((e) => {
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
      try {
        url = await getGroomPhotoDisplayUrl(path, 7200);
      } catch (e) {
        setBoardError(
          (e.message || "Photo saved but could not load preview.") +
            " Check Supabase Storage RLS for groom-photos."
        );
      }
      const patch = {
        groomPhotoPath: path,
        groomPhotoUrl: url || previewUrl,
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

    const { error } = await supabase
      .from("preset_chips")
      .update({ chips: next })
      .eq("id", row.id);
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
      const { data: { session: s } } = await supabase.auth.getSession();
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
        setBoardNotice(`Synced ${json.upserted} appointment(s) from ${json.bookingsFound} booking(s).`);
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
    update,
    setStatus,
    uploadPhoto,
    addPreset,
    removePreset,
    markCollected,
    syncSquare,
  };
}
