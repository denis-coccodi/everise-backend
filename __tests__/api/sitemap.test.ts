import 'jest-extended';
import request from 'supertest';
import {app, articlesClient, usersClient} from '../utils';

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
});
