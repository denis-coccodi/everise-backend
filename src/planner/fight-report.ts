import {
  FightKinds,
  FightReport,
  LoggedPull,
  LoggedReport,
  PullKind,
  ReportPull,
  Role,
} from './fight-report-model';

// The fights the planner covers.
const PULL_KINDS = ['extreme', 'savage', 'ultimate'] as const;

const ROLES = ['tank', 'healer', 'melee', 'ranged', 'caster'] as const;

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

export {JOBS, PULL_KINDS, ROLES, coveredReport, jobOf};
