import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {clearDb, clock, db, fflogs, fflogsReport} from '../utils';
import {app} from '../utils';

const CODE = 'aBcD1234eFgH5678';
const STARTED = Date.parse('2026-10-20T19:00:00Z');

const load = (code = CODE) => request(app).get(`/api/planner/reports/${code}`);
const reportQueries = () =>
  fflogs.queries.filter(q => q.query.includes('reportData'));
const encounterQueries = () =>
  fflogs.queries.filter(q => q.query.includes('worldData'));

beforeEach(async () => {
  await clearDb();
  fflogs.reset();
  fflogs.reports[CODE] = fflogsReport();
  clock.now = new Date('2026-10-21T12:00:00Z');
});

afterAll(() => {
  clock.now = undefined;
});

describe('GET /api/planner/available', () => {
  test('says the planner is set up when the site has an FFLogs client', async () => {
    const response = await request(app).get('/api/planner/available');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({available: true});
  });

  test('says it is not without one, and loads no report', async () => {
    const bare = createApp(db, undefined, undefined, undefined, {
      fflogs: {settings: {}, fetch: fflogs.fetch},
    });

    const available = await request(bare).get('/api/planner/available');
    const report = await request(bare).get(`/api/planner/reports/${CODE}`);

    expect(available.body).toEqual({available: false});
    expect(report.status).toBe(503);
    expect(report.body.errors.body).toEqual([
      "The fight planner isn't set up on this site yet.",
    ]);
    expect(fflogs.queries).toBeEmpty();
  });
});

describe('GET /api/planner/reports/:code', () => {
  test("lists the report's Extreme, Savage and Ultimate pulls and their players", async () => {
    const response = await load();

    expect(response.status).toBe(200);
    expect(reportQueries()[0].variables).toEqual({code: CODE});
    expect(response.body).toMatchObject({
      code: CODE,
      title: 'M5S prog',
      startedAt: '2026-10-20T19:00:00.000Z',
      endedAt: '2026-10-20T20:00:00.000Z',
      otherPulls: 1,
    });
    expect(response.body.pulls).toEqual([
      {
        id: 2,
        encounterId: 101,
        name: 'Vamp Fatale',
        kind: 'savage',
        kill: false,
        startedAt: new Date(STARTED + 120_000).toISOString(),
        durationMs: 300_000,
        bossHpLeft: 23.46,
        fightLeft: 23.46,
        phase: null,
        playerIds: [1, 2, 3, 4, 5, 6, 7, 8],
      },
      expect.objectContaining({
        id: 3,
        kind: 'savage',
        kill: true,
        bossHpLeft: 0,
      }),
      expect.objectContaining({id: 4, kind: 'extreme', kill: true, phase: 2}),
    ]);
    expect(response.body.players).toHaveLength(8);
    expect(response.body.players[0]).toEqual({
      id: 1,
      name: 'Player 1',
      server: 'Phoenix',
      job: 'PLD',
      role: 'tank',
    });
    expect(response.body.players.map((p: {job: string}) => p.job)).toEqual([
      'PLD',
      'WAR',
      'WHM',
      'SGE',
      'MNK',
      'VPR',
      'DNC',
      'PCT',
    ]);
  });

  test('marks pulls of Ultimates, and keeps players of an unknown job', async () => {
    fflogs.zones[301] = 'Futures Rewritten (Ultimate)';
    const report = fflogsReport();
    const actors = (report.masterData as {actors: Record<string, unknown>[]})
      .actors;
    actors[0].subType = 'Unknown';
    fflogs.reports[CODE] = {
      ...report,
      fights: [
        {
          id: 1,
          encounterID: 301,
          name: 'Pandora',
          difficulty: 100,
          kill: false,
          startTime: 0,
          endTime: 900_000,
          bossPercentage: 40,
          fightPercentage: 12.5,
          lastPhase: 5,
          friendlyPlayers: [1, 2],
        },
      ],
    };

    const response = await load();

    expect(response.body.pulls).toEqual([
      expect.objectContaining({kind: 'ultimate', fightLeft: 12.5, phase: 5}),
    ]);
    expect(response.body.players[0]).toMatchObject({job: null, role: null});
  });

  test('keeps a finished report, so FFLogs is asked once', async () => {
    await load();
    clock.now = new Date('2026-11-21T12:00:00Z');
    const again = await load();

    expect(again.status).toBe(200);
    expect(again.body.pulls).toHaveLength(3);
    expect(reportQueries()).toHaveLength(1);
  });

  test('reads a report still being logged again after two minutes', async () => {
    clock.now = new Date('2026-10-20T20:10:00Z');
    await load();
    clock.now = new Date('2026-10-20T20:11:59Z');
    await load();
    expect(reportQueries()).toHaveLength(1);

    clock.now = new Date('2026-10-20T20:12:00Z');
    await load();
    expect(reportQueries()).toHaveLength(2);
  });

  test("asks each encounter's zone once, for every report", async () => {
    const other = 'zYxW9876vUtS5432';
    fflogs.reports[other] = fflogsReport({code: other});

    await load();
    await load(other);

    expect(encounterQueries()).toHaveLength(1);
    expect(encounterQueries()[0].query).toContain('encounter(id: 101)');
    expect(encounterQueries()[0].query).toContain('encounter(id: 201)');
    expect(encounterQueries()[0].query).not.toContain('encounter(id: 0)');
  });

  test("keeps the site's token, and asks for a new one when FFLogs stops taking it", async () => {
    const [second, third] = ['zYxW9876vUtS5432', 'qQqQ1111wWwW2222'];
    fflogs.reports[second] = fflogsReport({code: second});
    fflogs.reports[third] = fflogsReport({code: third});
    await load();
    const before = fflogs.tokens;
    await load(second);
    expect(fflogs.tokens).toBe(before);

    fflogs.expiredTokens = 1;
    const response = await load(third);

    expect(response.status).toBe(200);
    expect(fflogs.tokens).toBe(before + 1);
  });
  test('takes anonymous reports', async () => {
    fflogs.reports[`a:${CODE}`] = fflogsReport({code: `a:${CODE}`});

    const response = await load(`a:${CODE}`);

    expect(response.status).toBe(200);
    expect(response.body.code).toBe(`a:${CODE}`);
  });

  test.each([
    ['too short', 'abc'],
    ['with other characters', 'aBcD1234eFgH567!'],
  ])('refuses a code %s', async (_case, code) => {
    const response = await load(encodeURIComponent(code));

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      "That isn't an FFLogs report link. Copy it from the report's page (fflogs.com/reports/…).",
    ]);
    expect(fflogs.queries).toBeEmpty();
  });

  test.each([
    [
      'a report that does not exist',
      () => delete fflogs.reports[CODE],
      404,
      "There's no FFLogs report with that link. Check that it was copied whole.",
    ],
    [
      'a private report',
      () => fflogs.privateCodes.add(CODE),
      403,
      'That FFLogs report is private. Make it public or unlisted on FFLogs, then try again.',
    ],
    [
      'FFLogs being busy',
      () => (fflogs.status = 429),
      502,
      'FFLogs is busy right now. Try again in a few minutes.',
    ],
    [
      'FFLogs failing',
      () => (fflogs.status = 500),
      502,
      "FFLogs couldn't be reached. Try again in a few minutes.",
    ],
  ])('says so for %s', async (_case, arrange, status, message) => {
    arrange();

    const response = await load();

    expect(response.status).toBe(status);
    expect(response.body.errors.body).toEqual([message]);
  });
});
