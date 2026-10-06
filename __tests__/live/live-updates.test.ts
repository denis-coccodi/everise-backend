import {ArticleEvent} from '../../src/live/live-feed';
import 'jest-extended';
import request from 'supertest';
import {isAllowedOrigin, isLiveRequest} from '../../src/live/live-requests';
import {app, clearDb, live, usersClient, xivApi} from '../utils';

const wsRequest = (url: string, headers: Record<string, string>) => ({
  url,
  method: 'GET',
  headers: {
    get: (name: string) =>
      Object.entries(headers).find(
        ([key]) => key.toLowerCase() === name.toLowerCase()
      )?.[1] ?? null,
  },
});

describe('live updates', () => {
  beforeEach(async () => {
    await clearDb();
    xivApi.reset();
    live.events = [];
    live.failing = false;
  });

  describe('publishing', () => {
    test('a new article should be pushed as the public sees it', async () => {
      const {user} = await usersClient.registerRandomUser();

      const response = await request(app)
        .post('/api/articles')
        .set('authorization', `Token ${user.token}`)
        .send({
          article: {
            title: 'Live news',
            description: 'Hot off the press',
            body: 'Body',
            tagList: ['news'],
          },
        });

      expect(response.status).toBe(201);
      // The post itself, as anyone who isn't signed in would get it.
      expect(live.events).toStrictEqual([
        {type: 'article-created', article: response.body.article},
      ]);
      expect((live.events[0] as ArticleEvent).article).toMatchObject({
        title: 'Live news',
        tagList: ['news'],
        favorited: false,
        author: {username: user.username, following: false},
      });
    });

    test('a roulette result Tataru posts for a guest should be pushed', async () => {
      await request(app)
        .post('/api/duties/refresh')
        .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!)
        .send();

      const response = await request(app)
        .post('/api/roulette-results')
        .set('cf-connecting-ip', '203.0.113.200')
        .send({
          result: {
            type: 'Dungeons',
            candidate: {kind: 'duty', id: 1},
            mode: 'Regular',
          },
        });

      expect(response.status).toBe(201);
      expect(live.events).toStrictEqual([
        {type: 'article-created', article: response.body.article},
      ]);
      expect((live.events[0] as ArticleEvent).article).toMatchObject({
        author: {username: 'Tataru'},
        roulette: {name: 'Sastasha', guest: true},
      });
    });

    test('an article should still be saved when the live updates are down', async () => {
      const {user} = await usersClient.registerRandomUser();
      live.failing = true;

      const response = await request(app)
        .post('/api/articles')
        .set('authorization', `Token ${user.token}`)
        .send({article: {title: 'Quiet news', description: 'd', body: 'b'}});

      expect(response.status).toBe(201);
      const saved = await request(app).get(
        `/api/articles/${response.body.article.id}`
      );
      expect(saved.status).toBe(200);
    });
  });

  describe('connecting', () => {
    test('only WebSocket upgrades to /api/live go to the hub', () => {
      expect(
        isLiveRequest(
          wsRequest('https://x.dev/api/live', {Upgrade: 'websocket'})
        )
      ).toBe(true);
      expect(isLiveRequest(wsRequest('https://x.dev/api/live', {}))).toBe(
        false
      );
      expect(
        isLiveRequest(
          wsRequest('https://x.dev/api/articles', {Upgrade: 'websocket'})
        )
      ).toBe(false);
    });

    test("only the site's own pages may connect", () => {
      const allowed = {
        baseUrl: 'https://staging.everisefc.workers.dev',
        corsOrigins: ['http://localhost:4200'],
      };
      const from = (origin: string) =>
        isAllowedOrigin(
          wsRequest('https://x.dev/api/live', {Origin: origin}),
          allowed
        );

      expect(from('https://staging.everisefc.workers.dev')).toBe(true);
      expect(from('http://localhost:4200')).toBe(true);
      expect(from('https://evil.example')).toBe(false);
      // Not a browser: no cross-site risk.
      expect(
        isAllowedOrigin(wsRequest('https://x.dev/api/live', {}), allowed)
      ).toBe(true);
    });
  });
});
