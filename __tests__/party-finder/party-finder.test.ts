import 'jest-extended';
import request from 'supertest';
import {app, clock, xivpf} from '../utils';

// Each test starts an hour after the last, so the board reads xivpf again.
let start = Date.parse('2026-10-07T18:00:00Z');
function at(offsetSeconds = 0) {
  clock.now = new Date(start + offsetSeconds * 1000);
  return clock.now;
}

// An entry as xivpf sends it: a Light (Odin) high-end listing by default.
function entry(
  changes: {
    id?: number;
    world?: {id: number; name: string};
    category?: string;
    duty?: string | null;
    updatedSecondsAgo?: number;
    secondsRemaining?: number;
    searchArea?: {world: boolean; one_player_per_job: boolean};
    slots?: string[][];
    filled?: (string | null)[];
  } = {},
) {
  const world = changes.world ?? {id: 66, name: 'Odin'};
  const duty =
    changes.duty === undefined
      ? 'The Unending Coil of Bahamut (Ultimate)'
      : changes.duty;
  return {
    created_at: new Date(clock.now!.getTime() - 600_000).toISOString(),
    updated_at: new Date(
      clock.now!.getTime() - (changes.updatedSecondsAgo ?? 60) * 1000,
    ).toISOString(),
    time_left: 3000,
    listing: {
      id: changes.id ?? 1,
      recruiter: 'Tataru Taru',
      description: {en: 'Prog from P3, know the mechanics', ja: 'P3'},
      created_world: world,
      home_world: {id: 67, name: 'Shiva'},
      current_world: world,
      category: changes.category ?? 'HighEndDuty',
      duty_info: duty
        ? {
            name: {en: duty},
            high_end: true,
            content_kind_id: 28,
            content_kind: 'UltimateRaids',
          }
        : null,
      duty_type: 'Normal',
      beginners_welcome: false,
      seconds_remaining: changes.secondsRemaining ?? 3600,
      min_item_level: 0,
      num_parties: 1,
      slot_count: 3,
      last_server_restart: 1789630212,
      objective: {duty_completion: false, practice: true, loot: false},
      conditions: {
        duty_complete: false,
        duty_incomplete: false,
        duty_complete_reward_unclaimed: false,
      },
      duty_finder_settings: {
        undersized_party: false,
        minimum_item_level: false,
        silence_echo: false,
      },
      loot_rules: {greed_only: false, lootmaster: true},
      search_area: {
        data_centre: !changes.searchArea?.world,
        private: false,
        alliance_raid: false,
        ...(changes.searchArea ?? {world: false, one_player_per_job: true}),
      },
      slots: changes.slots ?? [
        ['PLD'],
        ['PLD', 'WAR', 'DRK', 'GNB'],
        ['WHM', 'SCH', 'AST', 'SGE', 'BLM'],
      ],
      slots_filled: changes.filled ?? ['PLD', null, null],
    },
  };
}

const board = (query = '') => request(app).get(`/api/party-finder${query}`);

beforeEach(() => {
  start += 3_600_000;
  at();
  xivpf.status = 200;
  xivpf.body = undefined;
  xivpf.reads = 0;
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/party-finder', () => {
  test("shows Light's listings by default, in the page's shape, for everyone", async () => {
    xivpf.listings = [entry(), entry({id: 2, world: {id: 71, name: 'Moogle'}})];

    const response = await board();

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=15');
    expect(response.body).toMatchObject({
      dataCentre: 'Light',
      fetchedAt: clock.now!.toISOString(),
    });
    expect(response.body.worlds).toContainEqual({id: 66, name: 'Odin'});
    expect(response.body.worlds).toHaveLength(8);
    expect(response.body.listings).toStrictEqual([
      {
        id: '66-1',
        recruiter: 'Tataru Taru',
        description: 'Prog from P3, know the mechanics',
        world: {id: 66, name: 'Odin'},
        homeWorld: {id: 67, name: 'Shiva'},
        category: 'HighEndDuty',
        duty: 'The Unending Coil of Bahamut (Ultimate)',
        highEnd: true,
        worldOnly: false,
        onePlayerPerJob: true,
        beginnersWelcome: false,
        minItemLevel: 0,
        objective: 'practice',
        dutyComplete: false,
        loot: 'lootmaster',
        parties: 1,
        // The open slots say which roles they take.
        slots: [
          {job: 'PLD', roles: []},
          {job: null, roles: ['tank']},
          {job: null, roles: ['healer', 'dps']},
        ],
        updatedAt: new Date(clock.now!.getTime() - 60_000).toISOString(),
        expiresAt: new Date(clock.now!.getTime() + 3_540_000).toISOString(),
      },
    ]);
  });

  test("shows Chaos's when asked, from the same read of xivpf", async () => {
    xivpf.listings = [entry(), entry({id: 2, world: {id: 71, name: 'Moogle'}})];

    await board();
    const chaos = await board('?dataCentre=Chaos');

    expect(chaos.body.dataCentre).toBe('Chaos');
    expect(chaos.body.listings.map((l: {id: string}) => l.id)).toEqual([
      '71-2',
    ]);
    expect(xivpf.reads).toBe(1);
  });

  test('says which data centres there are', async () => {
    const response = await board('?dataCentre=Crystal');

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'Pick a data centre: Light or Chaos.',
    ]);
  });

  test('asks xivpf at most once a minute', async () => {
    xivpf.listings = [entry()];

    await Promise.all([board(), board(), board('?dataCentre=Chaos')]);
    at(59);
    await board();
    expect(xivpf.reads).toBe(1);

    at(61);
    await board();
    expect(xivpf.reads).toBe(2);
  });

  test('keeps world-only listings and listings without a duty, and drops ones whose time ran out', async () => {
    xivpf.listings = [
      entry({
        id: 1,
        category: 'TheHunt',
        duty: null,
        searchArea: {world: true, one_player_per_job: false},
        updatedSecondsAgo: 30,
      }),
      entry({id: 2, category: 'None', duty: null, updatedSecondsAgo: 20}),
      entry({id: 3, secondsRemaining: 100, updatedSecondsAgo: 200}),
    ];

    const response = await board();

    expect(response.body.listings).toMatchObject([
      {id: '66-2', category: 'None', duty: null, highEnd: false},
      {
        id: '66-1',
        category: 'TheHunt',
        worldOnly: true,
        onePlayerPerJob: false,
      },
    ]);
  });

  test("skips entries it doesn't understand", async () => {
    xivpf.listings = [
      entry(),
      {listing: {created_world: {id: 66}}},
      'nonsense',
    ];

    const response = await board();

    expect(response.body.listings.map((l: {id: string}) => l.id)).toEqual([
      '66-1',
    ]);
  });

  test('when xivpf is down, the last listings stay a while, then 502', async () => {
    xivpf.status = 503;
    const never = await board();
    expect(never.status).toBe(502);
    expect(never.body.errors.body).toEqual([
      "The Party Finder listings can't be reached right now. Try again in a minute.",
    ]);

    at(120);
    xivpf.status = 200;
    xivpf.listings = [entry()];
    expect((await board()).body.listings).toHaveLength(1);

    at(240);
    xivpf.body = '<html>Bad gateway</html>';
    const stale = await board();
    expect(stale.status).toBe(200);
    expect(stale.body.fetchedAt).toBe(new Date(start + 120_000).toISOString());

    at(120 + 16 * 60);
    expect((await board()).status).toBe(502);
  });
});
