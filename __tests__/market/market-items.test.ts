import request from 'supertest';
import {app, usersClient, xivApi} from '../utils';

let member: {token: string};

beforeAll(async () => {
  ({user: member} = await usersClient.registerRandomUser());
});

// A signed-in member's request.
const get = (path: string) =>
  request(app).get(path).set('authorization', `Token ${member.token}`);

afterEach(() => xivApi.reset());

describe('the market page: items', () => {
  test('are searched by name, among those the market board sells', async () => {
    const res = await get('/api/market/items?search=iron');

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        id: 5111,
        name: 'Iron Ore',
        icon: 25111,
        canBeHq: false,
        category: 'Stone',
      },
      {
        id: 5057,
        name: 'Iron Ingot',
        icon: 25057,
        canBeHq: true,
        category: 'Stone',
      },
      {
        id: 19953,
        name: 'Doman Iron Ore',
        icon: 39953,
        canBeHq: false,
        category: 'Stone',
      },
    ]);
    expect(xivApi.requests.at(-1)).toContain(
      encodeURIComponent('+Name~"iron" +ItemSearchCategory>=1'),
    );
  });

  test('leave quotes out of the search', async () => {
    await get('/api/market/items?search=' + encodeURIComponent('ir"on'));
    expect(xivApi.requests.at(-1)).toContain(
      encodeURIComponent('Name~"ir on"'),
    );
  });

  test('ask for at least 2 letters', async () => {
    const res = await get('/api/market/items?search=i');
    expect(res.status).toBe(422);
    expect(res.body.errors.body).toEqual([
      'Type at least 2 letters of the item.',
    ]);
  });

  test('are read by id, a link has', async () => {
    const res = await get('/api/market/items/19953');

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({id: 19953, name: 'Doman Iron Ore'});
  });

  test("say so when the market board doesn't sell the item", async () => {
    const gil = await get('/api/market/items/1');
    expect(gil.status).toBe(404);
    expect(gil.body.errors.body).toEqual([
      "The market board doesn't sell that item.",
    ]);
    const wrong = await get('/api/market/items/1,2');
    expect(wrong.status).toBe(422);
    expect(wrong.body.errors.body).toEqual(["That isn't an item's id."]);
  });

  test('are for signed-in members, but icons are for everyone', async () => {
    expect(
      (await request(app).get('/api/market/items?search=iron')).status,
    ).toBe(401);
    expect((await request(app).get('/api/market/items/5111')).status).toBe(401);
    expect((await request(app).get('/api/market/icons/25111')).status).toBe(
      200,
    );
  });

  test('say when XIVAPI cannot be reached', async () => {
    xivApi.failing = true;
    const res = await get('/api/market/items?search=iron');
    expect(res.status).toBe(502);
    expect(res.body.errors.body).toEqual([
      "The game's items can't be searched right now. Try again in a minute.",
    ]);
  });

  test("have their icons, from XIVAPI's high-resolution ones", async () => {
    const res = await request(app).get('/api/market/icons/25111');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
    expect(Buffer.from(res.body).toString()).toBe(
      'ui/icon/025000/025111_hr1.tex as png',
    );

    xivApi.missingImages.add(25112);
    expect((await request(app).get('/api/market/icons/25112')).status).toBe(
      404,
    );
  });
});
