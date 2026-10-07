import {z} from 'zod';
import {isoDate, responseSchema} from '../api';
import {DATA_CENTRE_NAMES} from './data-centres';

const World = z.strictObject({id: z.number().int(), name: z.string()});

const Role = z.enum(['tank', 'healer', 'dps']);

const PartyFinderListing = z.strictObject({
  id: z.string(),
  recruiter: z.string(),
  description: z.string(),
  // The world it was made on, and the recruiter's own.
  world: World,
  homeWorld: World,
  // xivpf's category name, e.g. "HighEndDuty", "TheHunt"; "None" for a
  // listing without a duty.
  category: z.string(),
  duty: z.string().nullable(),
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
  // Each slot: the job in it, or (job null) the roles it's open to.
  slots: z.array(
    z.strictObject({job: z.string().nullable(), roles: z.array(Role)}),
  ),
  updatedAt: isoDate,
  expiresAt: isoDate,
});

const PartyFinderResponse = responseSchema(
  'PartyFinderResponse',
  z.strictObject({
    dataCentre: z.enum(DATA_CENTRE_NAMES),
    worlds: z.array(World),
    // When the site last read the listings from xivpf.
    fetchedAt: isoDate,
    listings: z.array(PartyFinderListing),
  }),
);

const PartyFinderQuery = z.object({
  dataCentre: z
    .enum(DATA_CENTRE_NAMES, {
      error: `Pick a data centre: ${DATA_CENTRE_NAMES.join(' or ')}.`,
    })
    .default('Light'),
});

export {PartyFinderQuery, PartyFinderResponse};
