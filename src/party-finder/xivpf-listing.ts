// xivpf.com's listings (GET https://xivpf.com/api/listings, the Remote Party
// Finder server: https://github.com/zeroeightysix/remote-party-finder) and
// the smaller shape the site sends the Party Finder page.

type Text = Partial<Record<'en' | 'ja' | 'de' | 'fr', string>>;

// One entry of xivpf's answer, with the fields the site reads.
interface XivpfListing {
  updated_at: string;
  listing: {
    id: number;
    recruiter: string;
    description: Text;
    created_world: {id: number; name: string};
    home_world: {id: number; name: string};
    category: string;
    duty_info: {name: Text; high_end: boolean} | null;
    beginners_welcome: boolean;
    seconds_remaining: number;
    min_item_level: number;
    num_parties: number;
    objective: {duty_completion: boolean; practice: boolean; loot: boolean};
    conditions: {duty_complete: boolean};
    loot_rules: {greed_only: boolean; lootmaster: boolean};
    search_area: {world: boolean; one_player_per_job: boolean};
    // The jobs each slot accepts, and who's in it (a job code, or null).
    slots: string[][];
    slots_filled: (string | null)[];
  };
}

type Role = 'tank' | 'healer' | 'dps';

// A slot in a party: who's in it, or the roles it's open to.
interface Slot {
  job: string | null;
  roles: Role[];
}

// A listing as the Party Finder page shows it.
interface PartyFinderListing {
  id: string;
  recruiter: string;
  description: string;
  world: {id: number; name: string};
  homeWorld: {id: number; name: string};
  // xivpf's category name, e.g. "HighEndDuty", "TheHunt", or "None".
  category: string;
  // The duty's English name; null when the listing has none.
  duty: string | null;
  highEnd: boolean;
  // Only joinable from its own world (the Hunt, FATEs...).
  worldOnly: boolean;
  onePlayerPerJob: boolean;
  beginnersWelcome: boolean;
  minItemLevel: number;
  objective: 'completion' | 'practice' | 'loot' | null;
  dutyComplete: boolean;
  loot: 'normal' | 'greed-only' | 'lootmaster';
  parties: number;
  slots: Slot[];
  updatedAt: string;
  // When the recruiter's time runs out, as last seen.
  expiresAt: string;
}

const TANKS = new Set(['GLA', 'PLD', 'MRD', 'WAR', 'DRK', 'GNB']);
const HEALERS = new Set(['CNJ', 'WHM', 'SCH', 'AST', 'SGE']);

function roleOf(job: string): Role {
  if (TANKS.has(job)) return 'tank';
  if (HEALERS.has(job)) return 'healer';
  return 'dps';
}

// The roles an open slot takes, in the game's order.
function rolesOf(jobs: string[]): Role[] {
  const roles = new Set(jobs.map(roleOf));
  return (['tank', 'healer', 'dps'] as const).filter(role => roles.has(role));
}

function objectiveOf({objective}: XivpfListing['listing']) {
  if (objective.duty_completion) return 'completion';
  if (objective.practice) return 'practice';
  if (objective.loot) return 'loot';
  return null;
}

function lootOf({loot_rules}: XivpfListing['listing']) {
  if (loot_rules.lootmaster) return 'lootmaster';
  if (loot_rules.greed_only) return 'greed-only';
  return 'normal';
}

function toListing({updated_at, listing}: XivpfListing): PartyFinderListing {
  const updated = new Date(updated_at);
  return {
    // Listing ids restart with the game's servers: the world keeps them apart.
    id: `${listing.created_world.id}-${listing.id}`,
    recruiter: listing.recruiter,
    description: listing.description.en ?? '',
    world: listing.created_world,
    homeWorld: listing.home_world,
    category: listing.category,
    duty: listing.duty_info?.name.en ?? null,
    highEnd: listing.duty_info?.high_end ?? false,
    worldOnly: listing.search_area.world,
    onePlayerPerJob: listing.search_area.one_player_per_job,
    beginnersWelcome: listing.beginners_welcome,
    minItemLevel: listing.min_item_level,
    objective: objectiveOf(listing),
    dutyComplete: listing.conditions.duty_complete,
    loot: lootOf(listing),
    parties: listing.num_parties,
    slots: listing.slots_filled.map((job, i) => ({
      job,
      roles: job ? [] : rolesOf(listing.slots[i] ?? []),
    })),
    updatedAt: updated.toISOString(),
    expiresAt: new Date(
      updated.getTime() + listing.seconds_remaining * 1000,
    ).toISOString(),
  };
}

export {PartyFinderListing, Role, Slot, XivpfListing, toListing};
