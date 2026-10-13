import request from 'supertest';
import {app, xivApi} from '../utils';

afterEach(() => xivApi.reset());

describe('the market page: items', () => {
  test('are searched by name, among those the market board sells', async () => {
    const res = await request(app).get('/api/market/items?search=iron');

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
    await request(app).get(
      '/api/market/items?search=' + encodeURIComponent('ir"on'),
    );
    expect(xivApi.requests.at(-1)).toContain(
      encodeURIComponent('Name~"ir on"'),
    );
  });

  test('ask for at least 2 letters', async () => {
    const res = await request(app).get('/api/market/items?search=i');
    expect(res.status).toBe(422);
    expect(res.body.errors.body).toEqual([
      'Type at least 2 letters of the item.',
    ]);
  });

  test('are read by id, in the order asked, without those the market board does not sell', async () => {
    const res = await request(app).get('/api/market/items/19953,1,5111');

    expect(res.status).toBe(200);
    expect(res.body.items.map((item: {name: string}) => item.name)).toEqual([
      'Doman Iron Ore',
      'Iron Ore',
    ]);
  });

  test('are at most 3 at a time', async () => {
    const res = await request(app).get('/api/market/items/1,2,3,4');
    expect(res.status).toBe(422);
    expect(res.body.errors.body).toEqual([
      'Pick 1 to 3 items: their ids, separated by commas.',
    ]);
  });

  test('say when XIVAPI cannot be reached', async () => {
    xivApi.failing = true;
    const res = await request(app).get('/api/market/items?search=iron');
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
