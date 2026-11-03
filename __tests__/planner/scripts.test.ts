import 'jest-extended';
import request from 'supertest';
import {
  app,
  cactbot,
  clearDb,
  clock,
  db,
  fflogs,
  fflogsReport,
  jobs,
  usersClient,
} from '../utils';
import {refreshGameData} from '../utils/planner-game-data';

const CODE = 'aBcD1234eFgH5678';
const KEY = process.env.DUTIES_REFRESH_KEY!;
const DIR = 'ui/raidboss/data/07-dt';
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
// An older timeline, without a ZoneId line: its triggers name the zone.
const OLD_TIMELINE = `### Sphene's Burden
10.0 "Legitimate Force" Ability { id: "8F92", source: "Queen Eternal" }
`;

// Cactbot's repository: two fights, an older one, and files the planner
// leaves out (a normal raid, an unreal trial).
function repository() {
  cactbot.files = {
    [`${DIR}/raid/r5s.txt`]: TIMELINE,
    [`${DIR}/raid/r5s.ts`]: 'export default {};',
    [`${DIR}/raid/r5n.txt`]: TIMELINE.replace('1257', '1256'),
    [`${DIR}/trial/queen-eternal-ex.txt`]: OLD_TIMELINE,
    [`${DIR}/trial/queen-eternal-ex.ts`]:
      'const triggerSet = {\n  zoneId: ZoneId.TheMinstrelsBalladSphenesBurden,\n};',
    [`${DIR}/trial/byakko-un.txt`]: TIMELINE.replace('1257', '1300'),
    'resources/zone_id.ts': `const data = {\n  'TheMinstrelsBalladSphenesBurden': ${EXTREME_ZONE},\n  'Other': 1,\n};`,
  };
}

const sync = (key: string | null = KEY) => {
  const req = request(app).post('/api/planner/scripts/sync');
  return key ? req.set('x-refresh-key', key) : req;
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
const read = (path: string) =>
  cactbot.requests.filter(url => url.endsWith(path)).length;

beforeEach(async () => {
  await clearDb();
  fflogs.reset();
  fflogs.reports[CODE] = fflogsReport();
  cactbot.reset();
  repository();
  clock.now = new Date('2026-10-21T12:00:00Z');
  token = (await usersClient.registerRandomUser()).user.token;
  expect((await refreshGameData()).status).toBe(200);
});

afterAll(() => {
  clock.now = undefined;
});

describe('POST /api/planner/scripts/sync', () => {
  test("keeps cactbot's Savage, Extreme and Ultimate timelines, the zone from an older file's triggers", async () => {
    const response = await sync();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      busy: false,
      commit: cactbot.commit,
      pending: 0,
      kept: [SAVAGE_ZONE, EXTREME_ZONE],
    });
    // The normal raid and the unreal trial aren't read.
    expect(read('r5n.txt')).toBe(0);
    expect(read('byakko-un.txt')).toBe(0);
  });

  test("keeps older expansions' fights too, which are played with today's jobs", async () => {
    const data = 'ui/raidboss/data';
    const at = (zone: number) => TIMELINE.replace('1257', String(zone));
    cactbot.files = {
      [`${data}/06-ew/raid/p1s.txt`]: at(1003),
      [`${data}/06-ew/raid/p1n.txt`]: at(1002),
      [`${data}/04-sb/ultimate/unending_coil_ultimate.txt`]: at(733),
      [`${data}/02-arr/trial/ultima-ex.txt`]: at(1048),
      [`${data}/02-arr/trial/titan-hm.txt`]: at(1047),
      [`${data}/00-misc/test.txt`]: at(1),
    };

    const first = await sync();

    expect(first.body).toMatchObject({pending: 0});
    expect([...first.body.kept].sort((a, b) => a - b)).toEqual([
      733, 1003, 1048,
    ]);
  });

  test('lists cactbot again after the files it lists changed, its commit the same', async () => {
    // Synced with the earlier listing (the latest expansion only).
    await db.set('plannerScriptsSync', 'cactbot', {
      commit: cactbot.commit,
      etag: `"${cactbot.commit}"`,
      listing: 1,
      checkedAt: 0,
      files: {},
      pending: [],
      until: 0,
    });

    const response = await sync();

    expect(response.body.kept).toEqual([SAVAGE_ZONE, EXTREME_ZONE]);
  });

  test('reads a few files a call', async () => {
    for (const n of [6, 7, 8]) {
      cactbot.files[`${DIR}/raid/r${n}s.txt`] = TIMELINE.replace(
        '1257',
        String(1257 + n),
      );
    }

    const first = await sync();
    const second = await sync();

    expect(first.body).toMatchObject({pending: 2});
    expect(first.body.kept).toHaveLength(3);
    expect(second.body).toMatchObject({pending: 0});
    expect(second.body.kept).toHaveLength(2);
  });

  test('reads again only the files a new commit changed', async () => {
    await sync();
    cactbot.requests = [];
    cactbot.commit = 'b'.repeat(40);
    cactbot.files[`${DIR}/raid/r5s.txt`] = TIMELINE.replace(
      'Deep Cut',
      'Deeper Cut',
    );

    const response = await sync();

    expect(response.body).toMatchObject({
      commit: cactbot.commit,
      kept: [SAVAGE_ZONE],
    });
    expect(read('queen-eternal-ex.txt')).toBe(0);
    expect((await script()).body.script.mechanics[0].name).toBe('Deeper Cut');
  });

  test('tries a file that fails again, then gives it up', async () => {
    cactbot.failing.add(`${DIR}/raid/r5s.txt`);

    const runs = [];
    for (let i = 0; i < 4; i++) runs.push((await sync()).body);

    expect(runs.map(run => run.pending)).toEqual([1, 1, 0, 0]);
    expect(read('r5s.txt')).toBe(3);
  });

  test.each([[null], ['not-the-key']])(
    'needs the refresh key (%s)',
    async key => {
      expect((await sync(key)).status).toBe(401);
    },
  );
});

