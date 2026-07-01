/** Default one-tap chip lists (merged with Supabase preset_chips on load). */

export const CUT_STYLE_CHIPS = [
  "Short Ears",
  "Short Face",
  "Short Head",
  "Matted/Shave",
  "Shorter all over",
  "Longer all over",
  "Teddy bear face",
  "Clean face",
  "Short legs",
  "Longer legs",
  "Puppy cut",
  "Kennel / summer clip",
  "Topknot",
  "Tail – pom",
  "Tail – natural",
  "Hand-scissored finish",
  "Tidy only",
  "Sanitary trim",
  "Paw / pad tidy",
];

export const WATCH_CHIPS = [
  "Nervous / anxious",
  "Bites / snappy",
  "Aggressive",
  "Senior – gentle",
  "Matted",
  "Always Matted",
  "Skin irritation",
  "Move around a lot",
  "Not good around other dogs",
  "Puppy – first groom",
  "Fearful / shy",
  "Needs muzzle",
  "Doesn't like face",
  "Doesn't like feet / nails",
  "Doesn't like dryer",
  "Doesn't like water",
  "Vocal / barky",
  "Wriggly",
  "Arthritis / joint pain",
  "Sensitive skin",
  "Ear infection / dirty ears",
  "Eye discharge / stains",
  "Lump or bump noted",
  "Toilets during groom",
  "Fleas / ticks seen",
];

export const SERVICE_CHIPS = [
  "Wash & Tidy",
  "Full Groom",
  "Upgrade to Full",
  "Style Trim",
  "Asian Style",
  "+ Teeth clean",
  "+ Nail grind",
  "+ Ear Clean",
  "+ De-shed",
  "Bath & blow-dry",
  "Puppy groom",
  "Nail trim (clippers)",
  "Anal glands",
  "Face/feet/tail tidy",
  "+ Conditioning treatment",
  "+ Medicated / flea shampoo",
  "+ De-matting (note time/fee)",
  "+ Hand strip",
  "+ Colour / chalk",
  "+ Cologne / spritz",
  "+ Bow / bandana",
];

export const COAT_CHIPS = [
  "Wavy",
  "Straight",
  "Wool",
  "Fleece",
  "Fine / thin",
  "Thick / dense",
  "Double coat",
];

export const TEMPERAMENT_SPEC_CHIPS = [
  "Calm / easy",
  "Friendly, wriggly",
  "Nervous",
  "Anxious at dryer",
  "Snappy – care",
  "Senior",
  "Food motivated",
  "Aggressive",
];

export const HEALTH_CHIPS = [
  "Allergy noted",
  "Medication",
  "Skin condition",
  "Ear issues",
  "Sensitive areas",
];

export const FLAG_NEXT_TIME_CHIPS = [
  "Found matting – recommend shorter cycle",
  "Recommend more frequent visits",
  "Skin issue – suggest vet",
  "Nails very long",
  "Ears need plucking",
  "Owner wants different style next time",
  "Pre-book recommended",
];

/** All preset_chips rows and their default chip lists. */
export const PRESET_CHIP_DEFINITIONS = [
  { group_name: "today", key: "cut", chips: CUT_STYLE_CHIPS },
  { group_name: "today", key: "watch", chips: WATCH_CHIPS },
  { group_name: "today", key: "svc", chips: SERVICE_CHIPS },
  { group_name: "specs", key: "cut", chips: CUT_STYLE_CHIPS },
  { group_name: "specs", key: "coat", chips: COAT_CHIPS },
  { group_name: "specs", key: "temperament", chips: TEMPERAMENT_SPEC_CHIPS },
  { group_name: "specs", key: "health", chips: HEALTH_CHIPS },
  { group_name: "specs", key: "flag", chips: FLAG_NEXT_TIME_CHIPS },
];

export function mergeChipLists(defaults, existing = []) {
  const seen = new Set((existing || []).map((c) => c.trim().toLowerCase()).filter(Boolean));
  const out = [...(existing || [])];
  for (const chip of defaults) {
    const key = chip.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(chip);
  }
  return out;
}

export function defaultPresetsFromDefinitions() {
  const presets = {
    today: { cut: [], watch: [], svc: [] },
    specs: { cut: [], coat: [], temperament: [], health: [], flag: [] },
  };
  for (const def of PRESET_CHIP_DEFINITIONS) {
    if (def.group_name === "today" && presets.today[def.key] !== undefined) {
      presets.today[def.key] = [...def.chips];
    }
    if (def.group_name === "specs" && presets.specs[def.key] !== undefined) {
      presets.specs[def.key] = [...def.chips];
    }
  }
  return presets;
}

export function mergePresetsWithDefaults(loaded) {
  const base = defaultPresetsFromDefinitions();
  return {
    today: {
      cut: mergeChipLists(base.today.cut, loaded?.today?.cut),
      watch: mergeChipLists(base.today.watch, loaded?.today?.watch),
      svc: mergeChipLists(base.today.svc, loaded?.today?.svc),
    },
    specs: {
      cut: mergeChipLists(base.specs.cut, loaded?.specs?.cut),
      coat: mergeChipLists(base.specs.coat, loaded?.specs?.coat),
      temperament: mergeChipLists(base.specs.temperament, loaded?.specs?.temperament),
      health: mergeChipLists(base.specs.health, loaded?.specs?.health),
      flag: mergeChipLists(base.specs.flag, loaded?.specs?.flag),
    },
  };
}
