import 'jest-extended';
import request from 'supertest';
import {app} from '../utils/app';
import {clearDb, clock, xivApi} from '../utils';
import {duty, imageBytes} from '../utils/fake-xivapi';
import {frontlineMapAt} from '../../src/duties/frontline-rotation';

const REFRESH_KEY = process.env.DUTIES_REFRESH_KEY!;

function refresh(key: string | null = REFRESH_KEY) {
  const req = request(app).post('/api/duties/refresh');
  return key === null ? req.send() : req.set('X-Refresh-Key', key).send();
}

function groupNames(body: {groups: {name: string}[]}) {
  return body.groups.map(g => g.name);
}

function downloadImages(key: string | null = REFRESH_KEY) {
  const req = request(app).post('/api/duties/refresh/images');
  return key === null ? req.send() : req.set('X-Refresh-Key', key).send();
}

// Calls the image download until nothing is pending, like the workflow.
async function downloadAllImages() {
  for (let call = 0; call < 20; call++) {
    const response = await downloadImages();
    expect(response.status).toBe(200);
    if (response.body.pending === 0) return response;
  }
  throw new Error('image downloads never finished');
}

function getImage(id: number) {
  return request(app)
    .get(`/api/images/${id}`)
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    })
    .send();
}

// The images in the fake game data: the job icons (62100 + job id), the duty
// type icons, and the roulette and duty banners (112000 + duty row).
const IMAGE_COUNT = 6 + 5 + 1 + 1 + 9;

