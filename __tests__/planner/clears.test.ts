import 'jest-extended';
import request from 'supertest';
import {app, clearDb, clock, fflogs, fflogsReport, usersClient} from '../utils';
import {refreshGameData} from '../utils/planner-game-data';

const CODE = 'aBcD1234eFgH5678';

let token: string;
const clears = (pull: number | string = 3, code = CODE) =>
  request(app)
    .get(`/api/planner/reports/${code}/pulls/${pull}/clears`)
    .set('authorization', `Token ${token}`);
const rankingQueries = () =>
  fflogs.queries.filter(q => q.query.includes('fightRankings'));
const ranked = (codes: string[]) =>
  codes.map((code, i) => ({code, fightID: i + 10}));

beforeEach(async () => {
  await clearDb();
  fflogs.reset();
  fflogs.reports[CODE] = fflogsReport();
  clock.now = new Date('2026-10-21T12:00:00Z');
  token = (await usersClient.registerRandomUser()).user.token;
  expect((await refreshGameData()).status).toBe(200);
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/planner/reports/:code/pulls/:pullId/clears', () => {
  test("answers other groups' kills of the pull's fight, fastest first, the group's own left out", async () => {
    fflogs.rankings['101:101'] = ranked([
      'Kill0000000000aa',
      CODE,
      'Kill0000000000bb',
      'Kill0000000000aa',
      'Kill0000000000cc',
      'Kill0000000000dd',
    ]);

    const response = await clears();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      clears: [
        {code: 'Kill0000000000aa', pullId: 10},
        {code: 'Kill0000000000bb', pullId: 12},
        {code: 'Kill0000000000cc', pullId: 14},
      ],
    });
    // The Savage fight's difficulty, as FFLogs numbers it.
    expect(rankingQueries()[0].variables).toEqual({
      encounter: 101,
      difficulty: 101,
    });
  });

  test('offers the most recent kills first: FFLogs archives old reports', async () => {
    fflogs.rankings['101:101'] = [
      {code: 'Kill0000000000aa', fightID: 1, startTime: 1_000},
      {code: 'Kill0000000000bb', fightID: 2, startTime: 3_000},
      {code: 'Kill0000000000cc', fightID: 3, startTime: 2_000},
    ];

    const response = await clears();

    expect(response.body.clears.map((c: {code: string}) => c.code)).toEqual([
      'Kill0000000000bb',
      'Kill0000000000cc',
      'Kill0000000000aa',
    ]);
  });

  test("asks FFLogs for an Extreme fight's kills at its own difficulty", async () => {
    fflogs.rankings['201:100'] = ranked(['Kill0000000000ee']);

    const response = await clears(4);

    expect(response.status).toBe(200);
    expect(response.body.clears).toEqual([
      {code: 'Kill0000000000ee', pullId: 10},
    ]);
  });

  test('keeps the kills a week, then asks FFLogs again', async () => {
    fflogs.rankings['101:101'] = ranked(['Kill0000000000aa']);
    await clears();
    fflogs.rankings['101:101'] = ranked(['Kill0000000000bb']);

    expect((await clears()).body.clears[0].code).toBe('Kill0000000000aa');
    expect(rankingQueries()).toHaveLength(1);

    clock.now = new Date('2026-10-28T12:00:01Z');
    expect((await clears()).body.clears[0].code).toBe('Kill0000000000bb');
    expect(rankingQueries()).toHaveLength(2);
  });

  test('answers none when FFLogs ranks no kill', async () => {
    const response = await clears();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({clears: []});
  });

  test('counts a guest asking FFLogs as a report lookup, and not a kept answer', async () => {
    fflogs.rankings['101:101'] = ranked(['Kill0000000000aa']);
    const asGuest = () =>
      request(app)
        .get(`/api/planner/reports/${CODE}/pulls/3/clears`)
        .set('cf-connecting-ip', '203.0.113.1');

    expect((await asGuest()).status).toBe(200);
    expect((await asGuest()).status).toBe(200);

    // The report and the rankings: two lookups, the second request none.
    expect(fflogs.queries).toHaveLength(2);
  });

  test("refuses a pull the report doesn't cover, and a malformed one", async () => {
    const missing = await clears(9);
    expect(missing.status).toBe(404);
    expect(missing.body.errors.body[0]).toContain(
      "That pull isn't in this report",
    );

    const malformed = await clears('x');
    expect(malformed.status).toBe(422);
    expect(malformed.body.errors.body[0]).toBe(
      "That isn't a pull of this report.",
    );
  });
});
