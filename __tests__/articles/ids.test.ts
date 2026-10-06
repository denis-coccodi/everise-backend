import 'jest-extended';
import request from 'supertest';
import {app, articlesClient, db, usersClient} from '../utils';

// Posts and members are identified by their ids, never by a title or a
// username, which can change. Links from before that still work.
describe('ids in links', () => {
  test("a post's link is its id, and survives a new title", async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);
    expect(article.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(article).not.toHaveProperty('slug');

    await request(app)
      .put(`/api/articles/${article.id}`)
      .set('authorization', `Token ${user.token}`)
      .send({article: {title: 'A completely different title'}});

    const response = await request(app).get(`/api/articles/${article.id}`);
    expect(response.status).toBe(200);
    expect(response.body.article.title).toBe('A completely different title');
  });

  test("an old link with a post's title-made slug still opens it", async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);
    // As posts were stored before they had ids in their links.
    await db.update('articles', article.id, {
      slug: 'duty-found-sastasha-1fb67b60',
    });

    const response = await request(app).get(
      '/api/articles/duty-found-sastasha-1fb67b60'
    );

    expect(response.status).toBe(200);
    expect(response.body.article.id).toBe(article.id);
    const comments = await request(app).get(
      '/api/articles/duty-found-sastasha-1fb67b60/comments'
    );
    expect(comments.status).toBe(200);
  });

  test('a profile is found by id, and by an old link with the username', async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);

    const byId = await request(app).get(`/api/profiles/${article.author.id}`);
    expect(byId.status).toBe(200);
    expect(byId.body.profile).toMatchObject({
      id: article.author.id,
      username: user.username,
    });

    const byName = await request(app).get(
      `/api/profiles/${encodeURIComponent(user.username)}`
    );
    expect(byName.body.profile.id).toBe(article.author.id);

    // A new username keeps the id, so links by id keep working.
    await request(app)
      .put('/api/user')
      .set('authorization', `Token ${user.token}`)
      .send({user: {username: `renamed${Date.now()}`}});
    const renamed = await request(app).get(
      `/api/profiles/${article.author.id}`
    );
    expect(renamed.body.profile.username).toMatch(/^renamed/);
  });

  test("lists a member's posts and favourites by their id", async () => {
    const {user} = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(user.token);
    await articlesClient.favoriteArticle(user.token, article.id);

    const written = await request(app)
      .get('/api/articles')
      .query({author: article.author.id});
    const favourites = await request(app)
      .get('/api/articles')
      .query({favorited: article.author.id});

    expect(written.body.articles.map((a: {id: string}) => a.id)).toEqual([
      article.id,
    ]);
    expect(favourites.body.articles.map((a: {id: string}) => a.id)).toEqual([
      article.id,
    ]);
  });
});
