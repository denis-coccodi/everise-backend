// A report as the planner reads it: never FFLogs' own shapes, so another
// source (e.g. local ACT logs) can fill the same model later.

// The fights the planner covers.
const PULL_KINDS = ['extreme', 'savage', 'ultimate'] as const;
type PullKind = (typeof PULL_KINDS)[number];

// What kind of fight each game territory holds (from the game data's
// duties), by territory id.
type FightKinds = Map<number, PullKind>;

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

// A pull as read from the log, before it's known whether the planner
// covers it: where it was fought (the game territory, null when the log
// doesn't say) and the log's difficulty (101 is Savage on FFLogs).
interface LoggedPull extends Omit<ReportPull, 'kind'> {
  territory: number | null;
  difficulty: number;
}

// A report as read from the log, with every boss pull and their players.
interface LoggedReport extends Omit<FightReport, 'pulls' | 'otherPulls'> {
  pulls: LoggedPull[];
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

// What kind of fight a pull is, from its territory; a pull fought where
// the game data doesn't say (a fight newer than the last game data
// refresh) counts as Savage when the log says so. Null for one the planner
// doesn't cover.
function pullKind(pull: LoggedPull, kinds: FightKinds): PullKind | null {
  const kind = pull.territory === null ? undefined : kinds.get(pull.territory);
  return kind ?? (pull.difficulty === 101 ? 'savage' : null);
}

// The report as the planner answers it: only the pulls it covers, and
// their players.
function coveredReport(report: LoggedReport, kinds: FightKinds): FightReport {
  const pulls: ReportPull[] = [];
  for (const logged of report.pulls) {
    const kind = pullKind(logged, kinds);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {territory, difficulty, ...pull} = logged;
    if (kind) pulls.push({...pull, kind});
  }
  const inPulls = new Set(pulls.flatMap(pull => pull.playerIds));
  return {
    ...report,
    players: report.players.filter(player => inPulls.has(player.id)),
    pulls,
    otherPulls: report.pulls.length - pulls.length,
  };
}

export {
  FightKinds,
  FightReport,
  LoggedPull,
  LoggedReport,
  JOBS,
  PULL_KINDS,
  PullKind,
  ROLES,
  ReportPlayer,
  ReportPull,
  Role,
  coveredReport,
  jobOf,
};
