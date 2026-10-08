import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {DATA_CENTRE_NAMES} from './data-centres';

const World = z.strictObject({id: z.number().int(), name: z.string()});

const Role = z.enum(['tank', 'healer', 'dps']);

const PartyFinderListing = z.strictObject({
  id: z.string(),
  recruiter: z.string(),
  description: z.string(),
  // The world it was made on (where the party gathers: the game's
  // "Location"), and the recruiter's own.
  world: World,
  homeWorld: World,
  // xivpf's category name, e.g. "HighEndDuty", "TheHunt"; "None" for a
  // listing without a duty.
  category: z.string(),
  // The duty, or for a Treasure Hunt the map, for a Deep Dungeon the
  // dungeon, for a Duty Roulette the roulette; null when it has none or
  // can't be told.
  duty: z.string().nullable(),
  // The duty type's icon (an image id for GET /api/images/:id), as the game
  // shows it before the name: an ultimate's, a raid's, a map's...
  dutyIcon: z.number().int().nullable(),
  // The duty's level: the game lists the highest first within a category.
  // Null when the duty isn't in the duty data (maps, FATEs, no duty...).
  level: z.number().int().nullable(),
  // The duty's place in the game's own order (higher: newer), for duties of
  // the same level; null as level is.
  sortKey: z.number().int().nullable(),
  highEnd: z.boolean(),
  // Only joinable from its own world (the Hunt, FATEs...); the others from
  // anywhere on the data centre.
  worldOnly: z.boolean(),
  onePlayerPerJob: z.boolean(),
  beginnersWelcome: z.boolean(),
  minItemLevel: z.number().int(),
  objective: z.enum(['completion', 'practice', 'loot']).nullable(),
  dutyComplete: z.boolean(),
  loot: z.enum(['normal', 'greed-only', 'lootmaster']),
  parties: z.number().int(),
  // Each slot: the job in it and its icon (an image id for
  // GET /api/images/:id), or (job null) the roles it's open to and the jobs
  // it accepts, by role.
  slots: z.array(
    z.strictObject({
      job: z.string().nullable(),
      icon: z.number().int().nullable(),
      roles: z.array(Role),
      accepts: z.array(z.strictObject({role: Role, jobs: z.array(z.string())})),
    }),
  ),
  updatedAt: isoDate,
  expiresAt: isoDate,
});

// The Party Finder's icons (image ids for GET /api/images/:id): an open
// slot's roles, and the sprout of a listing that welcomes beginners.
const PartyFinderIcons = z.strictObject({
  tank: z.number().int(),
  healer: z.number().int(),
  dps: z.number().int(),
  beginner: z.number().int(),
});

const PartyFinderResponse = responseSchema(
  'PartyFinderResponse',
  z.strictObject({
    dataCentre: z.enum(DATA_CENTRE_NAMES),
    worlds: z.array(World),
    // Every data centre, by region (Europe first), for the page's list.
    regions: z.array(
      z.strictObject({
        name: z.string(),
        dataCentres: z.array(z.enum(DATA_CENTRE_NAMES)),
      }),
    ),
    // When the site last read the listings from xivpf.
    fetchedAt: isoDate,
    icons: PartyFinderIcons,
    listings: z.array(PartyFinderListing),
  }),
);

const PartyFinderQuery = z.object({
  dataCentre: z
    .enum(DATA_CENTRE_NAMES, {
      error: `Pick one of the game's data centres: ${DATA_CENTRE_NAMES.join(', ')}.`,
    })
    .default('Light'),
});

export {
  PartyFinderIcons,
  PartyFinderListing,
  PartyFinderQuery,
  PartyFinderResponse,
};
