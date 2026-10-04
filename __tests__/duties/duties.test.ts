import 'jest-extended';
import request from 'supertest';
import {app} from '../utils/app';
import {clearDb, xivApi} from '../utils';
import {duty} from '../utils/fake-xivapi';

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
        dutyCount: 4,
        rouletteCount: 1,
        groups: [
          {name: 'Dungeons', count: 1},
          {name: 'Trials — Extreme', count: 1},
          {name: 'Raids — Ultimate', count: 1},
          {name: 'Alliance Raids', count: 1},
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
            roulettes: ['LevelingRoulette'],
            sortKey: 1,
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
});
