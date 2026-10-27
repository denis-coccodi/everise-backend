import {FflogsFetch} from '../../src/planner';

// A pull's events as FFLogs sends them, by kind (the app's aliases:
// damage, heals, playerCasts, ...), with the report's actors and abilities.
interface FakePull {
  startTime: number;
  endTime: number;
  actors: Record<string, unknown>[];
  abilities: {gameID: number; name: string; type?: number}[];
  events: Record<string, Record<string, unknown>[]>;
}

// FFLogs' v2 API: `reports` by code (as its GraphQL sends them; a code in
// `privateCodes` is refused), `pulls` by "<code>:<pull id>", sent
// `pageSize` events of each kind a page (more to finish the last
// timestamp, and nothing past the first page without an end time, as
// FFLogs does), and `status` its next answers' status. `tokens` counts the
// tokens the app asked for, `expiredTokens` makes the API refuse that many
// requests as unauthorized, `gate` holds pull answers until it resolves,
// and `queries` holds what the app asked (the query and its variables).
class FakeFflogs {
  reports: Record<string, Record<string, unknown>> = {};
  privateCodes = new Set<string>();
  pulls: Record<string, FakePull> = {};
  pageSize = Infinity;
  gate?: Promise<void>;
  status = 200;
  tokens = 0;
  expiredTokens = 0;
  queries: {query: string; variables: Record<string, unknown>}[] = [];

  reset() {
    this.reports = {};
    this.privateCodes = new Set();
    this.pulls = {};
    this.pageSize = Infinity;
    this.gate = undefined;
    this.status = 200;
    this.tokens = 0;
    this.expiredTokens = 0;
    this.queries = [];
  }

  readonly fetch: FflogsFetch = async (url, init) => {
    if (url.endsWith('/oauth/token')) {
      this.tokens++;
      return answer(200, {
        access_token: `token-${this.tokens}`,
        expires_in: 31_104_000,
      });
    }
    if (this.expiredTokens > 0) {
      this.expiredTokens--;
      return answer(401, {});
    }
    const {query, variables} = JSON.parse(init.body);
    this.queries.push({query, variables});
    if (this.status !== 200) return answer(this.status, {});
    const code = String(variables.code);
    if (this.privateCodes.has(code)) {
      return answer(200, {
        errors: [{message: 'You do not have permission to view this report.'}],
        data: {reportData: {report: null}},
      });
    }
    const report = this.reports[code];
    if (!report) {
      return answer(200, {
        errors: [{message: 'This report does not exist.'}],
        data: {reportData: {report: null}},
      });
    }
    if (query.includes('events(')) {
      await this.gate;
      return answer(200, {
        data: {reportData: {report: this.pullPage(query, variables)}},
      });
    }
    return answer(200, {data: {reportData: {report}}});
  };

  // A page of each kind of event the query asks for, from `start`; the
  // first query also gets the pull and the report's actors and abilities.
  private pullPage(query: string, variables: Record<string, unknown>) {
    const pull = this.pulls[`${variables.code}:${variables.pull}`];
    const page: Record<string, unknown> = {};
    if (query.includes('fights(')) {
      page.fights = pull ? [{id: variables.pull, ...pull}] : [];
      page.masterData = {
        actors: pull?.actors ?? [],
        abilities: pull?.abilities ?? [],
      };
    }
    for (const [, kind] of query.matchAll(/(\w+): events\(/g)) {
      const from = Number(variables.start ?? pull?.startTime ?? 0);
      const unbounded = variables.start !== null && variables.end === null;
      const left = [...(pull?.events[kind] ?? [])]
        .sort((a, b) => Number(a.timestamp) - Number(b.timestamp))
        .filter(event => !unbounded && Number(event.timestamp) >= from);
      let size = Math.min(this.pageSize, left.length);
      while (left[size] && left[size].timestamp === left[size - 1].timestamp) {
        size++;
      }
      const data = left.slice(0, size);
      const next = left[data.length];
      page[kind] = {data, nextPageTimestamp: next ? next.timestamp : null};
    }
    return page;
  }
}

// The game territories the report's fights are fought in.
const TERRITORIES = {
  savage: 1257,
  normal: 1256,
  ballad: 1243,
  ultimate: 1238,
  unreal: 1300,
};

function answer(status: number, body: unknown) {
  return {ok: status < 300, status, json: async () => body};
}

// A report as FFLogs sends it: a Savage boss pulled twice (a wipe, then a
// kill), an Extreme kill (a Minstrel's Ballad), a normal-mode pull and
// trash, by a party of eight. FFLogs counts the Limit Break and a stand-in
// without a server among each pull's players. Starts at `startTime` (ms).
function fflogsReport(
  overrides: Record<string, unknown> = {},
  startTime = Date.parse('2026-10-20T19:00:00Z'),
): Record<string, unknown> {
  const party = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11];
  const fight = (
    id: number,
    encounterID: number,
    territory: number,
    difficulty: number,
    from: number,
    to: number,
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    encounterID,
    name: encounterID === 101 ? 'Vamp Fatale' : 'Zelenia',
    difficulty,
    kill: false,
    startTime: from,
    endTime: to,
    bossPercentage: 23.456,
    fightPercentage: 23.456,
    lastPhase: 0,
    friendlyPlayers: party,
    gameZone: {id: territory},
    ...extra,
  });
  return {
    code: 'aBcD1234eFgH5678',
    title: 'M5S prog',
    startTime,
    endTime: startTime + 3_600_000,
    // FFLogs' zone for the report's fights, and its expansion.
    zone: {expansion: {name: 'Dawntrail'}},
    fights: [
      fight(1, 0, TERRITORIES.savage, 0, 0, 60_000),
      fight(2, 101, TERRITORIES.savage, 101, 120_000, 420_000),
      fight(3, 101, TERRITORIES.savage, 101, 600_000, 1_100_000, {
        kill: true,
        bossPercentage: 0.01,
        fightPercentage: 0.01,
      }),
      fight(4, 201, TERRITORIES.ballad, 100, 1_200_000, 1_500_000, {
        kill: true,
        lastPhase: 2,
      }),
      fight(5, 102, TERRITORIES.normal, 100, 1_600_000, 1_800_000),
    ],
    masterData: {
      actors: [
        ...[
          'Paladin',
          'Warrior',
          'WhiteMage',
          'Sage',
          'Monk',
          'Viper',
          'Dancer',
          'Pictomancer',
        ].map((subType, i) => ({
          id: i + 1,
          name: `Player ${i + 1}`,
          server: 'Phoenix',
          subType,
        })),
        {id: 9, name: 'Benched', server: 'Phoenix', subType: 'Bard'},
        {id: 10, name: 'Limit Break', server: null, subType: 'LimitBreak'},
        {id: 11, name: 'Environment', server: null, subType: 'Unknown'},
      ],
    },
    ...overrides,
  };
}

export {FakeFflogs, FakePull, TERRITORIES, fflogsReport};