describe('the cron trigger', () => {
  test("asks for cactbot's commit about once an hour, and nothing more while it's the same", async () => {
    await jobs.readScripts?.();
    cactbot.requests = [];

    clock.now = new Date('2026-10-21T12:30:00Z');
    await jobs.readScripts?.();
    expect(cactbot.requests).toEqual([]);

    clock.now = new Date('2026-10-21T13:01:00Z');
    await jobs.readScripts?.();
    // Asked with its ETag: unchanged, so nothing is listed or read.
    expect(cactbot.requests).toEqual([
      'https://api.github.com/repos/OverlayPlugin/cactbot/commits/main',
    ]);
  });
});

describe('GET /api/planner/reports/:code/pulls/:pullId/script', () => {
  test("answers the pull's fight's mechanics, enrages and where they came from", async () => {
    await sync();

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
      source: {commit: cactbot.commit, path: `${DIR}/raid/r5s.txt`},
    });
  });

  test('answers none for a fight cactbot has no timeline for yet, guests too', async () => {
    const response = await script(3, false);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({script: null});
  });

  test("refuses a pull the planner doesn't cover", async () => {
    expect((await script(5)).status).toBe(404);
  });
});

describe('POST /api/planner/scripts/check', () => {
  test('lists the fights newer than the newest with a script', async () => {
    delete cactbot.files[`${DIR}/raid/r5s.txt`];
    await sync();

    const response = await check();

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      scriptCount: 1,
      newestZone: EXTREME_ZONE,
      missing: [{zone: SAVAGE_ZONE, kind: 'savage'}],
    });
  });

  test('lists none once the newest fight has one, and needs the key', async () => {
    await sync();

    expect((await check()).body).toMatchObject({
      newestZone: SAVAGE_ZONE,
      missing: [],
    });
    expect((await check(null)).status).toBe(401);
  });
});
