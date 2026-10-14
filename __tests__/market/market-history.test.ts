import request from 'supertest';
import {app, clock, marketOptions, universalis, usersClient} from '../utils';

const NOW = Date.parse('2026-10-14T12:00:00Z') / 1000;
const DAY = 86400;
// Midnight (UTC) `days` days ago, plus `hours`.
const at = (days: number, hours = 0) =>
  (Math.floor(NOW / DAY) - days) * DAY + hours * 3600;
const date = (days: number) =>
  new Date(at(days) * 1000).toISOString().slice(0, 10);

const ODIN = 66;
const PHOENIX = 56;
const MOOGLE = 71;
const BISMARCK = 22;
const NAMES: Record<number, string> = {
  [ODIN]: 'Odin',
  [PHOENIX]: 'Phoenix',
  [MOOGLE]: 'Moogle',
  [BISMARCK]: 'Bismarck',
};

interface Sold {
  world: number;
  timestamp: number;
  pricePerUnit: number;
  quantity: number;
  hq: boolean;
}

const sale = (
  timestamp: number,
  pricePerUnit: number,
  {world = ODIN, quantity = 1, hq = false} = {},
): Sold => ({world, timestamp, pricePerUnit, quantity, hq});

// Each test's own item, so no test sees another's kept days.
let item = 1000;

// Universalis answers a world at a time: each sale goes to its world.
function sell(sales: Sold[]) {
  for (const {world, ...entry} of sales) {
    (universalis.sales[`${NAMES[world]}:${item}`] ??= []).push(entry);
  }
}

let member: {token: string};

beforeAll(async () => {
  ({user: member} = await usersClient.registerRandomUser());
});

const history = (query: string) =>
  request(app)
    .get(`/api/market/history?${query}`)
    .set('authorization', `Token ${member.token}`);

beforeEach(() => {
  item++;
  clock.now = new Date(NOW * 1000);
  universalis.status = 200;
  universalis.requests = [];
  marketOptions.stepsPerRequest = Infinity;
});

afterAll(() => {
  clock.now = undefined;
});

// The windows the app asked for, each once.
const windows = () => [
  ...new Map(
    universalis.requests.map(url => {
      const params = new URL(url).searchParams;
      const until = Number(params.get('entriesUntil'));
      const window = {
        until,
        since: until - Number(params.get('entriesWithin')),
      };
      return [JSON.stringify(window), window] as const;
    }),
  ).values(),
];
// The windows (s) the app read Odin in, in order.
const odinWindows = () =>
  universalis.requests
    .filter(url => url.includes('/history/Odin/'))
    .map(url => Number(new URL(url).searchParams.get('entriesWithin')));
