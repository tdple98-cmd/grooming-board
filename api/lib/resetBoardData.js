import { createClient } from "@supabase/supabase-js";
import { shiftMelbourneDateString } from "../../lib/dates.js";
import { syncSquareToSupabase, getHistorySyncWindow } from "./syncSquareToSupabase.js";

const BUCKET = "groom-photos";

async function countTable(supabase, table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count ?? 0;
}

async function deleteAllRows(supabase, table) {
  const { error } = await supabase.from(table).delete().not("id", "is", null);
  if (error) throw new Error(`${table} delete: ${error.message}`);
}

async function listStoragePaths(supabase, prefix = "") {
  const paths = [];
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) {
    if (error.message?.includes("not found") || error.message?.includes("Bucket")) return paths;
    throw error;
  }
  for (const item of data || []) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      paths.push(...(await listStoragePaths(supabase, path)));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

async function emptyPhotoBucket(supabase) {
  const paths = await listStoragePaths(supabase);
  if (!paths.length) return 0;
  const batchSize = 100;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`storage delete: ${error.message}`);
  }
  return paths.length;
}

/**
 * Wipe Supabase board data (not Square). Keeps staff_profiles + preset_chips.
 * Optionally backfill Square appointments (90 days back by default).
 */
export async function resetBoardAndSync({
  supabaseUrl,
  serviceRoleKey,
  accessToken,
  environment = "production",
  dryRun = false,
  syncAfterWipe = true,
  syncDaysBack = 90,
  syncDaysForward = 7,
}) {
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const before = {
    visits: await countTable(supabase, "visits"),
    appointments: await countTable(supabase, "appointments"),
    dogs: await countTable(supabase, "dogs"),
    staff: await countTable(supabase, "staff_profiles"),
    presets: await countTable(supabase, "preset_chips"),
  };

  let groomPhotos = 0;
  try {
    groomPhotos = (await listStoragePaths(supabase)).length;
  } catch {
    groomPhotos = 0;
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      before: { ...before, groomPhotos },
      kept: ["staff_profiles", "preset_chips", "auth.users"],
    };
  }

  await deleteAllRows(supabase, "visits");
  await deleteAllRows(supabase, "appointments");
  await deleteAllRows(supabase, "dogs");
  const groomPhotosRemoved = await emptyPhotoBucket(supabase);

  const afterWipe = {
    visits: await countTable(supabase, "visits"),
    appointments: await countTable(supabase, "appointments"),
    dogs: await countTable(supabase, "dogs"),
    staff: await countTable(supabase, "staff_profiles"),
    presets: await countTable(supabase, "preset_chips"),
  };

  let sync = null;
  if (syncAfterWipe) {
    process.env.SQUARE_SYNC_DAYS_BACK = String(syncDaysBack);
    process.env.SQUARE_SYNC_DAYS_FORWARD = String(syncDaysForward);
    const window = getHistorySyncWindow();
    const chunkDays = 30;
    const totals = { bookingsFound: 0, upserted: 0, skipped: 0, chunks: 0, chunkErrors: [] };

    for (let offset = 0; offset < window.days; offset += chunkDays) {
      const chunkStart = shiftMelbourneDateString(window.startDate, offset);
      const days = Math.min(chunkDays, window.days - offset);
      const result = await syncSquareToSupabase({
        accessToken,
        environment,
        supabaseUrl,
        serviceRoleKey,
        startDate: chunkStart,
        days,
        purge: false,
      });
      totals.chunks++;
      if (!result.ok) {
        const err = new Error(
          result.squareFetchError ||
            `Square sync failed after wipe (chunk ${totals.chunks}, from ${chunkStart})`
        );
        err.result = { ...result, completedChunks: totals.chunks - 1, partialTotals: totals };
        throw err;
      }
      totals.bookingsFound += result.bookingsFound ?? 0;
      totals.upserted += result.upserted ?? 0;
      totals.skipped += result.skipped ?? 0;
      if (result.errors?.length) {
        totals.chunkErrors.push(...result.errors.slice(0, 3));
      }
    }

    sync = {
      window: { startDate: window.startDate, windowEnd: window.windowEnd, days: window.days },
      bookingsFound: totals.bookingsFound,
      upserted: totals.upserted,
      skipped: totals.skipped,
      chunks: totals.chunks,
    };
  }

  const afterSync = {
    appointments: await countTable(supabase, "appointments"),
    dogs: await countTable(supabase, "dogs"),
    visits: await countTable(supabase, "visits"),
    staff: await countTable(supabase, "staff_profiles"),
  };

  return {
    ok: true,
    dryRun: false,
    before: { ...before, groomPhotos },
    afterWipe: { ...afterWipe, groomPhotosRemoved },
    afterSync,
    sync,
    kept: ["staff_profiles", "preset_chips", "auth.users"],
    note: "Square was read only; no Square data was deleted.",
  };
}
