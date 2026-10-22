// xivpf.com's listings (GET https://xivpf.com/api/listings, the Remote Party
// Finder server: https://github.com/zeroeightysix/remote-party-finder) and
// the smaller shape the site sends the Party Finder page.
import {dutyName, jobIcon} from './xivpf-duties';
import {PartyFinderListing, Role, Slot} from './party-finder-model';
import {XivpfListing} from './xivpf-dto';

const TANKS = new Set(['GLA', 'PLD', 'MRD', 'WAR', 'DRK', 'GNB']);
const HEALERS = new Set(['CNJ', 'WHM', 'SCH', 'AST', 'SGE']);

function roleOf(job: string): Role {
  if (TANKS.has(job)) return 'tank';
  if (HEALERS.has(job)) return 'healer';
  return 'dps';
}

// The jobs an open slot takes, by role, in the game's order.
function acceptsOf(jobs: string[]) {
  return (['tank', 'healer', 'dps'] as const)
    .map(role => ({role, jobs: jobs.filter(job => roleOf(job) === role)}))
    .filter(group => group.jobs.length > 0);
}

// xivpf decodes a slot's jobs from a list older than Beastmaster: an open
// slot only a Beastmaster may join comes with no jobs at all (in the game,
// a DPS slot). Seen on low-level dungeons and raids, where BST can go.
const UNDECODED_SLOT = ['BST'];

function slotOf(job: string | null, accepts: string[]): Slot {
  if (job) return {job, icon: jobIcon(job), roles: [], accepts: []};
  const groups = acceptsOf(accepts.length ? accepts : UNDECODED_SLOT);
  return {
    job: null,
    icon: null,
    roles: groups.map(group => group.role),
    accepts: groups,
  };
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
    // Listing numbers start again when the game's servers restart. The world
    // isn't part of it: xivpf can hold one listing under two worlds.
    id: `${listing.last_server_restart}-${listing.id}`,
    recruiter: listing.recruiter,
    description: listing.description.en ?? '',
    world: listing.created_world,
    homeWorld: listing.home_world,
    category: listing.category,
    duty: dutyName(
      listing.duty_type,
      listing.category,
      listing.duty_info?.name.en,
    ),
    highEnd: listing.duty_type === 'Normal' && !!listing.duty_info?.high_end,
    worldOnly: listing.search_area.world,
    onePlayerPerJob: listing.search_area.one_player_per_job,
    beginnersWelcome: listing.beginners_welcome,
    minItemLevel: listing.min_item_level,
    objective: objectiveOf(listing),
    dutyComplete: listing.conditions.duty_complete,
    loot: lootOf(listing),
    parties: listing.num_parties,
    slots: listing.slots_filled
      .slice(0, listing.slot_count)
      .map((job, i) => slotOf(job, listing.slots[i] ?? [])),
    updatedAt: updated.toISOString(),
    expiresAt: new Date(
      updated.getTime() + listing.seconds_remaining * 1000,
    ).toISOString(),
  };
}

export {toListing};
