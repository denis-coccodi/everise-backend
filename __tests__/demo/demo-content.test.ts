import 'jest-extended';
import {Doc} from '../../src/db';
import request from 'supertest';
import {
  app,
  articlesClient,
  clearDb,
  clock,
  db,
  profilesClient,
  usersClient,
} from '../utils';

// ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
async function adminToken() {
  const {user} = await usersClient.registerUser(
    'admin@example.com',
    'Minfilia',
    'echo-of-light',
  );
  return user.token as string;
}

const as = (token: string) => ({
  post: () =>
    request(app)
      .post('/api/admin/demo-content')
      .set('authorization', `Token ${token}`),
  delete: () =>
    request(app)
      .delete('/api/admin/demo-content')
      .set('authorization', `Token ${token}`),
});

const status = async () =>
  (await request(app).get('/api/demo-content')).body.demoContent;

describe('demo content', () => {
  let admin: ReturnType<typeof as>;

  beforeEach(async () => {
    await clearDb();
    clock.now = new Date('2026-10-21T12:00:00Z');
    admin = as(await adminToken());
  });

  afterEach(() => {
    clock.now = undefined;
  });

  test('is not there until an admin adds it', async () => {
    expect(await status()).toStrictEqual({
      active: false,
      members: 0,
      posts: 0,
      comments: 0,
    });
  });

  test('an admin adds made-up members, posts and comments, dated over the past weeks', async () => {
    const added = await admin.post();

    expect(added.status).toBe(201);
    expect(added.body.demoContent).toStrictEqual({
      active: true,
      members: 8,
      posts: 10,
      comments: 16,
    });
    expect(await status()).toStrictEqual(added.body.demoContent);

    const list = await request(app).get('/api/articles?limit=20');
    expect(list.body.articlesCount).toBe(10);
    const [newest] = list.body.articles;
    expect(newest.title).toBe('Island Sanctuary workshop plan for this season');
    expect(newest.author.username).toBe('Mira Okuni');
    expect(newest.createdAt).toBe('2026-10-19T12:00:00.000Z');

    const {profile} = await profilesClient.getProfile(newest.author.id);
    expect(profile.bio).toStartWith('Dancer');
  });

  test('nobody can sign in as a demo member', async () => {
    await admin.post();
    const response = await request(app)
      .post('/api/users/login')
      .send({user: {email: 'mira@demo.everise.invalid', password: 'x'}});
    expect(response.status).toBe(401);
  });

  test('is added once', async () => {
    await admin.post();
    const again = await admin.post();
    expect(again.status).toBe(422);
    expect(again.body.errors.body).toStrictEqual([
      'The demo content is already there. Remove it first to add it again.',
    ]);
  });

  test('is not added when a member has a demo username', async () => {
    await usersClient.registerUser('tibo@example.com', 'Tibo Tibo', 'pw-1234!');
    const response = await admin.post();
    expect(response.status).toBe(422);
    expect(response.body.errors.body).toStrictEqual([
      'Members already use the demo usernames Tibo Tibo.',
    ]);
    expect((await status()).active).toBe(false);
  });

  test('an admin removes it, with what members added to it, and nothing else', async () => {
    await admin.post();
    const member = (await usersClient.registerRandomUser()).user;
    const {article: own} = await articlesClient.createRandomArticle(
      member.token,
    );
    const demoPost = (await request(app).get('/api/articles')).body.articles[1];
    await articlesClient.addRandomComment(member.token, demoPost.id);
    await articlesClient.favoriteArticle(member.token, demoPost.id);
    await profilesClient.followUser(member.token, demoPost.author.id);

    const removed = await admin.delete();

    expect(removed.status).toBe(200);
    expect(removed.body.demoContent.active).toBe(false);
    const list = await request(app).get('/api/articles');
    expect(list.body.articles.map((a: {id: string}) => a.id)).toStrictEqual([
      own.id,
    ]);
    expect(await db.find('comments')).toBeEmpty();
    expect(await db.find('follows')).toBeEmpty();
    expect(await db.find('notifications')).toBeEmpty();
    const users = await db.find<{username: string} & Doc>('users');
    expect(users.map(u => u.username).sort()).toStrictEqual(
      ['Minfilia', member.username].sort(),
    );
  });

  test('removing it when it is not there says so', async () => {
    const response = await admin.delete();
    expect(response.status).toBe(404);
    expect(response.body.errors.body).toStrictEqual([
      'There is no demo content to remove.',
    ]);
  });

  test('only admins add or remove it', async () => {
    const member = as((await usersClient.registerRandomUser()).user.token);
    expect((await member.post()).status).toBe(403);
    expect((await member.delete()).status).toBe(403);
    expect((await request(app).post('/api/admin/demo-content')).status).toBe(
      401,
    );
    expect((await request(app).delete('/api/admin/demo-content')).status).toBe(
      401,
    );
  });
});