describe('FFXIV duties', () => {
  beforeEach(async () => {
    await clearDb();
    xivApi.reset();
    clock.now = undefined;
  });

  describe('before any refresh', () => {
    test('GET /api/duties should return empty lists', async () => {
      clock.now = new Date('2026-10-04T10:00:00Z');

      const response = await request(app).get('/api/duties').send();

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.body).toStrictEqual({
        dataVersion: null,
        fetchedAt: null,
        dayEndsAt: '2026-10-04T15:00:00.000Z',
        groups: [],
      });
    });

    test('GET /api/roulettes should return empty lists', async () => {
      const response = await request(app).get('/api/roulettes').send();

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        dataVersion: null,
        fetchedAt: null,
        icon: null,
        roulettes: [],
      });
    });

    test('GET /api/jobs should return an empty list', async () => {
      const response = await request(app).get('/api/jobs').send();

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        dataVersion: null,
        fetchedAt: null,
        jobs: [],
      });
    });

    test('GET /api/images/:id should return 404', async () => {
      const response = await getImage(62119);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/duties/refresh', () => {
    test.each([
      ['no key', null],
      ['a wrong key', 'wrong-key'],
      ['an empty key', ''],
    ])(
      'given %s, should return 401 and not call XIVAPI',
      async (_label, key) => {
        const response = await refresh(key);

        expect(response.status).toBe(401);
        expect(xivApi.requests).toBeEmpty();
      }
    );

    test('given the key, should cache the lists and return a summary', async () => {
      const response = await refresh();

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        dataVersion: 'test-version',
        fetchedAt: expect.any(String),
        dutyCount: 9,
        rouletteCount: 2,
        jobCount: 6,
        groups: [
          {name: 'Dungeons', count: 1},
          {name: 'Trials — Extreme', count: 1},
          {name: 'Raids — Ultimate', count: 1},
          {name: 'Alliance Raids', count: 1},
          {name: 'Treasure Hunt', count: 1},
          {name: 'PvP', count: 4},
        ],
        images: {total: IMAGE_COUNT, pending: IMAGE_COUNT, failed: []},
      });
    });

    test('given XIVAPI fails, should return 502 and keep the cached lists', async () => {
      await refresh();
      const before = await request(app).get('/api/duties').send();

      xivApi.failing = true;
      const response = await refresh();

      expect(response.status).toBe(502);
      const after = await request(app).get('/api/duties').send();
      expect(after.body).toStrictEqual(before.body);
    });

    test('a second refresh should replace the lists, not add to them', async () => {
      await refresh();

      xivApi.sheets.ContentFinderCondition.push(
        duty(10, 'Copperbell Mines', 2)
      );
      await refresh();

      const response = await request(app).get('/api/duties').send();
      expect(groupNames(response.body)).toStrictEqual([
        'Dungeons',
        'Trials — Extreme',
        'Raids — Ultimate',
        'Alliance Raids',
        'Treasure Hunt',
        'PvP',
      ]);
      expect(
        response.body.groups[0].duties.map((d: {name: string}) => d.name)
      ).toStrictEqual(['Sastasha', 'Copperbell Mines']);
    });
  });

  describe('after a refresh', () => {
    beforeEach(async () => {
      await refresh();
    });

    test('GET /api/duties should return the duties grouped by type', async () => {
      const response = await request(app).get('/api/duties').send();

      expect(response.status).toBe(200);
      expect(response.body.dataVersion).toBe('test-version');
      expect(response.body.fetchedAt).toBeString();
      // Quest battles and unnamed rows are left out; the duplicate Sastasha
      // row is listed once.
      expect(groupNames(response.body)).toStrictEqual([
        'Dungeons',
        'Trials — Extreme',
        'Raids — Ultimate',
        'Alliance Raids',
        'Treasure Hunt',
        'PvP',
      ]);

      expect(response.body.groups[0]).toStrictEqual({
        name: 'Dungeons',
        order: 0,
        icon: 61801,
        duties: [
          {
            id: 1,
            name: 'Sastasha',
            finder: 'Duty Finder',
            expansion: 'A Realm Reborn',
            level: 15,
            levelSync: 20,
            itemLevel: 0,
            itemLevelSync: 0,
            joinPartyInProgress: true,
            unrestrictedParty: true,
            minimumIL: true,
            explorerMode: true,
            dutyRecorder: false,
            highEnd: false,
            pvp: false,
            pvpType: '',
            roulettes: ['LevelingRoulette'],
            sortKey: 1,
            image: 112001,
            activeFrontline: false,
          },
        ],
      });
    });

    test('duties in the Raid Finder should say so', async () => {
      const response = await request(app).get('/api/duties').send();

      const [ultimate] = response.body.groups[2].duties;
      expect(ultimate).toMatchObject({
        name: 'Dancing Mad (Ultimate)',
        finder: 'Raid Finder',
        expansion: 'Dawntrail',
        unrestrictedParty: false,
        itemLevel: 760,
      });
    });

    test('a duty entered at level 1 that syncs to a level should take the sync level', async () => {
      const response = await request(app).get('/api/duties').send();

      const treasure = response.body.groups.find(
        (g: {name: string}) => g.name === 'Treasure Hunt'
      );
      expect(treasure.duties[0]).toMatchObject({
        name: 'the Excitatron 6000',
        level: 90,
        levelSync: 90,
      });
    });

    test('duties outside the Duty Finder and Raid Finder should allow no Duty Finder settings', async () => {
      const response = await request(app).get('/api/duties').send();

      const treasure = response.body.groups.find(
        (g: {name: string}) => g.name === 'Treasure Hunt'
      );
      // The fake game data marks all four as allowed.
      expect(treasure.duties[0]).toMatchObject({
        finder: '',
        joinPartyInProgress: false,
        unrestrictedParty: false,
        minimumIL: false,
        explorerMode: false,
      });
    });

    test('GET /api/roulettes should return the roulettes in the Duty Finder', async () => {
      const response = await request(app).get('/api/roulettes').send();

      expect(response.status).toBe(200);
      expect(response.body.dataVersion).toBe('test-version');
      expect(response.body.icon).toBe(61807);
      expect(response.body.roulettes).toStrictEqual([
        {
          id: 1,
          name: 'Duty Roulette: Leveling',
          category: 'Leveling',
          dutyType: 'Light Party Dungeons & Trials',
          expansion: 'A Realm Reborn',
          level: 16,
          syncedFromLevel: 16,
          itemLevel: 0,
          itemLevelSync: 0,
          joinPartyInProgress: true,
          timeLimitMinutes: 90,
          pvp: false,
          goldSaucer: false,
          description: 'A dungeon or trial will be selected at random.',
          sortKey: 4,
          image: 112034,
        },
        {
          id: 3,
          name: 'Frontline (Daily Challenge)',
          category: 'PvP',
          dutyType: 'PvP',
          expansion: 'A Realm Reborn',
          level: 30,
          syncedFromLevel: 0,
          itemLevel: 0,
          itemLevelSync: 0,
          joinPartyInProgress: true,
          timeLimitMinutes: 20,
          pvp: true,
          goldSaucer: false,
          description: "Today's Frontline map.",
          sortKey: 20,
          image: null,
        },
      ]);
    });

    test('duty groups should take the icon of their content type', async () => {
      const response = await request(app).get('/api/duties').send();

      expect(
        response.body.groups.map((g: {name: string; icon: number | null}) => [
          g.name,
          g.icon,
        ])
      ).toStrictEqual([
        ['Dungeons', 61801],
        ['Trials — Extreme', 61804],
        ['Raids — Ultimate', 61832],
        ['Alliance Raids', 61802],
        // The fake content type has no icon.
        ['Treasure Hunt', null],
        ['PvP', 61806],
      ]);
    });

    test("GET /api/jobs should return the combat jobs in the game's order", async () => {
      const response = await request(app).get('/api/jobs').send();

      expect(response.status).toBe(200);
      expect(response.body.dataVersion).toBe('test-version');
      // Classes and crafters are left out; ranged jobs are split by discipline.
      expect(response.body.jobs).toStrictEqual([
        {
          id: 19,
          name: 'Paladin',
          abbreviation: 'PLD',
          role: 'Tank',
          startingLevel: 1,
          limited: false,
          icon: 62119,
        },
        expect.objectContaining({name: 'White Mage', role: 'Healer'}),
        expect.objectContaining({
          name: 'Viper',
          role: 'Melee DPS',
          startingLevel: 80,
        }),
        expect.objectContaining({name: 'Bard', role: 'Physical Ranged DPS'}),
        expect.objectContaining({
          name: 'Black Mage',
          role: 'Magical Ranged DPS',
        }),
        expect.objectContaining({name: 'Blue Mage', limited: true}),
      ]);
    });
  });

  describe('game images', () => {
    beforeEach(async () => {
      await refresh();
    });

    test.each([
      ['no key', null],
      ['a wrong key', 'wrong-key'],
    ])(
      'POST /api/duties/refresh/images given %s should return 401',
      async (_label, key) => {
        xivApi.requests = [];

        const response = await downloadImages(key);

        expect(response.status).toBe(401);
        expect(xivApi.requests).toBeEmpty();
      }
    );

    test('should be downloaded in batches until none are pending', async () => {
      // Enough extra duties, each with its own banner, for several batches.
      for (let row = 1000; row < 1060; row++) {
        xivApi.sheets.ContentFinderCondition.push(
          duty(row, `Dungeon ${row}`, 2)
        );
      }
      const started = await refresh();
      const total = IMAGE_COUNT + 60;
      expect(started.body.images).toStrictEqual({
        total,
        pending: total,
        failed: [],
      });

      const first = await downloadImages();
      expect(first.body).toStrictEqual({
        total,
        pending: total - 25,
        failed: [],
        downloaded: 25,
      });

      const last = await downloadAllImages();
      expect(last.body).toMatchObject({total, pending: 0, failed: []});

      // Nothing left to do.
      const after = await downloadImages();
      expect(after.body).toMatchObject({pending: 0, downloaded: 0});
    });

    test('GET /api/images/:id should serve a downloaded image', async () => {
      await downloadAllImages();

      const icon = await getImage(62119);
      expect(icon.status).toBe(200);
      expect(icon.headers['content-type']).toBe('image/png');
      expect(icon.headers['cache-control']).toBe('public, max-age=604800');
      expect(icon.body).toStrictEqual(
        Buffer.from(imageBytes('ui/icon/062000/062119_hr1.tex', 'png'))
      );

      const banner = await getImage(112001);
      expect(banner.headers['content-type']).toBe('image/jpeg');
      expect(banner.body).toStrictEqual(
        Buffer.from(imageBytes('ui/icon/112000/112001_hr1.tex', 'jpg'))
      );
    });

    test('images XIVAPI does not have should be reported, not retried', async () => {
      xivApi.missingImages.add(112003);

      const response = await downloadAllImages();

      expect(response.body).toMatchObject({pending: 0, failed: [112003]});
      expect((await getImage(112003)).status).toBe(404);
      expect((await getImage(112001)).status).toBe(200);
    });

    test('given XIVAPI fails, should return 502 and keep the batch pending', async () => {
      xivApi.failingImages.add(62119);

      const failed = await downloadImages();
      expect(failed.status).toBe(502);

      xivApi.failingImages.clear();
      const response = await downloadAllImages();
      expect(response.body).toMatchObject({pending: 0, failed: []});
      expect((await getImage(62119)).status).toBe(200);
    });

    test('a refresh should download every image again and remove unused ones', async () => {
      await downloadAllImages();

      // Sastasha loses its banner.
      xivApi.sheets.ContentFinderCondition =
        xivApi.sheets.ContentFinderCondition.map(row =>
          row.row_id === 1
            ? {...row, fields: {...row.fields, 'Image@as(raw)': 0}}
            : row
        );
      const started = await refresh();
      expect(started.body.images.pending).toBe(IMAGE_COUNT - 1);

      // Until the downloads finish, the old images are still served.
      expect((await getImage(112001)).status).toBe(200);

      xivApi.requests = [];
      await downloadAllImages();

      expect(
        xivApi.requests.filter(url => url.includes('/asset?'))
      ).toHaveLength(IMAGE_COUNT - 1);
      expect((await getImage(112001)).status).toBe(404);
      expect((await getImage(112002)).status).toBe(200);
    });
  });

  describe('Frontline rotation', () => {
    // 2026-10-05 before the 15:00 UTC reset is a Seal Rock day (its second slot
    // in the cycle); the next day is the Borderland Ruins, which the game's
    // Duty Finder showed on the morning of 2026-10-06.
    const SEAL_ROCK_DAY = new Date('2026-10-05T10:00:00Z');
    const BORDERLAND_RUINS_DAY = new Date('2026-10-05T15:00:00Z');

    function namesWhere(
      body: {groups: {duties: {name: string}[]}[]},
      test: (duty: Record<string, unknown>) => boolean
    ) {
      return body.groups
        .flatMap(g => g.duties)
        .filter(d => test(d))
        .map(d => d.name);
    }

    test("should follow the community wiki's formula, a day later", () => {
      // The wiki template: (((unix + 32400) div 86400) - 20406) mod 8; the
      // game was a day behind it on 2026-10-06, hence 20407.
      const wikiMaps = [
        'Seal Rock (Seize)',
        'the Fields of Glory (Shatter)',
        'Onsal Hakair (Danshig Naadam)',
        'Worqor Chirteh (Triumph)',
        'Seal Rock (Seize)',
        'the Borderland Ruins (Secure)',
        'Onsal Hakair (Danshig Naadam)',
        'Worqor Chirteh (Triumph)',
      ];
      const start = Date.UTC(2025, 10, 1);
      for (let hour = 0; hour < 24 * 400; hour += 5) {
        const at = new Date(start + hour * 3600 * 1000);
        const day = Math.floor((at.getTime() / 1000 + 32400) / 86400) - 20407;
        expect(frontlineMapAt(at).map).toBe(wikiMaps[((day % 8) + 8) % 8]);
      }
    });

    test('a day should run from one 15:00 UTC reset to the next', () => {
      expect(frontlineMapAt(SEAL_ROCK_DAY)).toStrictEqual({
        map: 'Seal Rock (Seize)',
        from: new Date('2026-10-04T15:00:00Z'),
        until: new Date('2026-10-05T15:00:00Z'),
      });
      expect(frontlineMapAt(BORDERLAND_RUINS_DAY).map).toBe(
        'the Borderland Ruins (Secure)'
      );
    });

    describe('after a refresh', () => {
      beforeEach(async () => {
        await refresh();
      });

      test('PvP duties should say which kind of PvP they are', async () => {
        const response = await request(app).get('/api/duties').send();

        const pvp = response.body.groups.find(
          (g: {name: string}) => g.name === 'PvP'
        );
        expect(
          pvp.duties.map((d: {name: string; pvpType: string}) => [
            d.name,
            d.pvpType,
          ])
        ).toIncludeSameMembers([
          ['Seal Rock (Seize)', 'Frontline'],
          ['the Borderland Ruins (Secure)', 'Frontline'],
          ['Hidden Gorge', 'Rival Wings'],
          [
            'Crystalline Conflict (Custom Match - The Palaistra)',
            'Crystalline Conflict',
          ],
        ]);
        expect(
          namesWhere(response.body, d => d.pvpType !== '' && !d.pvp)
        ).toBeEmpty();
      });

      test.each([
        [SEAL_ROCK_DAY, 'Seal Rock (Seize)'],
        [BORDERLAND_RUINS_DAY, 'the Borderland Ruins (Secure)'],
      ])(
        'at %s, only %s should be the active Frontline map',
        async (now, map) => {
          clock.now = now;

          const response = await request(app).get('/api/duties').send();

          expect(
            namesWhere(response.body, d => d.activeFrontline === true)
          ).toStrictEqual([map]);
        }
      );

      test('GET /api/frontline should return today and the rest of the cycle', async () => {
        clock.now = SEAL_ROCK_DAY;

        const response = await request(app).get('/api/frontline').send();

        expect(response.status).toBe(200);
        expect(response.body.active).toStrictEqual({
          map: 'Seal Rock (Seize)',
          dutyId: 130,
          from: '2026-10-04T15:00:00.000Z',
          until: '2026-10-05T15:00:00.000Z',
        });
        expect(
          response.body.schedule.map(
            (d: {map: string; dutyId: number | null}) => [d.map, d.dutyId]
          )
        ).toStrictEqual([
          ['Seal Rock (Seize)', 130],
          ['the Borderland Ruins (Secure)', 127],
          // null: not in the fake game data.
          ['Onsal Hakair (Danshig Naadam)', null],
          ['Worqor Chirteh (Triumph)', null],
          ['Seal Rock (Seize)', 130],
          ['the Fields of Glory (Shatter)', null],
          ['Onsal Hakair (Danshig Naadam)', null],
          ['Worqor Chirteh (Triumph)', null],
        ]);
        expect(response.body.schedule[1].from).toBe('2026-10-05T15:00:00.000Z');
      });
    });

    test('the map should change at 15:00 UTC whatever the season', async () => {
      // 17:00 in Italy in summer (CEST), 16:00 in winter (CET): the same
      // UTC hour on either side of the clocks changing on 2026-10-25.
      for (const [before, after] of [
        ['2026-10-24T14:59:59Z', '2026-10-24T15:00:00Z'],
        ['2026-10-26T14:59:59Z', '2026-10-26T15:00:00Z'],
      ]) {
        const day = frontlineMapAt(new Date(before));
        expect(day.until).toStrictEqual(new Date(after));
        expect(frontlineMapAt(new Date(after)).from).toStrictEqual(
          new Date(after)
        );
      }
    });

    test('GET /api/frontline should work before any refresh', async () => {
      clock.now = SEAL_ROCK_DAY;

      const response = await request(app).get('/api/frontline').send();

      expect(response.status).toBe(200);
      expect(response.body.active).toMatchObject({
        map: 'Seal Rock (Seize)',
        dutyId: null,
      });
    });
  });
});
