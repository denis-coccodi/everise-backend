import {LoggedPull, LoggedReport, ReportPlayer, jobOf} from './fight-report';

// What the report's summary is read with: its pulls (with the game
// territory each was fought in) and its players.
const REPORT_QUERY = `query Report($code: String!) {
  reportData {
    report(code: $code) {
      code title startTime endTime
      fights {
        id encounterID name difficulty kill startTime endTime
        bossPercentage fightPercentage lastPhase friendlyPlayers
        gameZone { id }
      }
      masterData { actors(type: "Player") { id name server subType } }
    }
  }
}`;

interface FflogsFight {
  id: number;
  encounterID: number;
  name: string;
  difficulty: number | null;
  kill: boolean | null;
  startTime: number;
  endTime: number;
  bossPercentage: number | null;
  fightPercentage: number | null;
  lastPhase: number | null;
  friendlyPlayers: number[] | null;
  gameZone: {id: number} | null;
}

interface FflogsActor {
  id: number;
  name: string;
  server: string | null;
  subType: string | null;
}

interface FflogsReport {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  fights: FflogsFight[];
  masterData: {actors: FflogsActor[]} | null;
}

function reportOf(data: unknown): FflogsReport | null {
  const report = (data as {reportData?: {report?: FflogsReport | null}})
    ?.reportData?.report;
  return report && Array.isArray(report.fights) ? report : null;
}

const percent = (value: number | null) =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : null;

// Every boss pull (trash is encounter 0) and the players in them.
function toLoggedReport(report: FflogsReport): LoggedReport {
  const iso = (offset: number) =>
    new Date(report.startTime + offset).toISOString();
  const pulls: LoggedPull[] = report.fights
    .filter(fight => fight.encounterID > 0)
    .map(fight => {
      const kill = !!fight.kill;
      return {
        id: fight.id,
        encounterId: fight.encounterID,
        name: fight.name,
        kill,
        startedAt: iso(fight.startTime),
        durationMs: Math.max(fight.endTime - fight.startTime, 0),
        bossHpLeft: kill ? 0 : percent(fight.bossPercentage),
        fightLeft: kill ? 0 : percent(fight.fightPercentage),
        phase: fight.lastPhase ? fight.lastPhase : null,
        playerIds: fight.friendlyPlayers ?? [],
        territory: fight.gameZone?.id ?? null,
        difficulty: fight.difficulty ?? 0,
      };
    });
  const inPulls = new Set(pulls.flatMap(pull => pull.playerIds));
  const players: ReportPlayer[] = (report.masterData?.actors ?? [])
    .filter(actor => inPulls.has(actor.id))
    .map(actor => {
      const job = jobOf(actor.subType);
      return {
        id: actor.id,
        name: actor.name,
        server: actor.server || null,
        job: job?.job ?? null,
        role: job?.role ?? null,
      };
    });
  return {
    code: report.code,
    title: report.title,
    startedAt: iso(0),
    endedAt: new Date(report.endTime).toISOString(),
    players,
    pulls,
  };
}

export {REPORT_QUERY, reportOf, toLoggedReport};
