import {z} from 'zod';
import {isoDate, responseSchema} from '../api';

// The API's answers about the game's duties (see duty.ts for what each field
// means). Image fields are ids for GET /api/images/:id.

const imageId = z.number().int().nullable();

// When the game data was last read from XIVAPI (null before the first time).
const refreshInfo = {
  dataVersion: z.string().nullable(),
  fetchedAt: isoDate.nullable(),
};

const DutySchema = responseSchema(
  'Duty',
  z.strictObject({
    id: z.number().int(),
    name: z.string(),
    finder: z.enum(['Duty Finder', 'Raid Finder', '']),
    expansion: z.string(),
    level: z.number().int(),
    levelSync: z.number().int(),
    itemLevel: z.number().int(),
    itemLevelSync: z.number().int(),
    joinPartyInProgress: z.boolean(),
    unrestrictedParty: z.boolean(),
    minimumIL: z.boolean(),
    explorerMode: z.boolean(),
    dutyRecorder: z.boolean(),
    highEnd: z.boolean(),
    pvp: z.boolean(),
    pvpType: z.enum(['Frontline', 'Rival Wings', 'Crystalline Conflict', '']),
    roulettes: z.array(z.string()),
    sortKey: z.number(),
    image: imageId,
    // True for the one Frontline map in today's daily challenge.
    activeFrontline: z.boolean(),
  }),
);

const DutyGroupsResponse = responseSchema(
  'DutyGroupsResponse',
  z.strictObject({
    ...refreshInfo,
    // The next daily reset, until which activeFrontline holds.
    dayEndsAt: isoDate,
    groups: z.array(
      z.strictObject({
        name: z.string(),
        order: z.number(),
        icon: imageId,
        duties: z.array(DutySchema),
      }),
    ),
  }),
);

const period = z.strictObject({from: isoDate, until: isoDate});

const FrontlineDay = responseSchema(
  'FrontlineDay',
  z.strictObject({
    map: z.string(),
    // The map's duty in GET /api/duties; null before the first refresh.
    dutyId: z.number().int().nullable(),
    from: isoDate,
    until: isoDate,
  }),
);

const FrontlineResponse = responseSchema(
  'FrontlineResponse',
  z.strictObject({active: FrontlineDay, schedule: z.array(FrontlineDay)}),
);

const ResetsResponse = responseSchema(
  'ResetsResponse',
  z.strictObject({now: isoDate, daily: period, weekly: period}),
);

const RouletteSchema = responseSchema(
  'Roulette',
  z.strictObject({
    id: z.number().int(),
    name: z.string(),
    category: z.string(),
    dutyType: z.string(),
    expansion: z.string(),
    level: z.number().int(),
    syncedFromLevel: z.number().int(),
    itemLevel: z.number().int(),
    itemLevelSync: z.number().int(),
    joinPartyInProgress: z.boolean(),
    timeLimitMinutes: z.number(),
    pvp: z.boolean(),
    goldSaucer: z.boolean(),
    description: z.string(),
    sortKey: z.number(),
    image: imageId,
  }),
);

const RoulettesResponse = responseSchema(
  'RoulettesResponse',
  z.strictObject({
    ...refreshInfo,
    // The Duty Roulettes type's icon.
    icon: imageId,
    roulettes: z.array(RouletteSchema),
  }),
);

const JobSchema = responseSchema(
  'Job',
  z.strictObject({
    id: z.number().int(),
    name: z.string(),
    abbreviation: z.string(),
    role: z.enum([
      'Tank',
      'Healer',
      'Melee DPS',
      'Physical Ranged DPS',
      'Magical Ranged DPS',
    ]),
    startingLevel: z.number().int(),
    limited: z.boolean(),
    icon: z.number().int(),
  }),
);

const JobsResponse = responseSchema(
  'JobsResponse',
  z.strictObject({...refreshInfo, jobs: z.array(JobSchema)}),
);

const downloadProgress = {
  total: z.number().int(),
  pending: z.number().int(),
  // Image ids that couldn't be downloaded.
  failed: z.array(z.number().int()),
};

const DutiesRefreshResponse = responseSchema(
  'DutiesRefreshResponse',
  z.strictObject({
    dataVersion: z.string(),
    fetchedAt: isoDate,
    dutyCount: z.number().int(),
    rouletteCount: z.number().int(),
    jobCount: z.number().int(),
    groups: z.array(z.strictObject({name: z.string(), count: z.number()})),
    images: z.strictObject(downloadProgress),
  }),
);

const ImagesRefreshResponse = responseSchema(
  'ImagesRefreshResponse',
  z.strictObject({...downloadProgress, downloaded: z.number().int()}),
);

export {
  DutiesRefreshResponse,
  DutyGroupsResponse,
  FrontlineResponse,
  ImagesRefreshResponse,
  JobsResponse,
  ResetsResponse,
  RoulettesResponse,
};
