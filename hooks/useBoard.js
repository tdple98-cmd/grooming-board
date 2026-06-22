import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayMelbourneDateString } from "../lib/dates";
import { chipsToPresets, patchToDb, rowToBoardDog } from "../lib/boardData";

const DEFAULT_PRESETS = {
  today: { cut: [], watch: [], svc: [] },
  specs: { coat: [], temperament: [] },
};

export function useBoard(session) {
  const [dogs, setDogs] = useState([]);
  const [presets, setPresets] = useState(DEFAULT_PRESETS);
  const [boardLoading, setBoardLoading] = useState(true);
  const [boardError, setBoardError] = useState("");
  const [syncing, setSyncing] = useState(false);

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

    const dogIds = [...new Set((appointments || []).map((a) => a.dog_id).filter(Boolean))];
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

    setDogs((appointments || []).map((a) => rowToBoardDog(a, visitByDog[a.dog_id])));
    setPresets(chipsToPresets(chipRows));
  }, [session]);

  useEffect(() => {
    if (!session) {
      setDogs([]);
      setBoardLoading(false);
      return;
    }

    let mounted = true;
    setBoardLoading(true);

    loadBoard()
      .catch((e) => {
        if (mounted) setBoardError(e.message || "Could not load board data.");
      })
      .finally(() => {
        if (mounted) setBoardLoading(false);
      });

    const channel = supabase
      .channel("board-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => loadBoard())
      .on("postgres_changes", { event: "*", schema: "public", table: "dogs" }, () => loadBoard())
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, () => loadBoard())
      .on("postgres_changes", { event: "*", schema: "public", table: "preset_chips" }, () => loadBoard())
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [session, loadBoard]);

  const persistPatch = async (id, patch, current) => {
    const { appt, dog } = patchToDb(patch, current);

    if (Object.keys(appt).length) {
      const { error } = await supabase.from("appointments").update(appt).eq("id", id);
      if (error) throw error;
    }
    if (Object.keys(dog).length && current.dogId) {
      const { error } = await supabase.from("dogs").update(dog).eq("id", current.dogId);
      if (error) throw error;
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
        photo_url: current.groomPhoto ? "pending" : null,
      });
      if (error) throw error;
    }
  };

  const update = (id, patch) => {
    const current = dogs.find((d) => d.id === id);
    if (!current) return;

    setDogs((p) => p.map((d) => (d.id === id ? { ...d, ...patch } : d)));
    persistPatch(id, patch, current).catch(() => {
      setBoardError("Could not save changes. Refresh to retry.");
      loadBoard();
    });
  };

  const setStatus = (id, v) => {
    const current = dogs.find((d) => d.id === id);
    if (!current) return;
    const patch = { status: v };
    if (v === "checkedin" && !current.checkedInAt) patch.checkedInAt = Date.now();
    update(id, patch);
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
      await loadBoard();
    } catch (e) {
      setBoardError(e.message || "Square sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return {
    dogs,
    presets,
    boardLoading,
    boardError,
    syncing,
    update,
    setStatus,
    addPreset,
    removePreset,
    syncSquare,
  };
}
