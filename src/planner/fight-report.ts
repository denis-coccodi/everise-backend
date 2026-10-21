// A report as the planner reads it: never FFLogs' own shapes, so another
// source (e.g. local ACT logs) can fill the same model later.

// The fights the planner covers.
const PULL_KINDS = ['extreme', 'savage', 'ultimate'] as const;
type PullKind = (typeof PULL_KINDS)[number];

const ROLES = ['tank', 'healer', 'melee', 'ranged', 'caster'] as const;
type Role = (typeof ROLES)[number];

interface ReportPlayer {
  // The report's own id for the player (FFLogs' actor id).
  id: number;
  name: string;
  server: string | null;
  // The job's abbreviation (WHM, PLD, ...), null for one the site doesn't
  // know.
  job: string | null;
  role: Role | null;
}

// One pull of a fight.
interface ReportPull {
  // The report's own id for the pull (FFLogs' fight id).
  id: number;
  encounterId: number;
  // The boss, as FFLogs names the encounter.
  name: string;
  kind: PullKind;
  kill: boolean;
  startedAt: string;
  durationMs: number;
  // What was left of the boss and of the whole fight (all phases), in
  // percent; 0 on a kill. Null when the source doesn't say.
  bossHpLeft: number | null;
  fightLeft: number | null;
  // The last phase reached, from 1; null for fights without phases.
  phase: number | null;
  playerIds: number[];
}

interface FightReport {
  code: string;
  title: string;
  startedAt: string;
  endedAt: string;
  players: ReportPlayer[];
  // The pulls of the fights the planner covers, in order.
  pulls: ReportPull[];
  // The pulls of other fights, left out.
  otherPulls: number;
}

// FFLogs' names for the jobs (an actor's subType).
const JOBS: Record<string, {job: string; role: Role}> = {
  Paladin: {job: 'PLD', role: 'tank'},
  Warrior: {job: 'WAR', role: 'tank'},
  DarkKnight: {job: 'DRK', role: 'tank'},
  Gunbreaker: {job: 'GNB', role: 'tank'},
  WhiteMage: {job: 'WHM', role: 'healer'},
  Scholar: {job: 'SCH', role: 'healer'},
  Astrologian: {job: 'AST', role: 'healer'},
  Sage: {job: 'SGE', role: 'healer'},
  Monk: {job: 'MNK', role: 'melee'},
  Dragoon: {job: 'DRG', role: 'melee'},
  Ninja: {job: 'NIN', role: 'melee'},
  Samurai: {job: 'SAM', role: 'melee'},
  Reaper: {job: 'RPR', role: 'melee'},
  Viper: {job: 'VPR', role: 'melee'},
  Bard: {job: 'BRD', role: 'ranged'},
  Machinist: {job: 'MCH', role: 'ranged'},
  Dancer: {job: 'DNC', role: 'ranged'},
  BlackMage: {job: 'BLM', role: 'caster'},
  Summoner: {job: 'SMN', role: 'caster'},
  RedMage: {job: 'RDM', role: 'caster'},
  Pictomancer: {job: 'PCT', role: 'caster'},
};

function jobOf(subType: unknown) {
  return (typeof subType === 'string' && JOBS[subType]) || null;
}

// What kind of fight an encounter is, from its FFLogs zone and the pull's
// difficulty (101 is Savage: a Savage zone holds the normal fights too);
// null for one the planner doesn't cover.
function pullKind(zoneName: string, difficulty: number): PullKind | null {
  if (difficulty === 101) return 'savage';
  if (/ultimate/i.test(zoneName)) return 'ultimate';
  if (/extreme/i.test(zoneName)) return 'extreme';
  return null;
}

export {
  FightReport,
  JOBS,
  PULL_KINDS,
  PullKind,
  ROLES,
  ReportPlayer,
  ReportPull,
  Role,
  jobOf,
  pullKind,
};
