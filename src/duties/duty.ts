// Where a duty is queued: "" when it's in neither finder (entered through an
// NPC or an item, or not queueable at all).
type Finder = 'Duty Finder' | 'Raid Finder' | '';

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
  // Roulette flags, e.g. "LevelingRoulette", "ExpertRoulette".
  roulettes: string[];
  sortKey: number;
}

interface DutyGroup {
  name: string;
  order: number;
  duties: Duty[];
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
}

interface DutyData {
  // XIVAPI's id for the game data the lists were read from.
  dataVersion: string;
  groups: DutyGroup[];
  roulettes: Roulette[];
}

export {Duty, DutyData, DutyGroup, Finder, Roulette};
