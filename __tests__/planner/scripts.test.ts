import 'jest-extended';
import request from 'supertest';
import {app, clearDb, clock, fflogs, fflogsReport, usersClient} from '../utils';
import {refreshGameData} from '../utils/planner-game-data';

const CODE = 'aBcD1234eFgH5678';
const KEY = process.env.DUTIES_REFRESH_KEY!;
const COMMIT = 'e79ea7f16093be5b80cda0e2d5bc8eb899d6fb4b';
// The fake report's Savage pulls are fought here (M5S); its Extreme one in
// 1243, an older zone.
const SAVAGE_ZONE = 1257;
const EXTREME_ZONE = 1243;

// A cactbot timeline, shortened: a sync, mechanics, a branch, a phase and
// the enrage.
const TIMELINE = `### AAC CRUISERWEIGHT M1 (SAVAGE)
# ZoneId: 1257
# -ii A721 A722

hideall "--sync--"
0.0 "--sync--" InCombat { inGameCombat: "1" } window 0,1
14.0 "Deep Cut" Ability { id: "A6C3", source: "Dancing Green" }
30.2 "Flip to A Side" Ability { id: ["A780", "A781"], source: "Dancing Green" } jump "a-side"
40.0 label "a-side"
42.5 "Two Snaps" #Ability { id: "A6E5", source: "Dancing Green" }

### Phase 2: Frogtourage
100.0 "Hi-NRG Fever (enrage)" Ability { id: "A6F0", source: "Dancing Green" }
`;

const store = (body: Record<string, unknown>, key: string | null = KEY) => {
  const req = request(app).post('/api/planner/scripts');
  return (key ? req.set('x-refresh-key', key) : req).send({
    commit: COMMIT,
    path: 'ui/raidboss/data/07-dt/raid/r5s.txt',
    zone: SAVAGE_ZONE,
    text: TIMELINE,
    ...body,
  });
};
const check = (key: string | null = KEY) => {
  const req = request(app).post('/api/planner/scripts/check');
  return key ? req.set('x-refresh-key', key) : req;
};
let token: string;
const script = (pull: number | string = 3, auth = true) => {
  const req = request(app).get(
    `/api/planner/reports/${CODE}/pulls/${pull}/script`,
  );
  return auth ? req.set('authorization', `Token ${token}`) : req;
};

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

describe('POST /api/planner/scripts', () => {
  test('keeps a timeline as its zone’s script, and says what it has', async () => {
    const response = await store({});

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      zone: SAVAGE_ZONE,
      title: 'AAC CRUISERWEIGHT M1 (SAVAGE)',
      mechanicCount: 4,
      enrageCount: 1,
    });
  });

  test.each([[null], ['not-the-key']])(
    'needs the refresh key (%s)',
    async key => {
      const response = await store({}, key);

      expect(response.status).toBe(401);
    },
  );

  test('refuses a file that is no timeline, a short commit and an overlong file', async () => {
    const notTimeline = await store({text: 'export default {};'});
    const commit = await store({commit: 'e79ea7f'});
    const long = await store({text: 'x'.repeat(90_001)});

    expect(notTimeline.status).toBe(422);
    expect(notTimeline.body.errors.body[0]).toContain('has no mechanics');
    expect(commit.status).toBe(422);
    expect(commit.body.errors.body).toEqual([
      'Give the full 40-character commit.',
    ]);
    expect(long.body.errors.body).toEqual([
      'Keep a timeline to 90000 characters.',
    ]);
  });
});

describe('GET /api/planner/reports/:code/pulls/:pullId/script', () => {
  test("answers the pull's fight's mechanics, enrages and where they came from", async () => {
    await store({});

    const response = await script();

    expect(response.status).toBe(200);
    expect(response.body.script).toEqual({
      zone: SAVAGE_ZONE,
      title: 'AAC CRUISERWEIGHT M1 (SAVAGE)',
      mechanics: [
        {
          at: 14_000,
          name: 'Deep Cut',
          ids: [0xa6c3],
          phase: null,
          block: null,
          enrage: false,
        },
        {
          at: 30_200,
          name: 'Flip to A Side',
          ids: [0xa780, 0xa781],
          phase: null,
          block: null,
          enrage: false,
        },
        {
          at: 42_500,
          name: 'Two Snaps',
          ids: [0xa6e5],
          phase: null,
          block: 'a-side',
          enrage: false,
        },
        {
          at: 100_000,
          name: 'Hi-NRG Fever (enrage)',
          ids: [0xa6f0],
          phase: 'Frogtourage',
          block: 'a-side',
          enrage: true,
        },
      ],
      enrageIds: [0xa6f0],
      ignoredIds: [0xa721, 0xa722],
      source: {commit: COMMIT, path: 'ui/raidboss/data/07-dt/raid/r5s.txt'},
    });
  });

  test('answers none for a fight cactbot has no timeline for yet, guests too', async () => {
    const response = await script(3, false);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({script: null});
  });

  test("refuses a pull the planner doesn't cover", async () => {
    const response = await script(5);

    expect(response.status).toBe(404);
  });
});

describe('POST /api/planner/scripts/check', () => {
  test('lists the fights newer than the newest with a script', async () => {
    await store({zone: EXTREME_ZONE});

    const response = await check();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      scriptCount: 1,
      newestZone: EXTREME_ZONE,
      missing: [{zone: SAVAGE_ZONE, kind: 'savage'}],
    });
  });

  test('lists none once the newest fight has one, and needs the key', async () => {
    await store({});

    expect((await check()).body).toMatchObject({
      newestZone: SAVAGE_ZONE,
      missing: [],
    });
    expect((await check(null)).status).toBe(401);
  });
});
