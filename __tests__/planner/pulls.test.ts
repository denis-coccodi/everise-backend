import 'jest-extended';
import request from 'supertest';
import {app, clearDb, clock, fflogs, fflogsReport, usersClient} from '../utils';
import {fflogsPull} from '../utils/fflogs-pulls';
import {refreshGameData} from '../utils/planner-game-data';

const CODE = 'aBcD1234eFgH5678';

let token: string;
const load = (pull: number | string = 3) =>
  request(app)
    .get(`/api/planner/reports/${CODE}/pulls/${pull}`)
    .set('authorization', `Token ${token}`);
const pullQueries = () =>
  fflogs.queries.filter(q => q.query.includes('events('));

beforeEach(async () => {
  await clearDb();
  fflogs.reset();
  fflogs.reports[CODE] = fflogsReport();
  fflogs.pulls[`${CODE}:3`] = fflogsPull();
  clock.now = new Date('2026-10-21T12:00:00Z');
  token = (await usersClient.registerRandomUser()).user.token;
  expect((await refreshGameData()).status).toBe(200);
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/planner/reports/:code/pulls/:pullId', () => {
  test('is for members only', async () => {
    const response = await request(app).get(
      `/api/planner/reports/${CODE}/pulls/3`,
    );

    expect(response.status).toBe(401);
    expect(fflogs.queries).toBeEmpty();
  });

  test("answers the pull's players, with their HP and stats", async () => {
    const response = await load();

    expect(response.status).toBe(200);
    expect(pullQueries()[0].variables).toEqual({
      code: CODE,
      pull: 3,
      start: null,
      end: null,
    });
    expect(response.body).toMatchObject({
      code: CODE,
      pullId: 3,
      startedAt: '2026-10-20T19:10:00.000Z',
      durationMs: 500_000,
    });
    expect(response.body.players).toHaveLength(8);
    expect(response.body.players[0]).toEqual({
      id: 1,
      name: 'Player 1',
      job: 'PLD',
      role: 'tank',
      maxHp: 325_090,
      stats: expect.objectContaining({
        level: 100,
        vitality: 7_119,
        tenacity: 420,
      }),
    });
    expect(response.body.players[7]).toMatchObject({maxHp: null, stats: null});
  });

  test('lists the damage the players took from every source, the environment included', async () => {
    const response = await load();

    expect(response.body.damage).toEqual([
      {
        at: 5_000,
        target: 1,
        source: 13,
        action: 45956,
        amount: 4_000,
        unmitigated: 156_831,
        mitigated: 53_653,
        absorbed: 99_178,
        overkill: 0,
        multiplier: 0.66,
        tick: false,
        statuses: [1193, 48, 297],
        hp: 321_090,
      },
      expect.objectContaining({at: 20_000, source: -1, tick: true}),
    ]);
    expect(response.body.enemies).toEqual([
      {id: -1, name: 'Environment', boss: false},
      {id: 13, name: 'Vamp Fatale', boss: true},
    ]);
  });

  test("credits pets' heals to their owner, and gives HoT ticks their status", async () => {
    const response = await load();
    const heals = response.body.heals;

    expect(heals[0]).toEqual({
      at: 6_000,
      source: 3,
      pet: null,
      target: 1,
      action: 3569,
      status: null,
      amount: 4_000,
      overheal: 0,
      tick: false,
      estimated: false,
      hp: 325_090,
    });
    expect(heals[1]).toMatchObject({source: 4, pet: 'Eos', target: 2});
    // FFLogs numbers a HoT's own ticks by the status.
    expect(heals).toContainEqual(
      expect.objectContaining({
        at: 9_000,
        source: 4,
        action: null,
        status: 1944,
        amount: 1_000,
        estimated: false,
      }),
    );
    expect(response.body.absorbs).toEqual([
      {
        at: 5_000,
        source: 4,
        target: 1,
        status: 297,
        amount: 99_178,
        hitAction: 45956,
      },
    ]);
  });

  test("credits FFLogs' merged HoT ticks to the healers whose HoTs were on the player", async () => {
    const response = await load();
    const merged = response.body.heals.filter(
      (heal: {action: number | null}) => heal.action === 500001,
    );

    expect(merged).toEqual([
      // Both HoTs on player 1: split 1:3, as their own ticks are.
      expect.objectContaining({
        at: 8_000,
        target: 1,
        source: 4,
        status: 1944,
        amount: 1_000,
        overheal: 100,
        estimated: true,
      }),
      expect.objectContaining({
        at: 8_000,
        target: 1,
        source: 3,
        status: 150,
        amount: 3_000,
        overheal: 300,
        estimated: true,
      }),
      // No known HoT on player 2: credited to no one.
      expect.objectContaining({
        at: 8_000,
        target: 2,
        source: null,
        status: null,
        overheal: 30_323,
        estimated: false,
      }),
      // Only player 3's left: all theirs.
      expect.objectContaining({
        at: 17_000,
        target: 1,
        source: 3,
        status: 150,
        amount: 2_900,
        estimated: false,
      }),
    ]);
  });

  test("gives casts from their cast bar's start, the boss's too", async () => {
    const response = await load();

    expect(response.body.playerCasts).toEqual([
      {at: 1_000, source: 3, target: -1, action: 3569, castMs: 1_390},
      {at: 3_000, source: 1, target: 13, action: 7535, castMs: null},
      // Eos's, for its owner.
      {at: 6_500, source: 4, target: 12, action: 16538, castMs: null},
    ]);
    expect(response.body.enemyCasts).toEqual([
      {at: 300, source: 13, target: -1, action: 45956, castMs: 4_700},
    ]);
  });

  test('turns statuses into spans, on the players and the boss', async () => {
    const response = await load();

    expect(response.body.auras).toEqual([
      // Food from before the pull, never removed.
      {
        status: 48,
        source: 1,
        target: 1,
        from: 0,
        to: 500_000,
        stacks: null,
        shield: null,
      },
      {
        status: 297,
        source: 4,
        target: 1,
        from: 2_000,
        to: 5_000,
        stacks: null,
        shield: 99_178,
      },
      {
        status: 1193,
        source: 1,
        target: 13,
        from: 3_000,
        to: 18_000,
        stacks: null,
        shield: null,
      },
      // The HoTs on player 1.
      {
        status: 1944,
        source: 4,
        target: 1,
        from: 7_000,
        to: 15_000,
        stacks: null,
        shield: null,
      },
      {
        status: 150,
        source: 3,
        target: 1,
        from: 7_000,
        to: 20_000,
        stacks: null,
        shield: null,
      },
      {
        status: 3680,
        source: 1,
        target: 1,
        from: 10_000,
        to: 11_000,
        stacks: 3,
        shield: null,
      },
      {
        status: 3680,
        source: 1,
        target: 1,
        from: 11_000,
        to: 12_000,
        stacks: 2,
        shield: null,
      },
      {
        status: 4729,
        source: -1,
        target: 2,
        from: 20_000,
        to: 30_000,
        stacks: null,
        shield: null,
      },
    ]);
  });

  test('lists deaths, and names every action and status it refers to', async () => {
    const response = await load();

    expect(response.body.deaths).toEqual([
      {at: 400_000, player: 8, action: 45956, source: 13},
    ]);
    expect(response.body.actions).toEqual([
      {id: 3569, name: 'Asylum'},
      {id: 7535, name: 'Reprisal'},
      {id: 16538, name: 'Fey Illumination'},
      {id: 45956, name: 'Killer Voice'},
      {id: 500000, name: 'Combined DoTs'},
      {id: 500001, name: 'Combined HoTs'},
    ]);
    expect(response.body.statuses).toEqual([
      {id: 48, name: 'Well Fed'},
      {id: 150, name: 'Medica II'},
      {id: 297, name: 'Galvanize'},
      {id: 1193, name: 'Reprisal'},
      {id: 1944, name: 'Sacred Soil'},
      {id: 3680, name: 'Requiescat'},
      {id: 4729, name: 'Vulnerability Up'},
    ]);
  });

  test('reads every page of a long pull', async () => {
    const whole = (await load()).body;
    fflogs.queries = [];
    fflogs.pageSize = 2;
    // Another code, so the pull is read again.
    const other = 'zYxW9876vUtS5432';
    fflogs.reports[other] = fflogsReport({code: other});
    fflogs.pulls[`${other}:3`] = fflogsPull();

    const paged = await request(app)
      .get(`/api/planner/reports/${other}/pulls/3`)
      .set('authorization', `Token ${token}`);

    expect(paged.body).toEqual({...whole, code: other});
    expect(pullQueries().length).toBeGreaterThan(1);
    // Later pages give the pull's end: without it FFLogs sends nothing.
    expect(pullQueries()[1].variables).toMatchObject({
      start: expect.any(Number),
      end: 1_100_000,
    });
  });

  test('reads a pull once for requests arriving together', async () => {
    let release = () => {};
    fflogs.gate = new Promise(resolve => (release = resolve));
    const both = Promise.all([load(), load()]);
    // Both are waiting on FFLogs before it answers.
    while (pullQueries().length === 0)
      await new Promise(r => setTimeout(r, 10));
    await new Promise(r => setTimeout(r, 200));
    release();
    const [a, b] = await both;

    expect(a.body).toEqual(b.body);
    expect(pullQueries()).toHaveLength(1);
  });

  test.each([
    ['a normal-mode pull', 5],
    ['trash', 1],
    ['a pull the report does not have', 99],
  ])('says %s is not one it plans', async (_case, pull) => {
    const response = await load(pull);

    expect(response.status).toBe(404);
    expect(response.body.errors.body).toEqual([
      "That pull isn't in this report, or isn't an Extreme, Savage or Ultimate fight. Pick one from the report's pulls.",
    ]);
    expect(pullQueries()).toBeEmpty();
  });

  test.each(['abc', '0', '1.5'])('refuses the pull id %s', async pull => {
    const response = await load(pull);

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      "That isn't a pull of this report.",
    ]);
  });

  test("says so when FFLogs doesn't send the pull", async () => {
    delete fflogs.pulls[`${CODE}:3`];

    const response = await load();

    expect(response.status).toBe(502);
    expect(response.body.errors.body).toEqual([
      "FFLogs didn't send that pull. Try again in a few minutes.",
    ]);
  });
});
