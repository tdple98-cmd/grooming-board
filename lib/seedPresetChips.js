import { PRESET_CHIP_DEFINITIONS, mergeChipLists } from "./presetChipDefaults.js";

/** Ensure preset_chips rows exist and include all default suggestions (keeps custom chips). */
export async function ensurePresetChips(supabase) {
  for (const def of PRESET_CHIP_DEFINITIONS) {
    const { data, error } = await supabase
      .from("preset_chips")
      .select("id, chips")
      .eq("group_name", def.group_name)
      .eq("key", def.key)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const { error: insErr } = await supabase.from("preset_chips").insert({
        group_name: def.group_name,
        key: def.key,
        chips: def.chips,
      });
      if (insErr) throw insErr;
      continue;
    }

    const merged = mergeChipLists(def.chips, data.chips || []);
    const prev = JSON.stringify(data.chips || []);
    const next = JSON.stringify(merged);
    if (prev !== next) {
      const { error: updErr } = await supabase
        .from("preset_chips")
        .update({ chips: merged })
        .eq("id", data.id);
      if (updErr) throw updErr;
    }
  }
}
