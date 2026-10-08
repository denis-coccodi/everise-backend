// What a listing is for, put right, and the game's job ids.
//
// xivpf's API names every listing's duty from the game's duty list
// (ContentFinderCondition), even when the number means something else:
// for a Treasure Hunt it's the map, for a Deep Dungeon the dungeon, for a
// Duty Roulette the roulette. Its website looks these up properly, its API
// doesn't (zeroeightysix/remote-party-finder issues #14 and #22), so a map
// listing reads "The Stone Vigil (Hard)". Only "Normal" listings' names
// are right; for the others the number is read back from the wrong name
// and looked up here. Unknown numbers (maps newer than this list) give no
// name, and the page shows the category instead.

// The first duties of the game's duty list, by name: the numbers the other
// lists use stay below 46.
const DUTY_NUMBERS = new Map<string, number>([
  ['The Thousand Maws of Toto-Rak', 1],
  ['The Tam-Tara Deepcroft', 2],
  ['Copperbell Mines', 3],
  ['Sastasha', 4],
  ['The Aurum Vale', 5],
  ['Haukke Manor', 6],
  ['Halatali', 7],
  ["Brayflox's Longstop", 8],
  ['The Sunken Temple of Qarn', 9],
  ["The Wanderer's Palace", 10],
  ['The Stone Vigil', 11],
  ["Cutter's Cry", 12],
  ['Dzemael Darkhold', 13],
  ['Amdapor Keep', 14],
  ['Castrum Meridianum', 15],
  ['The Praetorium', 16],
  ['Pharos Sirius', 17],
  ['Copperbell Mines (Hard)', 18],
  ['Haukke Manor (Hard)', 19],
  ["Brayflox's Longstop (Hard)", 20],
  ['Halatali (Hard)', 21],
  ['The Lost City of Amdapor', 22],
  ['Hullbreaker Isle', 23],
  ['The Tam-Tara Deepcroft (Hard)', 24],
  ['The Stone Vigil (Hard)', 25],
  ['The Sunken Temple of Qarn (Hard)', 26],
  ['Snowcloak', 27],
  ['Sastasha (Hard)', 28],
  ['Amdapor Keep (Hard)', 29],
  ["The Wanderer's Palace (Hard)", 30],
  ['The Great Gubal Library', 31],
  ['The Keeper of the Lake', 32],
  ['Neverreap', 33],
  ['The Vault', 34],
  ['The Fractal Continuum', 35],
  ['The Dusk Vigil', 36],
  ['Sohm Al', 37],
  ['The Aetherochemical Research Facility', 38],
  ['The Aery', 39],
  ['Pharos Sirius (Hard)', 40],
  ["Saint Mocianne's Arboretum", 41],
  ['Basic Training: Enemy Parties', 42],
  ['Under the Armor', 43],
  ['Basic Training: Enemy Strongholds', 44],
  ['Hero on the Half Shell', 45],
]);

// The Party Finder's treasure maps, in its own order (0: any map).
const TREASURE_MAPS: Record<number, string> = {
  1: 'Leather Treasure Map',
  2: 'Leather Treasure Map',
  3: 'Goatskin Treasure Map',
  4: 'Toadskin Treasure Map',
  5: 'Boarskin Treasure Map',
  6: 'Peisteskin Treasure Map',
  7: 'Leather Buried Treasure Map',
  8: 'Archaeoskin Treasure Map',
  9: 'Wyvernskin Treasure Map',
  10: 'Dragonskin Treasure Map',
  11: 'Gaganaskin Treasure Map',
  12: 'Gazelleskin Treasure Map',
  13: 'Seemingly Special Treasure Map',
  14: 'Gliderskin Treasure Map',
  15: 'Zonureskin Treasure Map',
  16: 'Ostensibly Special Treasure Map',
  17: 'Saigaskin Treasure Map',
  18: 'Kumbhiraskin Treasure Map',
  19: 'Ophiotauroskin Treasure Map',
  20: 'Potentially Special Treasure Map',
  21: 'Conceivably Special Treasure Map',
  22: 'Loboskin Treasure Map',
  23: "Br'aaxskin Treasure Map",
  24: 'Gargantuaskin Treasure Map',
};

// The deep dungeons, by the numbers the game has used for them.
const DEEP_DUNGEONS: Record<number, string> = {
  1: 'The Palace of the Dead',
  2: 'Heaven-on-High',
  29: 'The Palace of the Dead',
  30: 'Heaven-on-High',
  31: 'Eureka Orthos',
  32: "Pilgrim's Traverse",
};

// The duty roulettes (the game's ContentRoulette sheet).
const ROULETTES: Record<number, string> = {
  1: 'Duty Roulette: Leveling',
  2: 'Duty Roulette: High-level Dungeons',
  3: 'Duty Roulette: Main Scenario',
  4: 'Duty Roulette: Guildhests',
  5: 'Duty Roulette: Expert',
  6: 'Duty Roulette: Trials',
  7: 'Daily Challenge: Frontline',
  8: 'Duty Roulette: Level Cap Dungeons',
  9: 'Duty Roulette: Mentor',
  15: 'Duty Roulette: Alliance Raids',
  17: 'Duty Roulette: Normal Raids',
  40: 'Crystalline Conflict (Casual Match)',
  41: 'Crystalline Conflict (Ranked Match)',
};

