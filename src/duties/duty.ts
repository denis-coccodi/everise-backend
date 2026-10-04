// Where a duty is queued: "" when it's in neither finder (entered through an
// NPC or an item, or not queueable at all).
type Finder = 'Duty Finder' | 'Raid Finder' | '';

// The kind of PvP match: "" for duties that aren't PvP.
type PvpType = 'Frontline' | 'Rival Wings' | 'Crystalline Conflict' | '';

interface Duty {
  id: number;
  name: string;
  finder: Finder;
  expansion: string;
  level: number;
  levelSync: number;
  itemLevel: number;
  itemLevelSync: number;
  // The Duty Finder settings the duty allows.
  joinPartyInProgress: boolean;
  unrestrictedParty: boolean;
  minimumIL: boolean;
  explorerMode: boolean;
  dutyRecorder: boolean;
  highEnd: boolean;
  pvp: boolean;
  pvpType: PvpType;
  // Roulette flags, e.g. "LevelingRoulette", "ExpertRoulette".
  roulettes: string[];
  sortKey: number;
  // The duty's banner, an image id for GET /api/images/:id; null without one.
  image: number | null;
}

// A duty as the API returns it, with state that changes over time. It is
// computed on each request, not stored.
interface DutyStatus extends Duty {
  // True for the one Frontline map in today's daily challenge.
  activeFrontline: boolean;
}

interface DutyGroup<T extends Duty = Duty> {
  name: string;
  order: number;
  // The duty type's icon (image id).
  icon: number | null;
  duties: T[];
}

interface Roulette {
  id: number;
  name: string;
  category: string;
  dutyType: string;
  expansion: string;
  level: number;
  syncedFromLevel: number;
  itemLevel: number;
  itemLevelSync: number;
  joinPartyInProgress: boolean;
  timeLimitMinutes: number;
  pvp: boolean;
  goldSaucer: boolean;
  description: string;
  sortKey: number;
  // The roulette's banner (image id).
  image: number | null;
}

// The party roles, in the game's order.
type Role =
  | 'Tank'
  | 'Healer'
  | 'Melee DPS'
  | 'Physical Ranged DPS'
  | 'Magical Ranged DPS';

// A Disciple of War or Magic job (classes and crafters/gatherers are left out).
interface Job {
  id: number;
  name: string;
  abbreviation: string;
  role: Role;
  // The level the job starts at, e.g. 80 for Viper and Pictomancer.
  startingLevel: number;
  // Limited jobs (Blue Mage, Beastmaster) can't queue for regular duties.
  limited: boolean;
  // The job's framed, role-coloured icon (image id).
  icon: number;
}

// A game image to download: its icon id, and the format it is stored in.
interface ImageRef {
  id: number;
  format: 'png' | 'jpg';
}

interface DutyData {
  // XIVAPI's id for the game data the lists were read from.
  dataVersion: string;
  groups: DutyGroup[];
  roulettes: Roulette[];
  // The Duty Roulettes type's icon (image id).
  rouletteIcon: number | null;
  jobs: Job[];
  // Every image the data above refers to.
  images: ImageRef[];
}

export {
  Duty,
  DutyData,
  DutyGroup,
  DutyStatus,
  Finder,
  ImageRef,
  Job,
  PvpType,
  Role,
  Roulette,
};
