import request from 'supertest';
import {articlesClient, clock, profilesClient, usersClient} from '../utils';
import {app} from '../utils/app';

type Member = Awaited<ReturnType<typeof usersClient.registerRandomUser>>;

const as = (member: Member) => ({authorization: `Token ${member.user.token}`});

const notificationsOf = async (member: Member) =>
  (await request(app).get('/api/notifications').set(as(member))).body;

const favorite = (member: Member, articleId: string, on = true) =>
  request(app)
    [on ? 'post' : 'delete'](`/api/articles/${articleId}/favorite`)
    .set(as(member));

describe('notifications', () => {
  let author: Member;
  let alisaie: Member;
  let alphinaud: Member;

  beforeEach(async () => {
    [author, alisaie, alphinaud] = await Promise.all([
      usersClient.registerRandomUser(),
      usersClient.registerRandomUser(),
      usersClient.registerRandomUser(),
    ]);
  });

  test("a like tells the post's author who liked which post, grouped per post, newest first", async () => {
    const {article} = await articlesClient.createRandomArticle(
      author.user.token,
    );

    clock.now = new Date('2026-10-13T10:00:00Z');
    await favorite(alisaie, article.id);
    clock.now = new Date('2026-10-13T10:05:00Z');
    await favorite(alphinaud, article.id);
    // Liking twice is one notification; their own like, none.
    await favorite(alphinaud, article.id);
    await favorite(author, article.id);
    clock.now = undefined;

    const response = await request(app)
      .get('/api/notifications')
      .set(as(author));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.unseenCount).toBe(1);
    expect(response.body.notifications).toEqual([
      {
        id: `favorite:${article.id}`,
        type: 'favorite',
        at: expect.any(String),
        seen: false,
        read: false,
        actors: [
          {
            id: expect.any(String),
            username: alphinaud.user.username,
            image: expect.any(String),
          },
          {
            id: expect.any(String),
            username: alisaie.user.username,
            image: expect.any(String),
          },
        ],
        actorCount: 2,
        article: {id: article.id, title: article.title},
        comment: null,
        partyFinder: null,
        role: null,
      },
    ]);
    expect((await notificationsOf(alisaie)).notifications).toEqual([]);

    // An unlike takes it back.
    await favorite(alisaie, article.id, false);
    const [after] = (await notificationsOf(author)).notifications;
    expect(after.actors.map((a: {username: string}) => a.username)).toEqual([
      alphinaud.user.username,
    ]);
    expect(after.actorCount).toBe(1);
  });

  test('a follow tells the member who followed them; an unfollow takes it back', async () => {
    await profilesClient.followUser(alisaie.user.token, author.user.username);

    const {notifications} = await notificationsOf(author);
    expect(notifications).toMatchObject([
      {
        type: 'follow',
        actors: [{username: alisaie.user.username}],
        actorCount: 1,
        article: null,
        comment: null,
      },
    ]);

    await request(app)
      .delete(`/api/profiles/${author.user.username}/follow`)
      .set(as(alisaie));
    expect((await notificationsOf(author)).notifications).toEqual([]);
  });

  test("a comment tells the post's author, with its opening words; deleting it takes it back", async () => {
    const {article} = await articlesClient.createRandomArticle(
      author.user.token,
    );
    const created = await request(app)
      .post(`/api/articles/${article.id}/comments`)
      .set(as(alisaie))
      .send({comment: {body: '  Count me in for the\n\nCoil tonight!  '}});
    const comment = created.body.comment;

    const [notification] = (await notificationsOf(author)).notifications;
    expect(notification).toMatchObject({
      id: `comment:${article.id}`,
      type: 'comment',
      actors: [{username: alisaie.user.username}],
      article: {id: article.id, title: article.title},
      comment: {id: comment.id, excerpt: 'Count me in for the Coil tonight!'},
    });

    await request(app)
      .delete(`/api/articles/${article.id}/comments/${comment.id}`)
      .set(as(alisaie));
    expect((await notificationsOf(author)).notifications).toEqual([]);
  });

  test('opening the list clears the badge; each stays unread until opened, or all are marked read', async () => {
    const {article} = await articlesClient.createRandomArticle(
      author.user.token,
    );
    clock.now = new Date('2026-10-13T11:00:00Z');
    await favorite(alisaie, article.id);
    clock.now = new Date('2026-10-13T11:05:00Z');
    await profilesClient.followUser(alphinaud.user.token, author.user.username);
    clock.now = undefined;

    const unseen = await request(app)
      .get('/api/notifications/unseen')
      .set(as(author));
    expect(unseen.body).toEqual({unseenCount: 2});

    const seen = await request(app)
      .post('/api/notifications/seen')
      .set(as(author));
    expect(seen.body.unseenCount).toBe(0);
    expect(seen.body.notifications.map((n: {read: boolean}) => n.read)).toEqual(
      [false, false],
    );

    const one = await request(app)
      .post(
        `/api/notifications/${encodeURIComponent(`favorite:${article.id}`)}/read`,
      )
      .set(as(author));
    expect(
      one.body.notifications.map((n: {type: string; read: boolean}) => [
        n.type,
        n.read,
      ]),
    ).toEqual([
      ['follow', false],
      ['favorite', true],
    ]);

    const all = await request(app)
      .post('/api/notifications/read')
      .set(as(author));
    expect(all.body.notifications.every((n: {read: boolean}) => n.read)).toBe(
      true,
    );

    // Something new is unseen again.
    await favorite(alphinaud, article.id);
    expect((await notificationsOf(author)).unseenCount).toBe(1);
  });

  test("a deleted post's notifications go with it", async () => {
    const {article} = await articlesClient.createRandomArticle(
      author.user.token,
    );
    await favorite(alisaie, article.id);

    await request(app).delete(`/api/articles/${article.id}`).set(as(author));

    expect((await notificationsOf(author)).notifications).toEqual([]);
  });

  test('are for members only', async () => {
    for (const [method, path] of [
      ['get', '/api/notifications'],
      ['get', '/api/notifications/unseen'],
      ['post', '/api/notifications/seen'],
      ['post', '/api/notifications/read'],
    ] as const) {
      expect((await request(app)[method](path)).status).toBe(401);
    }
  });
});
