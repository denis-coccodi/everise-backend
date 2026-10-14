import request from 'supertest';
import {app, universalis, usersClient} from '../utils';

const ODIN = 66;
const PHOENIX = 56;
const REVIEWED = 1791940000;

const listing = (
  world: number,
  pricePerUnit: number,
  {quantity = 1, hq = false} = {},
) => ({
  worldID: world,
  pricePerUnit,
  quantity,
  hq,
  lastReviewTime: REVIEWED,
  retainerName: 'Somebody',
});

let member: {token: string};

beforeAll(async () => {
  ({user: member} = await usersClient.registerRandomUser());
});

beforeEach(() => {
  universalis.status = 200;
  universalis.requests = [];
});

const listings = (query: string) =>
  request(app)
    .get(`/api/market/listings?${query}`)
    .set('authorization', `Token ${member.token}`);

describe('the market page: listings now', () => {
  test('are the cheapest on any world of the region, at most 5, the cheapest first', async () => {
    universalis.listings['Europe:5111'] = [
      listing(ODIN, 10, {quantity: 99}),
      listing(PHOENIX, 9),
      listing(ODIN, 12),
      listing(ODIN, 13),
      listing(PHOENIX, 14),
      listing(ODIN, 15),
    ];

    const res = await listings('item=5111&region=europe');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      region: {id: 'europe', name: 'Europe'},
      item: 5111,
      quality: 'all',
      updatedAt: new Date(1791950000000).toISOString(),
    });
    expect(res.body.listings).toEqual([
      {
        world: PHOENIX,
        price: 9,
        quantity: 1,
        hq: false,
        reviewedAt: new Date(REVIEWED * 1000).toISOString(),
      },
      expect.objectContaining({world: ODIN, price: 10, quantity: 99}),
      expect.objectContaining({price: 12}),
      expect.objectContaining({price: 13}),
      expect.objectContaining({price: 14}),
    ]);
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    expect(universalis.requests).toEqual([
      'https://universalis.app/api/v2/Europe/5111?listings=5&entries=0',
    ]);
  });

  test('are of one quality when asked', async () => {
    universalis.listings['Europe:5057'] = [
      listing(ODIN, 100),
      listing(PHOENIX, 400, {hq: true}),
    ];

    const res = await listings('item=5057&quality=hq');

    expect(res.body.listings).toEqual([
      expect.objectContaining({world: PHOENIX, price: 400, hq: true}),
    ]);
    expect(universalis.requests[0]).toContain('&hq=true');
  });

  test('are none for an item nobody sells there', async () => {
    const res = await listings('item=19953&region=oceania');
    expect(res.body).toMatchObject({listings: [], region: {id: 'oceania'}});
  });

  test('are for signed-in members', async () => {
    const res = await request(app).get('/api/market/listings?item=5111');
    expect(res.status).toBe(401);
    expect(universalis.requests).toEqual([]);
  });

  test("say when Universalis can't be reached", async () => {
    universalis.status = 503;
    const res = await listings('item=5111');
    expect(res.status).toBe(502);
    expect(res.body.errors.body).toEqual([
      "The market board's listings can't be read right now. Try again in a minute.",
    ]);
  });
});