// A listing's duty, as the Party Finder names it, or null when it has none
// (or it can't be told).
function dutyName(
  dutyType: string,
  category: string,
  xivpfName: string | undefined,
): string | null {
  if (dutyType === 'Normal') return xivpfName ?? null;
  const number = xivpfName ? DUTY_NUMBERS.get(xivpfName) : undefined;
  if (number === undefined) return null;
  if (dutyType === 'Roulette') return ROULETTES[number] ?? null;
  if (category === 'TreasureHunt') return TREASURE_MAPS[number] ?? null;
  if (category === 'DeepDungeon') return DEEP_DUNGEONS[number] ?? null;
  return null;
}

// The game's ClassJob ids, by abbreviation: classes and combat jobs.
const JOB_IDS: Record<string, number> = {
  GLA: 1,
  PGL: 2,
  MRD: 3,
  LNC: 4,
  ARC: 5,
  CNJ: 6,
  THM: 7,
  PLD: 19,
  MNK: 20,
  WAR: 21,
  DRG: 22,
  BRD: 23,
  WHM: 24,
  BLM: 25,
  ACN: 26,
  SMN: 27,
  SCH: 28,
  ROG: 29,
  NIN: 30,
  MCH: 31,
  DRK: 32,
  AST: 33,
  SAM: 34,
  RDM: 35,
  BLU: 36,
  GNB: 37,
  DNC: 38,
  RPR: 39,
  SGE: 40,
  VPR: 41,
  PCT: 42,
  BST: 43,
};

// A job's framed, role-coloured icon (the duty data's images keep it), as
// the in-game Party Finder shows it.
const JOB_ICON_BASE = 62100;

function jobIcon(job: string) {
  const id = JOB_IDS[job];
  return id ? JOB_ICON_BASE + id : null;
}

// The Party Finder's own icons: an open slot's roles, and the sprout of a
// listing that welcomes beginners (the "New Adventurer" status).
const PARTY_FINDER_ICONS = {
  tank: 62581,
  healer: 62582,
  dps: 62583,
  beginner: 61523,
};

// The game's duty type icons (ContentType sheet), by Party Finder category:
// a listing's duty gives its own (an ultimate's, an extreme's), these are
// for listings whose duty isn't in the duty data (maps, FATEs, the Hunt...).
const CATEGORY_ICONS: Record<string, number> = {
  DutyRoulette: 61807,
  Dungeon: 61801,
  Guildhest: 61803,
  Trial: 61804,
  Raid: 61802,
  HighEndDuty: 61802,
  PvP: 61806,
  GoldSaucer: 61820,
  Fate: 61809,
  TreasureHunt: 61808,
  TheHunt: 61819,
  GatheringForay: 61815,
  DeepDungeon: 61824,
  FieldOperation: 61838,
  VariantAndCriterionDungeon: 61846,
};

function categoryIcon(category: string): number | null {
  return CATEGORY_ICONS[category] ?? null;
}

// xivpf's categories (the game's Party Finder tabs), as the site names them
// (the frontend's listing-filters.ts too).
const CATEGORY_NAMES: Record<string, string> = {
  DutyRoulette: 'Duty Roulette',
  Dungeon: 'Dungeons',
  Guildhest: 'Guildhests',
  Trial: 'Trials',
  Raid: 'Raids',
  HighEndDuty: 'High-end Duty',
  PvP: 'PvP',
  GoldSaucer: 'Gold Saucer',
  Fate: 'FATEs',
  TreasureHunt: 'Treasure Hunt',
  TheHunt: 'The Hunt',
  GatheringForay: 'Gathering Forays',
  DeepDungeon: 'Deep Dungeons',
  FieldOperation: 'Field Operations',
  VariantAndCriterionDungeon: 'V&C Dungeons',
  None: 'No duty',
};

// What a listing is for: its duty, or its category without one.
function listingName(listing: {duty: string | null; category: string}) {
  return listing.duty ?? CATEGORY_NAMES[listing.category] ?? listing.category;
}

// Every icon the Party Finder page shows that the duty data may not have
// already (it keeps the jobs' and its duty types' icons): the classes',
// the above and the categories'. The duty data's refresh downloads them
// with its own (GET /api/images/:id).
const PARTY_FINDER_IMAGES = [
  ...new Set([
    ...['GLA', 'PGL', 'MRD', 'LNC', 'ARC', 'CNJ', 'THM', 'ACN', 'ROG'].map(
      code => JOB_ICON_BASE + JOB_IDS[code],
    ),
    ...Object.values(PARTY_FINDER_ICONS),
    ...Object.values(CATEGORY_ICONS),
  ]),
];

export {
  PARTY_FINDER_ICONS,
  PARTY_FINDER_IMAGES,
  categoryIcon,
  dutyName,
  jobIcon,
  listingName,
};
