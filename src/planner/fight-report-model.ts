import {PULL_KINDS, ROLES} from './fight-report';

// A report as the planner reads it: never FFLogs' own shapes, so another
// source (e.g. local ACT logs) can fill the same model later.

// What kind of fight each game territory holds (from the game data's
// duties), by territory id.
type FightKinds = Map<number, PullKind>;

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
  // The expansion that was the game's latest when it was recorded
  // ("Dawntrail"), whatever fights it has.
  expansion: string | null;
  // Recorded in an earlier expansion than the latest: the jobs have changed
  // since, so none of its pulls are planned.
  outdated: boolean;
}

// A pull as read from the log, before it's known whether the planner
// covers it: where it was fought (the game territory, null when the log
// doesn't say) and the log's difficulty (101 is Savage on FFLogs).
interface LoggedPull extends Omit<ReportPull, 'kind'> {
  territory: number | null;
  difficulty: number;
}

// A report as read from the log, with every boss pull and their players.
interface LoggedReport extends Omit<
  FightReport,
  'pulls' | 'otherPulls' | 'expansion' | 'outdated'
> {
  pulls: LoggedPull[];
}

type PullKind = (typeof PULL_KINDS)[number];

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

type Role = (typeof ROLES)[number];

// Another group's kill of a fight: its report and pull.
interface ClearRef {
  code: string;
  pullId: number;
}

export {
  ClearRef,
  FightKinds,
  FightReport,
  LoggedPull,
  LoggedReport,
  PullKind,
  ReportPlayer,
  ReportPull,
  Role,
};
