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
    dutyType?: string;
    updatedSecondsAgo?: number;
    secondsRemaining?: number;
    searchArea?: {world: boolean; one_player_per_job: boolean};
    slotCount?: number;
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
      duty_type: changes.dutyType ?? 'Normal',
      beginners_welcome: false,
      seconds_remaining: changes.secondsRemaining ?? 3600,
      min_item_level: 0,
      num_parties: 1,
      slot_count: changes.slotCount ?? 3,
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
      // The game's role icons and the beginners' sprout.
      icons: {tank: 62581, healer: 62582, dps: 62583, beginner: 61523},
    });
    expect(response.body.worlds).toContainEqual({id: 66, name: 'Odin'});
    expect(response.body.worlds).toHaveLength(8);
    // Every data centre, by region, Europe (and Light) first.
    expect(response.body.regions).toStrictEqual([
      {name: 'Europe', dataCentres: ['Light', 'Chaos']},
      {
        name: 'North America',
        dataCentres: ['Aether', 'Crystal', 'Dynamis', 'Primal'],
      },
      {name: 'Japan', dataCentres: ['Elemental', 'Gaia', 'Mana', 'Meteor']},
      {name: 'Oceania', dataCentres: ['Materia']},
    ]);
    expect(response.body.listings).toStrictEqual([
      {
        id: '1789630212-1',
        recruiter: 'Tataru Taru',
        description: 'Prog from P3, know the mechanics',
        world: {id: 66, name: 'Odin'},
        homeWorld: {id: 67, name: 'Shiva'},
        category: 'HighEndDuty',
        duty: 'The Unending Coil of Bahamut (Ultimate)',
        // Not in the duty data (no refresh here): the category's icon.
        dutyIcon: 61802,
        level: null,
        sortKey: null,
        highEnd: true,
        worldOnly: false,
        onePlayerPerJob: true,
        beginnersWelcome: false,
        minItemLevel: 0,
        objective: 'practice',
        dutyComplete: false,
        loot: 'lootmaster',
        parties: 1,
        // A job's framed icon; the open slots say which jobs they take.
        slots: [
          {job: 'PLD', icon: 62119, roles: [], accepts: []},
          {
            job: null,
            icon: null,
            roles: ['tank'],
            accepts: [{role: 'tank', jobs: ['PLD', 'WAR', 'DRK', 'GNB']}],
          },
          {
            job: null,
            icon: null,
            roles: ['healer', 'dps'],
            accepts: [
              {role: 'healer', jobs: ['WHM', 'SCH', 'AST', 'SGE']},
              {role: 'dps', jobs: ['BLM']},
            ],
          },
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
      '1789630212-2',
    ]);
    expect(xivpf.reads).toBe(1);
  });

  test('shows any data centre: a Crystal listing on Crystal', async () => {
    xivpf.listings = [
      entry(),
      entry({id: 3, world: {id: 91, name: 'Balmung'}}),
    ];

    const response = await board('?dataCentre=Crystal');

    expect(response.body.dataCentre).toBe('Crystal');
    expect(response.body.worlds).toContainEqual({id: 91, name: 'Balmung'});
    expect(response.body.listings.map((l: {id: string}) => l.id)).toEqual([
      '1789630212-3',
    ]);
  });

  test('says which data centres there are', async () => {
    const response = await board('?dataCentre=Narnia');

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      "Pick one of the game's data centres: Light, Chaos, Aether, Crystal, Dynamis, Primal, Elemental, Gaia, Mana, Meteor, Materia.",
    ]);
  });

  test("gives a listing its duty's place in the game's order and its type icon, from the duty data", async () => {
    // The fake duty data has "Dancing Mad (Ultimate)": level 100, SortKey 4,
    // an ultimate (icon 61832), and "the Excitatron 6000" (level 90, SortKey 7,
    // a treasure hunt), which
    // players' plugins write with a capital T.
    await request(app)
      .post('/api/duties/refresh')
      .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!)
      .send();
    xivpf.listings = [
      entry({id: 1, duty: 'Dancing Mad (Ultimate)'}),
      entry({id: 2, category: 'TreasureHunt', duty: null, dutyType: 'Other'}),
      entry({id: 3, category: 'TreasureHunt', duty: 'The Excitatron 6000'}),
    ];

    const response = await board();

    expect(
      response.body.listings.map(
        (l: {
          duty: string | null;
          dutyIcon: number;
          level: number | null;
          sortKey: number | null;
        }) => [l.duty, l.dutyIcon, l.level, l.sortKey],
      ),
    ).toEqual([
      ['Dancing Mad (Ultimate)', 61832, 100, 4],
      // No duty: the category's icon, no place in the order.
      [null, 61808, null, null],
      ['The Excitatron 6000', 61808, 90, 7],
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
      {id: '1789630212-2', category: 'None', duty: null, highEnd: false},
      {
        id: '1789630212-1',
        category: 'TheHunt',
        worldOnly: true,
        onePlayerPerJob: false,
      },
    ]);
  });

  test('drops listings nobody has reported for 5 minutes, even with time left: they filled up or were taken down', async () => {
    xivpf.listings = [
      entry({id: 1, updatedSecondsAgo: 4 * 60}),
      entry({id: 2, updatedSecondsAgo: 6 * 60}),
    ];

    const response = await board();
    expect(response.body.listings.map((l: {id: string}) => l.id)).toEqual([
      '1789630212-1',
    ]);

    // A minute on, the first one's 5 minutes are up too.
    at(61);
    expect((await board()).body.listings).toEqual([]);
  });

  test("names maps, deep dungeons and roulettes, not the duty xivpf's API mistakes them for", async () => {
    const named = (
      id: number,
      category: string,
      duty: string,
      dutyType = 'Other',
    ) => entry({id, category, duty, dutyType, updatedSecondsAgo: id});
    xivpf.listings = [
      named(1, 'TreasureHunt', 'Copperbell Mines (Hard)'),
      named(2, 'DeepDungeon', 'The Keeper of the Lake'),
      named(3, 'DutyRoulette', 'The Aurum Vale', 'Roulette'),
      // A map newer than the site's list, and a FATE's zone: no name.
      named(4, 'TreasureHunt', 'The Stone Vigil (Hard)'),
      named(5, 'Fate', 'Blunderville'),
      named(6, 'Dungeon', 'Copperbell Mines (Hard)', 'Normal'),
    ];

    const response = await board();

    const duties = Object.fromEntries(
      response.body.listings.map(
        (l: {id: string; duty: string | null; highEnd: boolean}) => [
          l.id,
          [l.duty, l.highEnd],
        ],
      ),
    );
    expect(duties).toStrictEqual({
      '1789630212-1': ['Kumbhiraskin Treasure Map', false],
      '1789630212-2': ["Pilgrim's Traverse", false],
      '1789630212-3': ['Duty Roulette: Expert', false],
      '1789630212-4': [null, false],
      '1789630212-5': [null, false],
      '1789630212-6': ['Copperbell Mines (Hard)', true],
    });
  });

  test("shows only the party's own slots: xivpf sends 8 for a party of 4", async () => {
    xivpf.listings = [
      entry({
        category: 'DeepDungeon',
        slotCount: 4,
        slots: [['PLD'], ['WHM'], ['BLM'], ['NIN'], [], [], [], []],
        filled: ['PLD', null, null, null, null, null, null, null],
      }),
    ];

    const response = await board();

    expect(
      response.body.listings[0].slots.map(
        (s: {job: string | null; roles: string[]}) =>
          s.job ?? s.roles.join('+'),
      ),
    ).toEqual(['PLD', 'healer', 'dps', 'dps']);
  });

  test('shows a listing once when xivpf holds it under two worlds, as last reported', async () => {
    xivpf.listings = [
      entry({id: 7, world: {id: 402, name: 'Alpha'}, updatedSecondsAgo: 190}),
      entry({id: 7, world: {id: 67, name: 'Shiva'}, updatedSecondsAgo: 2}),
    ];

    const response = await board();

    expect(response.body.listings).toMatchObject([
      {id: '1789630212-7', world: {id: 67, name: 'Shiva'}},
    ]);
    expect(response.body.listings).toHaveLength(1);
  });

  test("skips entries it doesn't understand", async () => {
    xivpf.listings = [
      entry(),
      {listing: {created_world: {id: 66}}},
      'nonsense',
    ];

    const response = await board();

    expect(response.body.listings.map((l: {id: string}) => l.id)).toEqual([
      '1789630212-1',
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
