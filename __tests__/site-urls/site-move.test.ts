import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {URL} from 'url';
import {config} from '../../src/config';
import {currentSiteUrl, sitePathRest} from '../../src/site-urls';
import {app, usersClient} from '../utils';

const fixture = (name: string) =>
  readFileSync(join(__dirname, '../fixtures/images', name));

const as = (token: string) => ({
  get: (url: string) =>
    request(app).get(url).set('authorization', `Token ${token}`),
  post: (url: string) =>
    request(app).post(url).set('authorization', `Token ${token}`),
  put: (url: string) =>
    request(app).put(url).set('authorization', `Token ${token}`),
  delete: (url: string) =>
    request(app).delete(url).set('authorization', `Token ${token}`),
});

async function member() {
  return (await usersClient.registerRandomUser()).user.token as string;
}

const status = async (url: string) =>
  (await request(app).get(new URL(url).pathname)).status;

const NEW_SITE = 'https://everise.example';

describe('moving the site to a new address', () => {
  const before = {
    baseUrl: config.baseUrl,
    legacyBaseUrls: config.legacyBaseUrls,
  };
  // What the site saved so far was under its old address; now BASE_URL is
  // the new one and the old one is listed in LEGACY_BASE_URLS.
  const moveSite = () => {
    config.baseUrl = NEW_SITE;
    config.legacyBaseUrls = [before.baseUrl];
  };

  afterEach(() => {
    config.baseUrl = before.baseUrl;
    config.legacyBaseUrls = before.legacyBaseUrls;
  });

  test('reads old addresses as new ones, and leaves other addresses alone', () => {
    moveSite();
    const old = `${before.baseUrl}/api/media/abc`;

    expect(currentSiteUrl(old)).toBe(`${NEW_SITE}/api/media/abc`);
    expect(currentSiteUrl('https://media.giphy.com/x.gif')).toBe(
      'https://media.giphy.com/x.gif',
    );
    expect(currentSiteUrl(undefined)).toBeUndefined();
    expect(sitePathRest(old, '/api/media/')).toBe('abc');
    expect(sitePathRest(`${NEW_SITE}/api/media/def`, '/api/media/')).toBe(
      'def',
    );
    expect(
      sitePathRest('https://elsewhere.example/api/media/x', '/api/media/'),
    ).toBeUndefined();
  });

  test("a profile picture saved before shows at the new address, and is deleted when it's replaced", async () => {
    const token = await member();
    const first = (
      await as(token).put('/api/user/image').send(fixture('small.png'))
    ).body.user.image as string;
    moveSite();

    const current = await as(token).get('/api/user');
    expect(current.body.user.image).toBe(
      first.replace(before.baseUrl, NEW_SITE),
    );

    await as(token).put('/api/user/image').send(fixture('vp8.webp'));
    expect(await status(first)).toBe(404);
  });

  test('uploads in a post and a comment saved before show at the new address, and are deleted with the post', async () => {
    const token = await member();
    const upload = async () =>
      (await as(token).post('/api/media').send(fixture('pixel.gif'))).body
        .media as {id: string; url: string};
    const posted = await upload();
    const commented = await upload();
    const {article} = (
      await as(token)
        .post('/api/articles')
        .send({
          article: {
            title: 'Before the move',
            description: 'd',
            body: 'Look',
            tagList: [],
            media: [{kind: 'gif', url: posted.url}],
          },
        })
    ).body;
    await as(token)
      .post(`/api/articles/${article.id}/comments`)
      .send({comment: {body: '', media: [{kind: 'gif', url: commented.url}]}});
    moveSite();

    const read = await as(token).get(`/api/articles/${article.id}`);
    expect(read.body.article.media[0].url).toBe(
      `${NEW_SITE}/api/media/${posted.id}`,
    );
    const comments = await as(token).get(
      `/api/articles/${article.id}/comments`,
    );
    expect(comments.body.comments[0].media.url).toBe(
      `${NEW_SITE}/api/media/${commented.id}`,
    );

    await as(token).delete(`/api/articles/${article.id}`);
    expect(await status(posted.url)).toBe(404);
    expect(await status(commented.url)).toBe(404);
  });
});
