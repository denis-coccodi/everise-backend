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

interface DutyData {
  // XIVAPI's id for the game data the lists were read from.
  dataVersion: string;
  groups: DutyGroup[];
  // The high-end fights by game territory id, for the fight planner.
  fights: Record<string, FightKind>;
  roulettes: Roulette[];
  // The Duty Roulettes type's icon (image id).
  rouletteIcon: number | null;
  jobs: Job[];
  // Every image the data above refers to.
  images: ImageRef[];
}

interface DutyGroup<T extends Duty = Duty> {
  name: string;
  order: number;
  // The duty type's icon (image id).
  icon: number | null;
  duties: T[];
}

// A duty as the API returns it, with state that changes over time. It is
// computed on each request, not stored.
interface DutyStatus extends Duty {
  // True for the one Frontline map in today's daily challenge.
  activeFrontline: boolean;
}

// Where a duty is queued: "" when it's in neither finder (entered through an
// NPC or an item, or not queueable at all).
type Finder = 'Duty Finder' | 'Raid Finder' | '';

// A game image to download: its icon id, and the format it is stored in.
interface ImageRef {
  id: number;
  format: 'png' | 'jpg';
}

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

// The kind of PvP match: "" for duties that aren't PvP.
type PvpType = 'Frontline' | 'Rival Wings' | 'Crystalline Conflict' | '';

// The party roles, in the game's order.
type Role =
  | 'Tank'
  | 'Healer'
  | 'Melee DPS'
  | 'Physical Ranged DPS'
  | 'Magical Ranged DPS';

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

// The high-end fights the fight planner covers.
type FightKind = 'extreme' | 'savage' | 'ultimate';

interface FrontlineDay extends ResetPeriod {
  map: string;
}

interface DownloadProgress {
  total: number;
  pending: number;
  failed: number[];
}

// A stretch of game time, from one reset to the next.
interface ResetPeriod {
  from: Date;
  until: Date;
}

export {
  DownloadProgress,
  Duty,
  DutyData,
  DutyGroup,
  DutyStatus,
  FightKind,
  Finder,
  FrontlineDay,
  ImageRef,
  Job,
  PvpType,
  ResetPeriod,
  Role,
  Roulette,
};
