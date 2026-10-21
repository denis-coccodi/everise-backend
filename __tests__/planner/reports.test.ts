import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {
  app,
  clearDb,
  clock,
  db,
  fflogs,
  fflogsReport,
  usersClient,
  xivApi,
} from '../utils';
import {TERRITORIES} from '../utils/fake-fflogs';
import {duty} from '../utils/fake-xivapi';

const CODE = 'aBcD1234eFgH5678';
const STARTED = Date.parse('2026-10-20T19:00:00Z');

let token: string;
const load = (code = CODE) =>
  request(app)
    .get(`/api/planner/reports/${code}`)
    .set('authorization', `Token ${token}`);
const reportQueries = () =>
  fflogs.queries.filter(q => q.query.includes('reportData'));

// The game data's high-end duties, with the territories they're fought in:
// the Extreme trial's name doesn't say Extreme.
const territory = (id: number) => ({'TerritoryType@as(raw)': id});
function refreshGameData() {
  xivApi.reset();
  xivApi.sheets.ContentFinderCondition.push(
    duty(
      20,
      "the Minstrel's Ballad: Sphene's Burden",
      4,
      territory(TERRITORIES.ballad),
    ),
    duty(21, 'AAC Cruiserweight M1 (Savage)', 5, territory(TERRITORIES.savage)),
    duty(22, 'AAC Cruiserweight M1', 5, territory(TERRITORIES.normal)),
    duty(
      23,
      'Futures Rewritten (Ultimate)',
      28,
      territory(TERRITORIES.ultimate),
    ),
    duty(
      24,
      'the Akh Afah Amphitheatre (Unreal)',
      4,
      territory(TERRITORIES.unreal),
    ),
  );
  return request(app)
    .post('/api/duties/refresh')
    .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!);
}

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
  xivApi.reset();
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
    const report = await request(bare)
      .get(`/api/planner/reports/${CODE}`)
      .set('authorization', `Token ${token}`);

    expect(available.body).toEqual({available: false});
    expect(report.status).toBe(503);
    expect(report.body.errors.body).toEqual([
      "The fight planner isn't set up on this site yet.",
    ]);
    expect(fflogs.queries).toBeEmpty();
  });
});

describe('GET /api/planner/reports/:code', () => {
  test('is for members only', async () => {
    const response = await request(app).get(`/api/planner/reports/${CODE}`);

    expect(response.status).toBe(401);
    expect(fflogs.queries).toBeEmpty();
  });

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
          gameZone: {id: TERRITORIES.ultimate},
        },
        {
          id: 2,
          encounterID: 302,
          name: 'Ultima',
          difficulty: 100,
          kill: true,
          startTime: 1_000_000,
          endTime: 1_400_000,
          bossPercentage: 0,
          fightPercentage: 0,
          lastPhase: 0,
          friendlyPlayers: [1, 2],
          gameZone: {id: TERRITORIES.unreal},
        },
      ],
    };

    const response = await load();

    expect(response.body.pulls).toEqual([
      expect.objectContaining({kind: 'ultimate', fightLeft: 12.5, phase: 5}),
    ]);
    // Unreal trials aren't covered.
    expect(response.body.otherPulls).toBe(1);
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

  test('reads a finished report again when it was kept by an older version', async () => {
    await load();
    const kept = await db.get('fflogsReports', CODE);
    await db.set('fflogsReports', CODE, {...kept, version: undefined});

    const again = await load();

    expect(again.status).toBe(200);
    expect(reportQueries()).toHaveLength(2);
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

  test('without game data, counts only the Savage pulls, then shows the others once it is read', async () => {
    xivApi.reset();
    await request(app)
      .post('/api/duties/refresh')
      .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!);

    const before = await load();
    expect(before.body.pulls.map((p: {id: number}) => p.id)).toEqual([2, 3]);
    expect(before.body.otherPulls).toBe(2);

    await refreshGameData();
    const after = await load();

    expect(after.body.pulls.map((p: {id: number}) => p.id)).toEqual([2, 3, 4]);
    expect(reportQueries()).toHaveLength(1);
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