const worldsAsked = () =>
  new Set(
    universalis.requests.map(url => /\/history\/([^/]+)\//.exec(url)?.[1]),
  );

describe('the market page: price history', () => {
  test("is each world's middle, lowest and highest price a day, with the sales and units", async () => {
    sell([
      sale(at(2, 1), 100, {quantity: 5}),
      sale(at(2, 2), 300),
      sale(at(2, 3), 200, {quantity: 2, hq: true}),
      sale(at(2, 4), 900, {world: MOOGLE}),
      sale(at(0, 9), 50, {quantity: 10}),
    ]);

    const res = await history(`item=${item}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      region: {id: 'europe', name: 'Europe'},
      item,
      quality: 'all',
      from: date(30),
      complete: true,
      refreshedAt: '2026-10-14T12:00:00.000Z',
    });
    expect(res.body.worlds).toEqual([
      {
        id: ODIN,
        days: [
          {
            day: date(2),
            median: 200,
            min: 100,
            max: 300,
            sales: 3,
            quantity: 8,
          },
          {day: date(0), median: 50, min: 50, max: 50, sales: 1, quantity: 10},
        ],
      },
      {
        id: MOOGLE,
        days: [
          {
            day: date(2),
            median: 900,
            min: 900,
            max: 900,
            sales: 1,
            quantity: 1,
          },
        ],
      },
    ]);
    expect(res.headers['cache-control']).toBe('private, max-age=300');
    // Every world of the region, one by one.
    expect(worldsAsked().size).toBe(16);
    expect(worldsAsked()).toContain('Odin');

    const hq = await history(`item=${item}&quality=hq`);
    expect(hq.body.worlds).toEqual([
      {
        id: ODIN,
        days: [
          {
            day: date(2),
            median: 200,
            min: 200,
            max: 200,
            sales: 1,
            quantity: 2,
          },
        ],
      },
    ]);
    const nq = await history(`item=${item}&quality=nq`);
    expect(
      nq.body.worlds[0].days.map((d: {median: number}) => d.median),
    ).toEqual([200, 50]);
  });

  test('reads only the last 30 days at first, and older days when asked for them', async () => {
    sell([sale(at(1, 1), 100), sale(at(60, 1), 50, {world: PHOENIX})]);

    const first = await history(`item=${item}`);
    expect(first.body.worlds.map((w: {id: number}) => w.id)).toEqual([ODIN]);
    expect(Math.min(...windows().map(w => w.since))).toBe(at(30));

    universalis.requests = [];
    const older = await history(`item=${item}&from=${date(90)}`);
    expect(older.body.from).toBe(date(90));
    expect(older.body.worlds.map((w: {id: number}) => w.id)).toEqual([
      PHOENIX,
      ODIN,
    ]);
    // Only the days before those already read.
    expect(windows()).toEqual([{until: at(30) - 1, since: at(90)}]);

    universalis.requests = [];
    await history(`item=${item}&from=${date(20)}`);
    expect(universalis.requests).toEqual([]);
  });

  test('reads a long history a few sales at a time, keeping whole days', async () => {
    // Three sales a day for ten days, on two worlds, read 4 at a time.
    sell(
      Array.from({length: 10}, (_, d) => [
        sale(at(d, 1), 10 + d),
        sale(at(d, 2), 20 + d, {world: PHOENIX}),
        sale(at(d, 3), 90 + d),
      ]).flat(),
    );

    const res = await history(`item=${item}`);

    const odin = res.body.worlds.find((w: {id: number}) => w.id === ODIN);
    expect(odin.days).toHaveLength(10);
    expect(odin.days[0]).toMatchObject({day: date(9), median: 59, sales: 2});
    expect(odin.days[9]).toMatchObject({day: date(0), median: 50, sales: 2});
    expect(res.body.complete).toBe(true);
  });

  test('reads back to October 2022 in widening windows', async () => {
    sell([
      sale(at(0, 1), 100),
      sale(at(400, 1), 50),
      sale(Date.UTC(2022, 9, 30) / 1000, 10),
      // Older than the history Universalis keeps: never asked for.
      sale(Date.UTC(2022, 8, 1) / 1000, 1),
    ]);

    const res = await history(`item=${item}&from=2020-01-01`);

    expect(res.body.from).toBe('2022-10-01');
    expect(res.body.worlds[0].days.map((d: {day: string}) => d.day)).toEqual([
      '2022-10-30',
      date(400),
      date(0),
    ]);
    expect(Math.min(...windows().map(w => w.since))).toBe(
      Date.UTC(2022, 9, 1) / 1000,
    );
    // A quiet world's windows widen (90 days, 180, 360...): its four years
    // in a handful of reads.
    const odin = odinWindows();
    expect(odin.length).toBeLessThanOrEqual(6);
    expect(odin[0]).toBeLessThanOrEqual(91 * DAY);
    expect(odin[1]).toBeGreaterThan(odin[0]);
  });

  test("narrows a busy world's windows, so each answer stays small", async () => {
    // Odin sells 3 a day: a 90-day window holds more than a read (4 here).
    sell(
      Array.from({length: 60}, (_, d) => [
        sale(at(d, 1), 10),
        sale(at(d, 2), 10),
        sale(at(d, 3), 10),
      ]).flat(),
    );

    await history(`item=${item}&from=${date(59)}`);

    const odin = odinWindows();
    expect(odin.at(-1)).toBeLessThan(odin[0]);
  });

  test('keeps a day with more sales than one read holds as it was read', async () => {
    sell([
      sale(at(1, 1), 1),
      ...[5, 6, 7, 8, 9].map((price, i) => sale(at(0, i + 1), price)),
    ]);

    const res = await history(`item=${item}`);

    expect(res.body.worlds[0].days).toEqual([
      {day: date(1), median: 1, min: 1, max: 1, sales: 1, quantity: 1},
      // The newest 4 of the day's 5 sales.
      {day: date(0), median: 8, min: 6, max: 9, sales: 4, quantity: 4},
    ]);
  });

  test('answers the newest days first and the older ones as they come in', async () => {
    marketOptions.stepsPerRequest = 1;
    sell(
      Array.from({length: 6}, (_, d) => [
        sale(at(d, 1), 100),
        sale(at(d, 2), 100),
      ]).flat(),
    );

    const first = await history(`item=${item}`);
    expect(first.body.complete).toBe(false);
    // The newest 4 sales: the oldest of their days, not all read, waits.
    expect(first.body.worlds[0].days.map((d: {day: string}) => d.day)).toEqual([
      date(0),
    ]);
    expect(first.headers['cache-control']).toBe('no-store');
    // How far back every world has been read so far: today only.
    expect(first.body.readBackTo).toBe(date(0));

    let res = first;
    for (let i = 0; i < 20 && !res.body.complete; i++) {
      res = await history(`item=${item}`);
    }
    expect(res.body.complete).toBe(true);
    expect(res.body.readBackTo).toBeNull();
    expect(res.body.worlds[0].days).toHaveLength(6);
  });

  test('reads the newest days again once they are 15 minutes old', async () => {
    sell([sale(at(0, 1), 100)]);
    await history(`item=${item}`);
    const reads = universalis.requests.length;

    sell([sale(at(0, 11), 300)]);
    clock.now = new Date((NOW + 14 * 60) * 1000);
    const early = await history(`item=${item}`);
    expect(universalis.requests).toHaveLength(reads);
    expect(early.body.worlds[0].days[0].sales).toBe(1);

    universalis.requests = [];
    clock.now = new Date((NOW + 15 * 60) * 1000);
    const later = await history(`item=${item}`);
    expect(later.body.worlds[0].days).toEqual([
      {day: date(0), median: 200, min: 100, max: 300, sales: 2, quantity: 2},
    ]);
    expect(later.body.refreshedAt).toBe('2026-10-14T12:15:00.000Z');
    expect(windows()).toEqual([{until: NOW + 15 * 60, since: at(0)}]);
  });

  test("reads Oceania's worlds, or any region's, on their own", async () => {
    sell([sale(at(0, 1), 70, {world: BISMARCK})]);

    const res = await history(`item=${item}&region=oceania`);

    expect(res.body.region).toEqual({id: 'oceania', name: 'Oceania'});
    expect(res.body.worlds).toEqual([
      {id: BISMARCK, days: [expect.objectContaining({median: 70})]},
    ]);
    expect([...worldsAsked()].sort()).toEqual([
      'Bismarck',
      'Ravana',
      'Sephirot',
      'Sophia',
      'Zurvan',
    ]);
    universalis.requests = [];
    await history(`item=${item}&region=north-america`);
    expect(worldsAsked()).toContain('Adamantoise');
  });

  test('has no worlds for an item never sold there', async () => {
    const res = await history(`item=${item}`);
    expect(res.body).toMatchObject({worlds: [], complete: true});
  });

  test('is for signed-in members', async () => {
    const res = await request(app).get(`/api/market/history?item=${item}`);
    expect(res.status).toBe(401);
    expect(universalis.requests).toEqual([]);
  });

  test('says what it needs', async () => {
    const noItem = await history('');
    expect(noItem.status).toBe(422);
    expect(noItem.body.errors.body).toEqual(['"item" is required']);
    const region = await history('item=1&region=Europe');
    expect(region.body.errors.body).toEqual([
      "Pick one of the game's regions: europe, north-america, japan, oceania.",
    ]);
    const quality = await history('item=1&quality=best');
    expect(quality.body.errors.body).toEqual(['Pick all, nq or hq.']);
    const from = await history('item=1&from=yesterday');
    expect(from.body.errors.body).toEqual([
      'Write the first day as YYYY-MM-DD.',
    ]);
  });

  test("says when Universalis can't be reached", async () => {
    universalis.status = 503;
    const res = await history(`item=${item}`);
    expect(res.status).toBe(502);
    expect(res.body.errors.body).toEqual([
      "The market board's history can't be read right now. Try again in a minute.",
    ]);
  });

  test('lists the regions, their data centres and worlds, starting on Europe from Odin', async () => {
    const res = await request(app).get('/api/market/regions');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      defaultRegion: 'europe',
      homeWorld: 'Odin',
      historyStart: '2022-10-01',
    });
    expect(res.body.regions.map((r: {id: string}) => r.id)).toEqual([
      'europe',
      'north-america',
      'japan',
      'oceania',
    ]);
    const [light] = res.body.regions[0].dataCentres;
    expect(light.name).toBe('Light');
    expect(light.worlds).toContainEqual({id: ODIN, name: 'Odin'});
  });
});
