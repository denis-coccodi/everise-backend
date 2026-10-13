import 'jest-extended';
import request from 'supertest';
import {app, clock, xivpf, xivpfEntry} from '../utils';

// Each test starts an hour after the last, so the board reads xivpf again.
let start = Date.parse('2026-10-08T18:00:00Z');
beforeEach(() => {
  start += 3_600_000;
  clock.now = new Date(start);
  xivpf.status = 200;
  xivpf.body = undefined;
  xivpf.reads = 0;
});

afterAll(() => {
  clock.now = undefined;
});

const listing = (id: string) =>
  request(app).get(`/api/party-finder/listings/${id}`);

describe('GET /api/party-finder/listings/:id', () => {
  test('finds a listing anyone has the link to, on any data centre, by an id that names it', async () => {
    xivpf.listings = [
      xivpfEntry(),
      xivpfEntry({id: 2, world: {id: 71, name: 'Moogle'}}),
    ];
    const board = await request(app).get('/api/party-finder?dataCentre=Chaos');
    const [shown] = board.body.listings;
    expect(shown.id).toBe('chaos-1789630212-2');

    const response = await listing(shown.id);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=15');
    expect(response.body).toEqual({
      dataCentre: 'Chaos',
      fetchedAt: board.body.fetchedAt,
      icons: board.body.icons,
      listing: shown,
    });
  });

  test('says when the listing is no longer up, and why that happens', async () => {
    xivpf.listings = [xivpfEntry()];

    const response = await listing('light-1789630212-9');

    expect(response.status).toBe(404);
    expect(response.body.errors.body).toEqual([
      'This listing is no longer up on Light: the party filled up, its time ran out or the recruiter took it down.',
    ]);
  });

  test("says when an address isn't a listing's at all", async () => {
    xivpf.listings = [xivpfEntry()];

    for (const id of ['1789630212-1', 'atlantis-1789630212-1', 'light-x-1']) {
      const response = await listing(id);
      expect(response.status).toBe(404);
      expect(response.body.errors.body).toEqual([
        "There's no Party Finder listing at that address. Check the link, or find one on the Party Finder.",
      ]);
    }
    expect(xivpf.reads).toBe(0);
  });

  test("502 while xivpf can't be reached", async () => {
    xivpf.status = 503;

    const response = await listing('light-1789630212-1');

    expect(response.status).toBe(502);
  });
});
