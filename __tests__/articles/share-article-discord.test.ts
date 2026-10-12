import 'jest-extended';
import request from 'supertest';
import {app, articlesClient, clock, discord, usersClient} from '../utils';

// ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
const ADMIN = {
  email: 'admin@example.com',
  username: 'Minfilia',
  password: 'echo-of-light',
};

async function adminToken() {
  const signedIn = await request(app)
    .post('/api/users/login')
    .send({user: {email: ADMIN.email, password: ADMIN.password}});
  if (signedIn.status === 200) return signedIn.body.user.token as string;
  const {user} = await usersClient.registerUser(
    ADMIN.email,
    ADMIN.username,
    ADMIN.password,
  );
  return user.token as string;
}

const share = (id: string, token?: string) => {
  const req = request(app).post(`/api/articles/${id}/discord`);
  return token ? req.set('authorization', `Token ${token}`) : req;
};

describe('POST /api/articles/:id/discord', () => {
  beforeEach(() => {
    discord.sent = [];
    discord.webhookStatus = 204;
    // A minute apart each test, so the share limit never carries over.
    clock.now = new Date(Date.now() + Math.random() * 1e9);
  });

  afterAll(() => {
    clock.now = undefined;
  });

  test('its author shares their own post, as it would have gone on creation', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);

    const response = await share(article.id, user.token);

    expect(response.status).toBe(202);
    expect(response.body).toStrictEqual({shared: true});
    expect(discord.sent).toHaveLength(1);
    expect(discord.sent[0].body).toMatchObject({
      embeds: [{title: article.title, author: {name: user.username}}],
    });
  });

  test("an admin shares anyone's post; another member can't", async () => {
    const {user: author} = await usersClient.registerRandomUser();
    const {user: other} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(author.token);

    const refused = await share(article.id, other.token);
    expect(refused.status).toBe(403);
    expect(refused.body.errors.body).toEqual([
      'Only its author or an admin can share a post in the Everise Discord.',
    ]);
    expect(discord.sent).toEqual([]);

    const byAdmin = await share(article.id, await adminToken());
    expect(byAdmin.status).toBe(202);
    expect(discord.sent[0].body).toMatchObject({
      embeds: [{author: {name: author.username}}],
    });
  });

  test('once a minute per member, with Retry-After', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);

    expect((await share(article.id, user.token)).status).toBe(202);
    const again = await share(article.id, user.token);

    expect(again.status).toBe(429);
    expect(again.headers['retry-after']).toBe('60');
    expect(again.body.errors.body).toEqual([
      'You can share another post in 60 seconds.',
    ]);
    clock.now = new Date(clock.now!.getTime() + 60_000);
    expect((await share(article.id, user.token)).status).toBe(202);
  });

  test("says so when Discord doesn't take it", async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);
    discord.webhookStatus = 500;

    const response = await share(article.id, user.token);

    expect(response.status).toBe(502);
    expect(response.body.errors.body).toEqual([
      "Discord didn't take the message. Try again in a minute.",
    ]);
  });

  test('needs sign-in, and a post that exists', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);

    expect((await share(article.id)).status).toBe(401);
    expect((await share('no-such-post', user.token)).status).toBe(404);
  });
});
