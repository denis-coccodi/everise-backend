import 'jest-extended';
import {readFileSync} from 'fs';
import {join} from 'path';
import request from 'supertest';
import {URL} from 'url';
import {
  app,
  articlesClient,
  profilesClient,
  staging,
  usersClient,
} from '../utils';

// ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
const ADMIN = {
  email: 'admin@example.com',
  username: 'Minfilia',
  password: 'echo-of-light',
};

async function adminToken() {
  const registered = await request(app).post('/api/users').send({user: ADMIN});
  if (registered.status === 201) return registered.body.user.token as string;
  const {user} = await usersClient.login(ADMIN.email, ADMIN.password);
  return user.token as string;
}

const deleteMember = (token: string, username: string) =>
  request(app)
    .delete(`/api/admin/users/${encodeURIComponent(username)}`)
    .set('authorization', `Token ${token}`);

describe('DELETE /api/admin/users/:username', () => {
  test('deletes the member and everything they leave behind, and nothing else', async () => {
    const admin = await adminToken();
    const gone = (await usersClient.registerRandomUser()).user;
    const other = (await usersClient.registerRandomUser()).user;

    // Their post, with someone else's comment on it.
    const {article: theirs} = await articlesClient.createRandomArticle(
      gone.token
    );
    await articlesClient.addRandomComment(other.token, theirs.slug);
    // Someone else's post, which they commented on and favourited, and which
    // the other member favourited too.
    const {article: kept} = await articlesClient.createRandomArticle(
      other.token
    );
    await articlesClient.addRandomComment(gone.token, kept.slug);
    const {comment: keptComment} = await articlesClient.addRandomComment(
      other.token,
      kept.slug
    );
    await articlesClient.favoriteArticle(gone.token, kept.slug);
    await articlesClient.favoriteArticle(other.token, kept.slug);
    // Follows both ways, and a picture.
    await profilesClient.followUser(gone.token, other.username);
    await profilesClient.followUser(other.token, gone.username);
    const upload = await request(app)
      .put('/api/user/image')
      .set('authorization', `Token ${gone.token}`)
      .send(readFileSync(join(__dirname, '../fixtures/images/pixel.gif')));
    expect(upload.status).toBe(200);
    const picture = new URL(upload.body.user.image).pathname;

    const response = await deleteMember(admin, gone.username);

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({
      deleted: {username: gone.username, articles: 1, comments: 1},
    });

    // The account: no profile, no sign-in, and the old session is over.
    expect(
      (await request(app).get(`/api/profiles/${gone.username}`)).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .post('/api/users/login')
          .send({user: {email: gone.email, password: 'whatever'}})
      ).status
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/user')
          .set('authorization', `Token ${gone.token}`)
      ).status
    ).toBe(401);
    // Their post and its comments, their picture.
    expect(
      (await request(app).get(`/api/articles/${theirs.slug}`)).status
    ).toBe(404);
    expect((await request(app).get(picture)).status).toBe(404);
    // The other post stays, without their comment or favourite.
    const article = await request(app)
      .get(`/api/articles/${kept.slug}`)
      .set('authorization', `Token ${other.token}`);
    expect(article.body.article.favoritesCount).toBe(1);
    expect(article.body.article.favorited).toBe(true);
    const {comments} = await articlesClient.getCommentsFromArticle(kept.slug);
    expect(comments.map((c: {id: string}) => c.id)).toEqual([keptComment.id]);
    // Nothing of theirs is left in the other member's feed.
    const feed = await request(app)
      .get('/api/articles/feed')
      .set('authorization', `Token ${other.token}`);
    expect(feed.body.articles).toEqual([]);
  });

  test('a deleted staging tester loses staging access', async () => {
    const admin = await adminToken();
    const {user} = await usersClient.registerRandomUser();
    await request(app)
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .set('authorization', `Token ${admin}`)
      .send({role: 'staging-tester'});
    staging.syncs = [];

    const response = await deleteMember(admin, user.username);

    expect(response.body.stagingAccess).toStrictEqual({
      synced: true,
      message: 'Staging access updated.',
    });
    expect(staging.syncs).toHaveLength(1);
    expect(staging.syncs[0]).not.toContain(user.email.toLowerCase());
  });

  test("can't delete an admin, Tataru, or someone unknown", async () => {
    const admin = await adminToken();

    const self = await deleteMember(admin, ADMIN.username);
    expect(self.status).toBe(422);
    expect(self.body.errors.body[0]).toContain('is an admin');

    expect((await deleteMember(admin, 'Tataru')).status).toBe(404);
    expect((await deleteMember(admin, 'nobody-at-all')).status).toBe(404);
  });

  test('only an admin can delete', async () => {
    const {user} = await usersClient.registerRandomUser();
    const victim = (await usersClient.registerRandomUser()).user;

    expect((await deleteMember(user.token, victim.username)).status).toBe(403);
    expect(
      (await request(app).delete(`/api/admin/users/${victim.username}`)).status
    ).toBe(401);
  });
});
