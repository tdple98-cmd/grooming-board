import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayMelbourneDateString } from "../lib/dates";
import { chipsToPresets, patchToDb, rowToBoardDog } from "../lib/boardData";
import { uploadGroomPhoto, getGroomPhotoSignedUrl, signPhotoPathMap } from "../lib/groomPhotos.js";
import { computeDueToRebook, dueEntryToBoardDog } from "../lib/dueToRebook.js";

const DEFAULT_PRESETS = {
  today: { cut: [], watch: [], svc: [] },
  specs: { coat: [], temperament: [] },
};

async function attachPhotoUrls(rows) {
  const paths = [];
  for (const row of rows) {
    if (row.groomPhotoPath) paths.push(row.groomPhotoPath);
    if (row.lastVisit?.photoPath) paths.push(row.lastVisit.photoPath);
  }
  const map = await signPhotoPathMap(paths);
  return rows.map((row) => ({
    ...row,
    groomPhotoUrl: row.groomPhotoPath ? map[row.groomPhotoPath] || null : null,
    lastVisit: row.lastVisit
      ? {
          ...row.lastVisit,
          photoUrl: row.lastVisit.photoPath ? map[row.lastVisit.photoPath] || null : null,
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

  const loadBoard = useCallback(async () => {
    if (!session) return;
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
    setPresets(chipsToPresets(chipRows));
  }, [session]);

  const loadDueDogs = useCallback(async () => {
    if (!session) return;
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
  }, [session]);

  useEffect(() => {
    if (!session) {
      setDogs([]);
      setDueDogs([]);
      setBoardLoading(false);
      return;
    }

    let mounted = true;
    setBoardLoading(true);

    const load = boardMode === "due" ? loadDueDogs() : loadBoard();

    load
      .catch((e) => {
        if (mounted) setBoardError(e.message || "Could not load board data.");
      })
      .finally(() => {
        if (mounted) setBoardLoading(false);
      });

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        if (boardMode === "due") loadDueDogs();
        else loadBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dogs" }, () => {
        if (boardMode === "due") loadDueDogs();
        else loadBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => {
        if (boardMode === "due") loadDueDogs();
        else loadBoard();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "preset_chips" }, () => loadBoard())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [session, boardMode, loadBoard, loadDueDogs]);

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
      const { error } = await supabase.from("visits").insert({
        dog_id: current.dogId,
        appointment_id: id,
        visit_date: todayMelbourneDateString(),
        groomer: current.groomer || null,
        service: current.service || null,
        did: [current.today?.cut, current.today?.svc].filter(Boolean).join(" · ") || null,
        duration: null,
        note: current.today?.watch || null,
        photo_url: current.groomPhotoPath || null,
      });
      if (error) throw error;
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
    setPhotoUploading(true);
    setBoardError("");
    try {
      const path = await uploadGroomPhoto({
        dogId: current.dogId,
        appointmentId,
        file,
      });
      const url = await getGroomPhotoSignedUrl(path, 7200);
      const patch = { groomPhotoPath: path, groomPhotoUrl: url };
      const merged = { ...current, ...patch };
      setDogs((p) => p.map((d) => (d.id === appointmentId ? merged : d)));
      await persistPatch(appointmentId, patch, merged);
    } catch (e) {
      setBoardError(e.message || "Could not upload photo.");
      loadBoard();
    } finally {
      setPhotoUploading(false);
    }
  };

  const addPreset = async (group, key, chip) => {
    const v = (chip || "").trim();
    if (!v) return;
    const next = [...presets[group][key], v];
    setPresets((p) => ({ ...p, [group]: { ...p[group], [key]: next } }));

    const { error } = await supabase
      .from("preset_chips")
      .update({ chips: next })
      .eq("group_name", group)
      .eq("key", key);
    if (error) {
      setBoardError("Could not save preset chips.");
      loadBoard();
    }
  };

  const removePreset = async (group, key, chip) => {
    const next = presets[group][key].filter((x) => x !== chip);
    setPresets((p) => ({ ...p, [group]: { ...p[group], [key]: next } }));

    const { error } = await supabase
      .from("preset_chips")
      .update({ chips: next })
      .eq("group_name", group)
      .eq("key", key);
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
    syncSquare,
  };
}
