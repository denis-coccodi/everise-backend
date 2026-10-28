import 'jest-extended';
import request from 'supertest';
import {
  app,
  articlesClient,
  clock,
  ffxivVenue,
  ffxivVenues,
  partake,
  partakeEvent,
  usersClient,
} from '../utils';

describe('GET /api/sitemap', () => {
  test('lists the posts, the latest change first, and every data centre', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article: first} = await articlesClient.createRandomArticle(
      user.token,
    );
    const {article: second} = await articlesClient.createRandomArticle(
      user.token,
    );

    const response = await request(app).get('/api/sitemap');

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, max-age=3600');
    const {articles} = response.body as {
      articles: {id: string; updatedAt: string}[];
    };
    expect(articles).toIncludeAllMembers([
      {id: first.id, updatedAt: first.updatedAt},
      {id: second.id, updatedAt: second.updatedAt},
    ]);
    const dates = articles.map(a => Date.parse(a.updatedAt));
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    expect(response.body.dataCentres).toIncludeAllMembers(['Light', 'Chaos']);
  });

  test("lists this week's venues, every data centre's, and events", async () => {
    clock.now = new Date('2026-10-29T18:00:00Z');
    ffxivVenues.status = 200;
    ffxivVenues.requests = [];
    ffxivVenues.venues = {
      Light: [ffxivVenue()],
      Aether: [ffxivVenue({id: 'aetherVenue1'})],
    };
    partake.status = 200;
    partake.events = [partakeEvent()];

    const response = await request(app).get('/api/sitemap');

    expect(response.status).toBe(200);
    expect(response.body.venues).toStrictEqual([
      '03SsBX8Q1dkl',
      'aetherVenue1',
    ]);
    expect(response.body.events).toStrictEqual([56133]);
    // A data centre at a time, each once.
    expect(
      ffxivVenues.requests.map(url =>
        new URL(url).searchParams.get('dataCenter'),
      ),
    ).toStrictEqual([
      'Light',
      'Chaos',
      'Aether',
      'Crystal',
      'Dynamis',
      'Primal',
      'Materia',
    ]);
    clock.now = undefined;
  });
});
