import {REGIONS} from './data-centres';
import {withDuty} from './party-finder-reader';

// "Light" | "Chaos" | "Aether" | ...
type DataCentre = DataCentresOf<(typeof REGIONS)[number]>;

// One data centre's listings, as the page gets them.
interface Board {
  dataCentre: DataCentre;
  worlds: readonly {id: number; name: string}[];
  // When the site last read xivpf.
  fetchedAt: string;
  listings: PartyFinderListing[];
}

// A listing as the site shows it: with its duty's level, sort key and type icon.
type ShownListing = ReturnType<typeof withDuty>;

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

type Role = 'tank' | 'healer' | 'dps';

// A slot in a party: who's in it (the job and its icon, an image id for
// GET /api/images/:id), or the roles it's open to and their jobs.
interface Slot {
  job: string | null;
  icon: number | null;
  roles: Role[];
  accepts: {role: Role; jobs: string[]}[];
}
// A region's data centres' names; over a union of regions, all of them.
type DataCentresOf<R> = R extends {dataCentres: infer D}
  ? keyof D & string
  : never;

export {
  Board,
  DataCentre,
  PartyFinderListing,
  Role,
  ShownListing,
  Slot,
  DataCentresOf,
};
