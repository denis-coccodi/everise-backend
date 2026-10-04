import 'jest-extended';
import request from 'supertest';
import {app} from '../utils/app';
import {clearDb, clock, xivApi} from '../utils';
import {duty} from '../utils/fake-xivapi';
import {frontlineMapAt} from '../../src/duties/frontline-rotation';

const REFRESH_KEY = process.env.DUTIES_REFRESH_KEY!;

function refresh(key: string | null = REFRESH_KEY) {
  const req = request(app).post('/api/duties/refresh');
  return key === null ? req.send() : req.set('X-Refresh-Key', key).send();
}

function groupNames(body: {groups: {name: string}[]}) {
  return body.groups.map(g => g.name);
}

describe('FFXIV duties', () => {
  beforeEach(async () => {
    await clearDb();
    xivApi.reset();
    clock.now = undefined;
  });

  describe('before any refresh', () => {
    test('GET /api/duties should return empty lists', async () => {
      const response = await request(app).get('/api/duties').send();

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        dataVersion: null,
        fetchedAt: null,
        groups: [],
      });
    });

    test('GET /api/roulettes should return empty lists', async () => {
      const response = await request(app).get('/api/roulettes').send();

      expect(response.status).toBe(200);
      expect(response.body).toStrictEqual({
        dataVersion: null,
        fetchedAt: null,
        roulettes: [],
      });
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
        rouletteCount: 1,
        groups: [
          {name: 'Dungeons', count: 1},
          {name: 'Trials — Extreme', count: 1},
          {name: 'Raids — Ultimate', count: 1},
          {name: 'Alliance Raids', count: 1},
          {name: 'Treasure Hunt', count: 1},
          {name: 'PvP', count: 4},
        ],
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
        },
      ]);
    });
  });

  describe('Frontline rotation', () => {
    // 2026-10-04 before the 15:00 UTC reset is a Seal Rock day (its second slot
    // in the cycle); the next day is the Borderland Ruins.
    const SEAL_ROCK_DAY = new Date('2026-10-04T10:00:00Z');
    const BORDERLAND_RUINS_DAY = new Date('2026-10-04T15:00:00Z');

    function namesWhere(
      body: {groups: {duties: {name: string}[]}[]},
      test: (duty: Record<string, unknown>) => boolean
    ) {
      return body.groups
        .flatMap(g => g.duties)
        .filter(d => test(d))
        .map(d => d.name);
    }

    test('should follow the community wiki formula', () => {
      // The wiki template: (((unix + 32400) div 86400) - 20406) mod 8.
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
        const day = Math.floor((at.getTime() / 1000 + 32400) / 86400) - 20406;
        expect(frontlineMapAt(at).map).toBe(wikiMaps[((day % 8) + 8) % 8]);
      }
    });

    test('a day should run from one 15:00 UTC reset to the next', () => {
      expect(frontlineMapAt(SEAL_ROCK_DAY)).toStrictEqual({
        map: 'Seal Rock (Seize)',
        from: new Date('2026-10-03T15:00:00Z'),
        until: new Date('2026-10-04T15:00:00Z'),
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
          from: '2026-10-03T15:00:00.000Z',
          until: '2026-10-04T15:00:00.000Z',
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
        expect(response.body.schedule[1].from).toBe('2026-10-04T15:00:00.000Z');
      });
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
