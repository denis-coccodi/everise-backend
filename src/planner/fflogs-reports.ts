import {
  FightReport,
  ReportPlayer,
  ReportPull,
  jobOf,
  pullKind,
} from './fight-report';

// What the report's summary is read with: its pulls and its players.
const REPORT_QUERY = `query Report($code: String!) {
  reportData {
    report(code: $code) {
      code title startTime endTime
      fights {
        id encounterID name difficulty kill startTime endTime
        bossPercentage fightPercentage lastPhase friendlyPlayers
      }
      masterData { actors(type: "Player") { id name server subType } }
    }
  }
}`;

// The FFLogs zone of each encounter, aliased e<id>.
function encountersQuery(ids: number[]) {
  const fields = ids.map(
    id => `e${id}: encounter(id: ${id}) { id zone { name } }`,
  );
  return `query Encounters { worldData { ${fields.join(' ')} } }`;
}

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

// The encounters the report has pulls of (0 is trash).
function encounterIds(report: FflogsReport) {
  return [
    ...new Set(report.fights.map(f => f.encounterID).filter(id => id > 0)),
  ];
}

// Each encounter's zone name, from encountersQuery's data.
function zoneNames(data: unknown) {
  const encounters = (data as {worldData?: Record<string, unknown>})?.worldData;
  const names = new Map<number, string>();
  for (const value of Object.values(encounters ?? {})) {
    const encounter = value as {id?: unknown; zone?: {name?: unknown}} | null;
    if (typeof encounter?.id === 'number') {
      names.set(encounter.id, String(encounter.zone?.name ?? ''));
    }
  }
  return names;
}

const percent = (value: number | null) =>
  typeof value === 'number' ? Math.round(value * 100) / 100 : null;

function toReport(
  report: FflogsReport,
  zones: Map<number, string>,
): FightReport {
  const iso = (offset: number) =>
    new Date(report.startTime + offset).toISOString();
  const pulls: ReportPull[] = [];
  let otherPulls = 0;
  for (const fight of report.fights) {
    if (fight.encounterID <= 0) continue;
    const zone = zones.get(fight.encounterID) ?? '';
    const kind = pullKind(zone, fight.difficulty ?? 0);
    if (!kind) {
      otherPulls++;
      continue;
    }
    const kill = !!fight.kill;
    pulls.push({
      id: fight.id,
      encounterId: fight.encounterID,
      name: fight.name,
      kind,
      kill,
      startedAt: iso(fight.startTime),
      durationMs: Math.max(fight.endTime - fight.startTime, 0),
      bossHpLeft: kill ? 0 : percent(fight.bossPercentage),
      fightLeft: kill ? 0 : percent(fight.fightPercentage),
      phase: fight.lastPhase ? fight.lastPhase : null,
      playerIds: fight.friendlyPlayers ?? [],
    });
  }
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
    otherPulls,
  };
}

export {
  FflogsReport,
  REPORT_QUERY,
  encounterIds,
  encountersQuery,
  reportOf,
  toReport,
  zoneNames,
};
