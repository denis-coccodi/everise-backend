import request from 'supertest';
import {clock, marketOptions, universalis} from '../utils';

import {app} from '../utils';

const NOW = Date.parse('2026-10-14T12:00:00Z') / 1000;
const DAY = 86400;
// Midnight (UTC) `days` days ago, plus `hours`.
const at = (days: number, hours = 0) =>
  (Math.floor(NOW / DAY) - days) * DAY + hours * 3600;

const sale = (
  timestamp: number,
  pricePerUnit: number,
  quantity = 1,
  hq = false,
) => ({
  timestamp,
  pricePerUnit,
  quantity,
  hq,
});

const history = (query: string) =>
  request(app).get(`/api/market/history?${query}`);

beforeEach(() => {
  clock.now = new Date(NOW * 1000);
  universalis.status = 200;
  universalis.requests = [];
  marketOptions.stepsPerRequest = Infinity;
});

afterAll(() => {
  clock.now = undefined;
});

describe('the market page: price history', () => {
  test("is each day's middle, lowest and highest price, with the sales and units, the oldest day first", async () => {
    universalis.sales['Odin:5111'] = [
      sale(at(2, 1), 100, 5),
      sale(at(2, 2), 300, 1),
      sale(at(2, 3), 200, 2, true),
      sale(at(0, 9), 50, 10),
      sale(at(0, 10), 70, 1, true),
    ];

    const res = await history('scope=odin&items=5111');

    expect(res.status).toBe(200);
    expect(res.body.scope).toEqual({id: 'odin', name: 'Odin', kind: 'world'});
    expect(res.body.quality).toBe('all');
    expect(res.body.items).toEqual([
      {
        id: 5111,
        complete: true,
        refreshedAt: '2026-10-14T12:00:00.000Z',
        days: [
          {
            day: '2026-10-12',
            median: 200,
            min: 100,
            max: 300,
            sales: 3,
            quantity: 8,
          },
          {
            day: '2026-10-14',
            median: 60,
            min: 50,
            max: 70,
            sales: 2,
            quantity: 11,
          },
        ],
      },
    ]);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(universalis.requests[0]).toContain('/history/Odin/5111?');

    const hq = await history('scope=odin&items=5111&quality=hq');
    expect(hq.body.items[0].days).toEqual([
      {
        day: '2026-10-12',
        median: 200,
        min: 200,
        max: 200,
        sales: 1,
        quantity: 2,
      },
      {day: '2026-10-14', median: 70, min: 70, max: 70, sales: 1, quantity: 1},
    ]);
    const nq = await history('scope=odin&items=5111&quality=nq');
    expect(
      nq.body.items[0].days.map((d: {median: number}) => d.median),
    ).toEqual([200, 50]);
  });

  test('reads a long history a few sales at a time, keeping whole days', async () => {
    // Three sales a day for ten days, read 4 at a time: each day's figures
    // still count all three.
    universalis.sales['Light:5057'] = Array.from({length: 10}, (_, day) => [
      sale(at(day, 1), 10 + day),
      sale(at(day, 2), 20 + day),
      sale(at(day, 3), 90 + day),
    ]).flat();

    const res = await history('scope=light&items=5057');

    const days = res.body.items[0].days;
    expect(days).toHaveLength(10);
    expect(days[0]).toMatchObject({day: '2026-10-05', median: 29, sales: 3});
    expect(days[9]).toMatchObject({day: '2026-10-14', median: 20, sales: 3});
    expect(res.body.items[0].complete).toBe(true);
    expect(universalis.requests.length).toBeGreaterThan(5);
  });

  test('reads at most 180 days at a time, back to October 2022', async () => {
    universalis.sales['Moogle:5111'] = [
      sale(at(0, 1), 100),
      sale(at(400, 1), 50),
      sale(Date.UTC(2022, 9, 30) / 1000, 10),
      // Older than the history Universalis keeps: never asked for.
      sale(Date.UTC(2022, 8, 1) / 1000, 1),
    ];

    const res = await history('scope=moogle&items=5111');

    expect(res.body.items[0].days.map((d: {day: string}) => d.day)).toEqual([
      '2022-10-30',
      '2025-09-09',
      '2026-10-14',
    ]);
    const windows = universalis.requests.map(url =>
      Number(new URL(url).searchParams.get('entriesWithin')),
    );
    expect(Math.max(...windows)).toBeLessThanOrEqual(181 * DAY);
    expect(
      Math.min(
        ...universalis.requests.map(
          url =>
            Number(new URL(url).searchParams.get('entriesUntil')) -
            Number(new URL(url).searchParams.get('entriesWithin')),
        ),
      ),
    ).toBe(Date.UTC(2022, 9, 1) / 1000);
  });

  test('keeps a day with more sales than one read holds as it was read', async () => {
    universalis.sales['Chaos:5111'] = [
      sale(at(1, 1), 1),
      ...[5, 6, 7, 8, 9].map((price, i) => sale(at(0, i + 1), price)),
    ];

    const res = await history('scope=chaos&items=5111');

    expect(res.body.items[0].days).toEqual([
      {day: '2026-10-13', median: 1, min: 1, max: 1, sales: 1, quantity: 1},
      // The newest 4 of the day's 5 sales.
      {day: '2026-10-14', median: 8, min: 6, max: 9, sales: 4, quantity: 4},
    ]);
  });

  test('answers the newest days first and the older ones as they come in', async () => {
    marketOptions.stepsPerRequest = 1;
    universalis.sales['Phoenix:5111'] = Array.from({length: 6}, (_, day) => [
      sale(at(day, 1), 100),
      sale(at(day, 2), 100),
    ]).flat();

    const first = await history('scope=phoenix&items=5111');
    expect(first.body.items[0].complete).toBe(false);
    expect(first.body.items[0].days.map((d: {day: string}) => d.day)).toEqual([
      '2026-10-14',
    ]);
    expect(first.headers['cache-control']).toBe('no-store');

    let res = first;
    for (let i = 0; i < 30 && !res.body.items[0].complete; i++) {
      res = await history('scope=phoenix&items=5111');
    }
    expect(res.body.items[0].complete).toBe(true);
    expect(res.body.items[0].days[0].day).toBe('2026-10-09');
    expect(res.body.items[0].days).toHaveLength(6);
  });

  test('reads the newest days again once they are 15 minutes old', async () => {
    universalis.sales['Zodiark:5111'] = [sale(at(0, 1), 100)];
    await history('scope=zodiark&items=5111');
    const reads = universalis.requests.length;

    universalis.sales['Zodiark:5111'].push(sale(at(0, 11), 300));
    clock.now = new Date((NOW + 14 * 60) * 1000);
    const early = await history('scope=zodiark&items=5111');
    expect(universalis.requests).toHaveLength(reads);
    expect(early.body.items[0].days[0].sales).toBe(1);

    clock.now = new Date((NOW + 15 * 60) * 1000);
    const later = await history('scope=zodiark&items=5111');
    expect(later.body.items[0].days).toEqual([
      {
        day: '2026-10-14',
        median: 200,
        min: 100,
        max: 300,
        sales: 2,
        quantity: 2,
      },
    ]);
    expect(later.body.items[0].refreshedAt).toBe('2026-10-14T12:15:00.000Z');
  });

  test('compares up to 3 items, each once', async () => {
    universalis.sales['Shiva:5111'] = [sale(at(0, 1), 100)];
    universalis.sales['Shiva:5057'] = [sale(at(0, 1), 900)];

    const res = await history('scope=shiva&items=5111,5057,5111');

    expect(res.body.items.map((item: {id: number}) => item.id)).toEqual([
      5111, 5057,
    ]);
    expect(res.body.items[1].days[0].median).toBe(900);
  });

  test('has no days for an item never sold there', async () => {
    const res = await history('scope=lich&items=19953');
    expect(res.body.items).toEqual([
      expect.objectContaining({id: 19953, days: [], complete: true}),
    ]);
  });

  test('starts on Odin, and says what it needs', async () => {
    universalis.sales['Odin:19953'] = [sale(at(0, 1), 5)];
    expect((await history('items=19953')).body.scope.id).toBe('odin');

    const tooMany = await history('items=1,2,3,4');
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.errors.body).toEqual([
      'Pick 1 to 3 items: their ids, separated by commas.',
    ]);
    const place = await history('items=1&scope=Odin');
    expect(place.body.errors.body).toEqual([
      "Pick one of the game's data centres or worlds, in lower case.",
    ]);
    const quality = await history('items=1&quality=best');
    expect(quality.body.errors.body).toEqual(['Pick all, nq or hq.']);
  });

  test("says when Universalis can't be reached", async () => {
    universalis.status = 503;
    const res = await history('scope=raiden&items=5111');
    expect(res.status).toBe(502);
    expect(res.body.errors.body).toEqual([
      "The market board's history can't be read right now. Try again in a minute.",
    ]);
  });

  test('lists the data centres and their worlds by region, Odin first picked', async () => {
    const res = await request(app).get('/api/market/scopes');

    expect(res.status).toBe(200);
    expect(res.body.defaultScope).toBe('odin');
    const [europe] = res.body.regions;
    expect(europe.name).toBe('Europe');
    expect(europe.dataCentres[0]).toMatchObject({id: 'light', name: 'Light'});
    expect(europe.dataCentres[0].worlds).toContainEqual({
      id: 'odin',
      name: 'Odin',
    });
  });
});
