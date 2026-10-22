import {UpstreamError} from '../errors';
import {FflogsClient} from './fflogs-client';
import {
  FflogsEvent,
  FflogsPullActor,
  FflogsPullData,
  EventKind,
} from './fflogs-dto';

// The kinds of events a pull is read with. Damage and healing include the
// target's HP (includeResources); damage is what the party took from any
// source, the environment included.
const EVENT_KINDS = {
  damage:
    'dataType: DamageTaken, hostilityType: Friendlies, includeResources: true',
  heals: 'dataType: Healing, hostilityType: Friendlies, includeResources: true',
  playerCasts: 'dataType: Casts, hostilityType: Friendlies',
  enemyCasts: 'dataType: Casts, hostilityType: Enemies',
  buffs: 'dataType: Buffs, hostilityType: Friendlies',
  debuffs: 'dataType: Debuffs, hostilityType: Friendlies',
  enemyDebuffs: 'dataType: Debuffs, hostilityType: Enemies',
  deaths: 'dataType: Deaths, hostilityType: Friendlies',
  combatants: 'dataType: CombatantInfo, hostilityType: Friendlies',
} as const;

// FFLogs' most per page; a Savage pull fits in one of each kind.
const PAGE_SIZE = 10_000;
// More than an Ultimate's longest pull needs.
const MAX_PAGES = 20;

interface EventPage {
  data: FflogsEvent[] | null;
  nextPageTimestamp: number | null;
}

// The next pages need the pull's end too: given only a start, FFLogs sends
// nothing. It never splits a timestamp between pages.
const eventsField = (kind: EventKind) =>
  `${kind}: events(fightIDs: [$pull], ${EVENT_KINDS[kind]}, startTime: $start, endTime: $end, limit: ${PAGE_SIZE}) { data nextPageTimestamp }`;

// The pull, the report's actors and abilities, and the first page of every
// kind of event, in one query.
const FIRST_QUERY = `query Pull($code: String!, $pull: Int!, $start: Float, $end: Float) {
  reportData {
    report(code: $code) {
      fights(fightIDs: [$pull]) { id startTime endTime }
      masterData {
        actors { id name type subType server petOwner }
        abilities { gameID name type }
      }
      ${(Object.keys(EVENT_KINDS) as EventKind[]).map(eventsField).join('\n      ')}
    }
  }
}`;

const pageQuery = (kind: EventKind) =>
  `query Page($code: String!, $pull: Int!, $start: Float, $end: Float) {
  reportData { report(code: $code) { ${eventsField(kind)} } }
}`;

type ReportData = Record<string, unknown> & {
  fights?: {startTime: number; endTime: number}[];
  masterData?: {
    actors?: FflogsPullActor[];
    abilities?: {gameID: number; name: string}[];
  };
};

function reportOf(data: unknown): ReportData {
  const report = (data as {reportData?: {report?: ReportData | null}})
    ?.reportData?.report;
  if (!report) {
    throw new UpstreamError(
      "FFLogs didn't send that pull. Try again in a few minutes.",
    );
  }
  return report;
}

// Reads all of a pull's events, page by page.
async function readPull(
  client: FflogsClient,
  code: string,
  pull: number,
): Promise<FflogsPullData> {
  const first = reportOf(
    await client.query(FIRST_QUERY, {code, pull, start: null, end: null}),
  );
  const fight = first.fights?.[0];
  if (!fight) {
    throw new UpstreamError(
      "FFLogs didn't send that pull. Try again in a few minutes.",
    );
  }
  const events = {} as Record<EventKind, FflogsEvent[]>;
  for (const kind of Object.keys(EVENT_KINDS) as EventKind[]) {
    let page = first[kind] as EventPage | undefined;
    events[kind] = [...(page?.data ?? [])];
    for (let n = 1; page?.nextPageTimestamp && n < MAX_PAGES; n++) {
      const start = page.nextPageTimestamp;
      const end = fight.endTime;
      const next = reportOf(
        await client.query(pageQuery(kind), {code, pull, start, end}),
      );
      page = next[kind] as EventPage | undefined;
      events[kind].push(...(page?.data ?? []));
    }
  }
  return {
    startTime: fight.startTime,
    endTime: fight.endTime,
    actors: first.masterData?.actors ?? [],
    abilities: first.masterData?.abilities ?? [],
    events,
  };
}

export {EVENT_KINDS, readPull};
