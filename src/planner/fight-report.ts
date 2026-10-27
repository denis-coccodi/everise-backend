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

// When each expansion's early access opened, by its name in the game data
// (ExVersion): from then, logs are of its jobs, whatever fight they're of
// (an Endwalker raid run now plays with today's jobs). The next expansion's
// date goes here when it's announced.
const EXPANSION_STARTS: [string, string][] = [
  ['Dawntrail', '2024-06-28'],
  ['Endwalker', '2021-12-03'],
  ['Shadowbringers', '2019-06-28'],
  ['Stormblood', '2017-06-16'],
  ['Heavensward', '2015-06-19'],
  ['A Realm Reborn', '2013-08-27'],
];

// The expansion that was the game's latest when a report began.
function recordedIn(startedAt: string): string | null {
  return EXPANSION_STARTS.find(([, start]) => startedAt >= start)?.[0] ?? null;
}

// The report as the planner answers it: only the pulls it covers, and
// their players. A report recorded before the latest expansion (`latest`,
// from the game data) came out covers none: the planner plans for the jobs
// as they are now, and those pulls couldn't be played that way. (A latest
// expansion without a date above doesn't make any outdated.)
function coveredReport(
  report: LoggedReport,
  kinds: FightKinds,
  latest: string | null,
): FightReport {
  const expansion = recordedIn(report.startedAt);
  const known = EXPANSION_STARTS.some(([name]) => name === latest);
  const outdated = known && expansion !== null && expansion !== latest;
  const pulls: ReportPull[] = [];
  for (const logged of outdated ? [] : report.pulls) {
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
    expansion,
    outdated,
  };
}

export {JOBS, PULL_KINDS, ROLES, coveredReport, jobOf};
