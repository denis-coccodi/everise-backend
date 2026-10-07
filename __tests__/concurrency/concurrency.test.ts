import 'jest-extended';
import request from 'supertest';
import {app, articlesClient, usersClient} from '../utils';

// Requests arriving together: their reads and writes interleave, and none
// may be lost or let a duplicate through.
describe('concurrent requests', () => {
  test('favorites from several members at once all count', async () => {
    const author = await usersClient.registerRandomUser();
    const {article} = await articlesClient.createRandomArticle(
      author.user.token,
    );
    const fans = await Promise.all(
      [1, 2, 3, 4].map(() => usersClient.registerRandomUser()),
    );

    await Promise.all(
      fans.map(fan =>
        request(app)
          .post(`/api/articles/${article.id}/favorite`)
          .set('authorization', `Token ${fan.user.token}`)
          .expect(200),
      ),
    );

    const after = await request(app).get(`/api/articles/${article.id}`);
    expect(after.body.article.favoritesCount).toBe(4);
  });

  test('two sign-ups with the same email at once make one account', async () => {
    const user = {
      email: `twin-${Date.now()}@example.com`,
      username: `twin${Date.now()}`,
      password: 'a-long-password',
    };

    const responses = await Promise.all([
      request(app).post('/api/users').send({user}),
      request(app)
        .post('/api/users')
        .send({user: {...user, username: `${user.username}b`}}),
    ]);

    expect(responses.map(response => response.status).sort()).toEqual([
      201, 422,
    ]);
  });

  test('following someone twice at once follows them once', async () => {
    const follower = await usersClient.registerRandomUser();
    const followee = await usersClient.registerRandomUser();
    const follow = () =>
      request(app)
        .post(`/api/profiles/${followee.user.id}/follow`)
        .set('authorization', `Token ${follower.user.token}`)
        .expect(200);

    await Promise.all([follow(), follow()]);
    await request(app)
      .delete(`/api/profiles/${followee.user.id}/follow`)
      .set('authorization', `Token ${follower.user.token}`)
      .expect(200);

    const profile = await request(app)
      .get(`/api/profiles/${followee.user.id}`)
      .set('authorization', `Token ${follower.user.token}`);
    expect(profile.body.profile.following).toBe(false);
  });
});
