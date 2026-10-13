// Each duty group's id, fixed once given so links that name groups by id
// (the roulette's query string) keep working when groups are added,
// reordered or renamed. Never reuse or change an id; give a new group the
// next free number.
const GROUP_IDS: Record<string, number> = {
  Dungeons: 1,
  Guildhests: 2,
  'Trials — Normal': 3,
  'Trials — Extreme': 4,
  'Trials — Unreal': 5,
  'Raids — Normal': 6,
  'Raids — Savage': 7,
  'Raids — Ultimate': 8,
  'Alliance Raids': 9,
  'Alliance Raids — Chaotic': 10,
  'Variant & Criterion Dungeons': 11,
  'Deep Dungeons': 12,
  'Field Operations': 13,
  'Treasure Hunt': 14,
  PvP: 15,
  'Gold Saucer': 16,
};

// Groups named after a content type the table doesn't know yet (one the
// game adds) get an id from their name, from 1000 up, until one is listed.
const UNLISTED_FROM = 1000;
const UNLISTED_RANGE = 1_000_000;

function groupId(name: string): number {
  const listed = GROUP_IDS[name];
  if (listed !== undefined) return listed;
  // FNV-1a: stable across runs, so the id stays the same between refreshes.
  let hash = 0x811c9dc5;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return UNLISTED_FROM + (hash % UNLISTED_RANGE);
}

export {GROUP_IDS, groupId};
