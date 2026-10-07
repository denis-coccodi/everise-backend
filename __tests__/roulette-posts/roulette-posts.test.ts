import 'jest-extended';
import request from 'supertest';
import {config} from '../../src/config';
import {GUEST_LINES} from '../../src/roulette-posts/roulette-posts-service';
import {app, clearDb, clock, usersClient, xivApi} from '../utils';

const postUrl = '/api/roulette-results';

// What the reels landed on, as the frontend sends it.
const sastasha = {
  type: 'Dungeons',
  candidate: {kind: 'duty', id: 1},
  mode: 'Regular',
};

let nextAddress = 1;
// A guest post from its own address, so the per-address limit doesn't apply.
function postAsGuest(body: object, address = `203.0.113.${nextAddress++}`) {
  return request(app).post(postUrl).set('cf-connecting-ip', address).send(body);
}

function postAs(token: string, body: object) {
  return request(app)
    .post(postUrl)
    .set('authorization', `Token ${token}`)
    .send(body);
}

describe('POST /api/roulette-results', () => {
  beforeEach(async () => {
    await clearDb();
    xivApi.reset();
    clock.now = undefined;
    // The duty data the results are checked against.
    const refreshed = await request(app)
      .post('/api/duties/refresh')
      .set('X-Refresh-Key', process.env.DUTIES_REFRESH_KEY!)
      .send();
    expect(refreshed.status).toBe(200);
  });

  describe("a guest's result", () => {
    test('should be posted by Tataru with one of her lines, and the card built from the duty data', async () => {
      const response = await postAsGuest({result: sastasha});

      expect(response.status).toBe(201);
      const {article} = response.body;
      expect(article).toMatchObject({
        title: 'Duty Found: Sastasha',
        description: 'Dungeons · Regular',
        tagList: ['roulette'],
        author: {
          id: expect.any(String),
          username: 'Tataru',
          // Her picture is stored like anyone's upload.
          image: expect.stringMatching(
            new RegExp(`^${config.baseUrl}/api/profile-images/[0-9a-f-]{36}$`),
          ),
        },
        roulette: {
          type: 'Dungeons',
          name: 'Sastasha',
          detail: 'Lv. 15 · A Realm Reborn',
          mode: 'Regular',
          dutyUnknown: false,
          image: 112001,
          job: null,
          guest: true,
        },
      });
      expect(GUEST_LINES).toContain(article.body);
      // Identified by its id, not its (repeating) title.
      expect(article.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('should always be posted by the same Tataru, a profile anyone can see', async () => {
      const first = await postAsGuest({result: sastasha});
      const second = await postAsGuest({result: sastasha});

      expect(second.body.article.author.username).toBe(
        first.body.article.author.username,
      );
      const profile = await request(app).get('/api/profiles/Tataru');
      expect(profile.status).toBe(200);
      expect(profile.body.profile.bio).toContain('roulette results');
      // The same stored picture each time, served like an upload.
      expect(second.body.article.author.image).toBe(
        first.body.article.author.image,
      );
      const picture = await request(app).get(
        first.body.article.author.image.slice(config.baseUrl.length),
      );
      expect(picture.status).toBe(200);
      expect(picture.headers['content-type']).toBe('image/png');
    });

    test('should not be able to add a comment', async () => {
      const response = await postAsGuest({
        result: sastasha,
        comment: 'Buy cheap gil at example.com',
      });

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({
        errors: {body: ['Sign in to add a comment to your result.']},
      });
    });
  });

  describe("a signed-in user's result", () => {
    test('should be posted as them, with their comment', async () => {
      const {user} = await usersClient.registerRandomUser();

      const response = await postAs(user.token, {
        result: sastasha,
        comment: '  Tanking this one, wish me luck!  ',
      });

      expect(response.status).toBe(201);
      expect(response.body.article).toMatchObject({
        body: 'Tanking this one, wish me luck!',
        author: {username: user.username},
        roulette: {name: 'Sastasha', guest: false},
      });
    });

    test('should be postable without a comment', async () => {
      const {user} = await usersClient.registerRandomUser();

      const response = await postAs(user.token, {result: sastasha});

      expect(response.status).toBe(201);
      expect(response.body.article.body).toBe('');
    });

    test("should show the job dealt by dealer's choice", async () => {
      const {user} = await usersClient.registerRandomUser();

      const response = await postAs(user.token, {
        result: {
          ...sastasha,
          mode: "Everyone on the same job: dealer's choice",
          jobId: 41,
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.article.roulette).toMatchObject({
        mode: 'Everyone on the same job: Viper',
        job: {name: 'Viper', icon: 62141},
      });
    });

    test('should be limited to 280 characters of comment', async () => {
      const {user} = await usersClient.registerRandomUser();

      const response = await postAs(user.token, {
        result: sastasha,
        comment: 'a'.repeat(281),
      });

      expect(response.status).toBe(422);
      expect(response.body.errors.body).toEqual([
        'Keep the comment to 280 characters.',
      ]);
    });
  });

  describe('a result the roulette could not have produced', () => {
    test.each([
      [
        'a duty under another type',
        {
          type: 'Trials — Extreme',
          candidate: {kind: 'duty', id: 1},
          mode: 'Regular',
        },
        "That duty isn't one the roulette can land on.",
      ],
      [
        'an unknown duty',
        {
          type: 'Dungeons',
          candidate: {kind: 'duty', id: 9999},
          mode: 'Regular',
        },
        "That duty isn't one the roulette can land on.",
      ],
      [
        'a duty roulette given as a duty',
        {
          type: 'Duty Roulettes',
          candidate: {kind: 'duty', id: 1},
          mode: 'Regular',
        },
        "That duty isn't one the roulette can land on.",
      ],
      [
        'a Frontline map (only the daily challenge is queued)',
        {type: 'PvP', candidate: {kind: 'duty', id: 130}, mode: 'Regular'},
        "That duty isn't one the roulette can land on.",
      ],
      [
        'Unsynced for a duty that does not allow it',
        {
          type: 'Raids — Ultimate',
          candidate: {kind: 'duty', id: 4},
          mode: 'Unsynced',
        },
        "Those party settings aren't possible for that duty.",
      ],
      [
        'Awktrail below level 50',
        {...sastasha, mode: 'Awktrail'},
        "Those party settings aren't possible for that duty.",
      ],
      [
        'the same job for a duty roulette',
        {
          type: 'Duty Roulettes',
          candidate: {kind: 'roulette', id: 1},
          mode: 'Everyone on the same job',
        },
        "Those party settings aren't possible for that duty.",
      ],
      [
        'made-up party settings',
        {...sastasha, mode: 'Everyone naked'},
        "Those party settings aren't possible for that duty.",
      ],
      [
        "dealer's choice without a job",
        {...sastasha, mode: "Everyone on the same job: dealer's choice"},
        "Dealer's choice needs a job.",
      ],
      [
        "dealer's choice with a limited job",
        {
          ...sastasha,
          mode: "Everyone on the same job: dealer's choice",
          jobId: 36,
        },
        "Dealer's choice needs a job.",
      ],
    ])('should reject %s', async (_label, result, message) => {
      const response = await postAsGuest({result});

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({errors: {body: [message]}});
    });

    test('should accept a duty roulette, whose duty the game picks', async () => {
      const response = await postAsGuest({
        result: {
          type: 'Duty Roulettes',
          candidate: {kind: 'roulette', id: 1},
          mode: 'Join Party in Progress',
        },
      });

      expect(response.status).toBe(201);
      expect(response.body.article.roulette).toMatchObject({
        name: 'Duty Roulette: Leveling',
        detail: 'Light Party Dungeons & Trials · the game picks the duty',
        dutyUnknown: true,
      });
    });

    test.each([
      // Before the 15:00 UTC daily reset (17:00 in Italy in summer), and after.
      ['2026-10-05T14:59:00Z', 'Seal Rock (Seize)'],
      ['2026-10-05T15:00:00Z', 'the Borderland Ruins (Secure)'],
    ])(
      'at %s, the Frontline daily challenge should name %s',
      async (now, map) => {
        clock.now = new Date(now);

        const response = await postAsGuest({
          result: {
            type: 'PvP',
            candidate: {kind: 'roulette', id: 3},
            mode: 'Join Party in Progress',
          },
        });

        expect(response.status).toBe(201);
        expect(response.body.article.roulette).toMatchObject({
          name: 'Frontline (Daily Challenge)',
          detail: `Map of the day: ${map}`,
          dutyUnknown: false,
        });
      },
    );
  });

  describe('limits', () => {
    test('a guest can post once a minute from one address', async () => {
      clock.now = new Date('2026-10-05T12:00:00Z');
      expect(
        (await postAsGuest({result: sastasha}, '198.51.100.7')).status,
      ).toBe(201);

      const again = await postAsGuest({result: sastasha}, '198.51.100.7');
      expect(again.status).toBe(429);
      expect(again.headers['retry-after']).toBe('60');
      expect(again.body.errors.body[0]).toBe(
        'Slow down! Tataru is still filing your last result. Try again in 60 seconds.',
      );

      clock.now = new Date('2026-10-05T12:01:00Z');
      expect(
        (await postAsGuest({result: sastasha}, '198.51.100.7')).status,
      ).toBe(201);
    });

    test('a signed-in user can post every 15 seconds', async () => {
      clock.now = new Date('2026-10-05T12:00:00Z');
      const {user} = await usersClient.registerRandomUser();
      expect((await postAs(user.token, {result: sastasha})).status).toBe(201);

      const again = await postAs(user.token, {result: sastasha});
      expect(again.status).toBe(429);
      expect(again.body.errors.body[0]).toBe(
        'You can post another result in 15 seconds.',
      );
    });

    test('guests can post 60 results an hour in all', async () => {
      clock.now = new Date('2026-10-05T12:00:00Z');
      for (let i = 0; i < 60; i++) {
        expect((await postAsGuest({result: sastasha})).status).toBe(201);
      }

      const over = await postAsGuest({result: sastasha});
      expect(over.status).toBe(429);
      expect(over.body.errors.body[0]).toBe(
        'Tataru has posted enough guest results for now. Sign in to post yours, or try again later.',
      );

      // Signed-in users aren't affected.
      const {user} = await usersClient.registerRandomUser();
      expect((await postAs(user.token, {result: sastasha})).status).toBe(201);
    });
  });

  test('POST /api/articles should still need a signed-in user', async () => {
    const response = await request(app)
      .post('/api/articles')
      .send({article: {title: 'Spam', description: 'Spam', body: 'Spam'}});

    expect(response.status).toBe(401);
  });

  test('nobody can register as Tataru', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({
        user: {
          email: 'fake@example.com',
          username: 'tataru',
          password: 'password1234',
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'That username is taken. Try another one.',
    ]);
  });

  test('results should show in the global feed with their card', async () => {
    await postAsGuest({result: sastasha});

    const feed = await request(app).get('/api/articles');

    expect(feed.body.articles[0]).toMatchObject({
      title: 'Duty Found: Sastasha',
      author: {username: 'Tataru'},
      roulette: {name: 'Sastasha', guest: true},
    });
  });
});
