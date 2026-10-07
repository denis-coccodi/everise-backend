import 'jest-extended';
import request from 'supertest';
import {URL} from 'url';
import {config} from '../../src/config';
import {
  app,
  clearDb,
  clock,
  lastConfirmationToken,
  mail,
  providers,
  usersClient,
} from '../utils';

const ALISAIE = {
  email: 'alisaie@example.com',
  username: 'Alisaie',
  password: 'red-mage-1234',
};

function signUp(user = ALISAIE) {
  return request(app).post('/api/users').send({user});
}

function signIn(email = ALISAIE.email, password = ALISAIE.password) {
  return request(app).post('/api/users/login').send({user: {email, password}});
}

function confirm(token: string | undefined) {
  return request(app).post('/api/users/confirm-email').send({token});
}

function resend(email = ALISAIE.email) {
  return request(app)
    .post('/api/users/confirm-email/resend')
    .send({user: {email}});
}

function at(time: string) {
  clock.now = new Date(time);
}

describe('email confirmation', () => {
  beforeEach(async () => {
    await clearDb();
    mail.sent = [];
    mail.failing = false;
    at('2026-10-06T12:00:00Z');
  });

  afterAll(() => {
    clock.now = undefined;
  });

  test('a sign-up gets a link by email, and is signed in only once it is opened', async () => {
    const response = await signUp();

    expect(response.status).toBe(201);
    expect(mail.sent).toHaveLength(1);
    const [message] = mail.sent;
    expect(message.to).toBe(ALISAIE.email);
    expect(message.subject).toBe('Confirm your email address for Everise');
    expect(message.text).toContain(
      `${config.baseUrl}/confirm-email?token=${lastConfirmationToken(
        ALISAIE.email,
      )}`,
    );
    expect(message.text).toContain('Welcome to Everise, Alisaie!');
    expect(message.html).toContain('Confirm my email');

    const early = await signIn();
    expect(early.status).toBe(403);
    expect(early.body).toStrictEqual({
      errors: {
        body: [
          'Confirm your email address first: open the link we sent to alisaie@example.com.',
        ],
      },
      unconfirmedEmail: ALISAIE.email,
    });

    const confirmed = await confirm(lastConfirmationToken(ALISAIE.email));
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.user).toMatchObject({
      email: ALISAIE.email,
      username: 'Alisaie',
    });
    expect(
      (confirmed.headers['set-cookie'] as unknown as string[]).some(c =>
        c.startsWith('token='),
      ),
    ).toBe(true);

    expect((await signIn()).status).toBe(200);
  });

  test('a wrong password still says only that, before the email is confirmed', async () => {
    await signUp();

    const response = await signIn(ALISAIE.email, 'not-the-password');

    expect(response.status).toBe(401);
  });

  test('a link works once, and for 24 hours', async () => {
    await signUp();
    const token = lastConfirmationToken(ALISAIE.email);

    at('2026-10-07T12:00:01Z');
    const late = await confirm(token);
    expect(late.status).toBe(422);
    expect(late.body.errors.body).toEqual([
      'This link has expired or was already used. Sign in to get a new one.',
    ]);

    await resend();
    const fresh = lastConfirmationToken(ALISAIE.email);
    expect((await confirm(fresh)).status).toBe(200);
    expect((await confirm(fresh)).status).toBe(422);
  });

  test('a link can be sent again, once a minute and five times a day', async () => {
    await signUp();
    const first = lastConfirmationToken(ALISAIE.email);

    const tooSoon = await resend();
    expect(tooSoon.status).toBe(429);
    expect(tooSoon.body.errors.body).toEqual([
      "We've just sent a link. Try again in 60 seconds.",
    ]);

    for (let minute = 1; minute <= 4; minute++) {
      at(`2026-10-06T12:0${minute}:00Z`);
      expect((await resend()).status).toBe(202);
    }
    expect(mail.sent).toHaveLength(5);
    // Only the newest link works.
    expect((await confirm(first)).status).toBe(422);

    at('2026-10-06T12:06:00Z');
    const enough = await resend();
    expect(enough.status).toBe(429);
    expect(enough.body.errors.body).toEqual([
      "That's enough links for today. Try again tomorrow.",
    ]);

    at('2026-10-07T12:00:01Z');
    expect((await resend()).status).toBe(202);
    expect(mail.sent).toHaveLength(6);
  });

  test("sending again says the same whether or not there's an account waiting", async () => {
    await usersClient.registerUser(
      'urianger@example.com',
      'Urianger',
      'pass12345',
    );
    mail.sent = [];

    for (const email of ['nobody@example.com', 'urianger@example.com']) {
      const response = await resend(email);
      expect(response.status).toBe(202);
      expect(response.body).toStrictEqual({confirmation: {email}});
    }
    expect(mail.sent).toEqual([]);
  });

  test('signing up again with an unconfirmed email replaces that sign-up', async () => {
    await signUp({...ALISAIE, username: 'Squatter', password: 'someone-else'});
    const squatters = lastConfirmationToken(ALISAIE.email);

    at('2026-10-06T12:00:30Z');
    const response = await signUp();
    expect(response.status).toBe(201);

    expect((await confirm(squatters)).status).toBe(422);
    const confirmed = await confirm(lastConfirmationToken(ALISAIE.email));
    expect(confirmed.body.user.username).toBe('Alisaie');
    // The first sign-up's username is free again.
    expect(
      (
        await signUp({
          email: 'other@example.com',
          username: 'Squatter',
          password: 'pass12345',
        })
      ).status,
    ).toBe(201);
  });

  test("a confirmed account's email can't be taken by a new sign-up", async () => {
    await usersClient.registerUser(ALISAIE.email, 'Alisaie', ALISAIE.password);

    const response = await signUp({...ALISAIE, username: 'Other'});

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'That email address is already registered. Sign in instead?',
    ]);
  });

  test("an email that can't be sent is reported, and can be sent again", async () => {
    mail.failing = true;
    const failed = await signUp();
    expect(failed.status).toBe(500);

    mail.failing = false;
    at('2026-10-06T12:01:00Z');
    expect((await resend()).status).toBe(202);
    expect((await confirm(lastConfirmationToken(ALISAIE.email))).status).toBe(
      200,
    );
  });

  test("signing in with Google ties to an unconfirmed sign-up, confirms it and drops the sign-up's password", async () => {
    // Someone signs up with Alisaie's address before she does.
    await signUp({...ALISAIE, password: 'squatters-password'});
    providers.profiles.google = {
      sub: 'g-alisaie',
      email: ALISAIE.email,
      email_verified: true,
      name: 'Alisaie',
    };

    const {headers} = await request(app).get('/api/auth/google');
    const location = new URL(headers.location);
    const cookie = (headers['set-cookie'] as unknown as string[])
      .find(c => c.startsWith('social_login='))!
      .split(';')[0];
    const back = await request(app)
      .get('/api/auth/google/callback')
      .query({code: 'the-code', state: location.searchParams.get('state')})
      .set('Cookie', cookie);
    expect(back.status).toBe(302);

    // The password set by whoever signed up no longer opens the account.
    expect((await signIn(ALISAIE.email, 'squatters-password')).status).toBe(
      401,
    );
  });

  describe('a new email address from the settings', () => {
    async function changeEmail(token: string, email: string) {
      return request(app)
        .put('/api/user')
        .set('Authorization', `Token ${token}`)
        .send({user: {email}});
    }

    test('waits for its link, then replaces the old one', async () => {
      const {user} = await usersClient.registerUser(
        ALISAIE.email,
        'Alisaie',
        ALISAIE.password,
      );

      const changed = await changeEmail(user.token, 'new@example.com');
      expect(changed.body.user).toMatchObject({
        email: ALISAIE.email,
        pendingEmail: 'new@example.com',
      });
      const message = mail.sent[mail.sent.length - 1];
      expect(message.to).toBe('new@example.com');
      expect(message.subject).toBe(
        'Confirm your new email address for Everise',
      );
      // Until then, the old address still signs in.
      expect((await signIn()).status).toBe(200);

      const confirmed = await confirm(lastConfirmationToken('new@example.com'));
      expect(confirmed.body.user).toMatchObject({
        email: 'new@example.com',
        pendingEmail: null,
      });
      expect((await signIn('new@example.com')).status).toBe(200);
      expect((await signIn()).status).toBe(401);
    });

    test("isn't used if someone else took it in the meantime", async () => {
      const {user} = await usersClient.registerUser(
        ALISAIE.email,
        'Alisaie',
        ALISAIE.password,
      );
      await changeEmail(user.token, 'taken@example.com');
      const token = lastConfirmationToken('taken@example.com');

      at('2026-10-06T12:02:00Z');
      await usersClient.registerUser('taken@example.com', 'Other', 'pass12345');

      const response = await confirm(token);
      expect(response.status).toBe(422);
      expect((await signIn()).status).toBe(200);
    });

    test('going back to the current address cancels the change', async () => {
      const {user} = await usersClient.registerUser(
        ALISAIE.email,
        'Alisaie',
        ALISAIE.password,
      );
      await changeEmail(user.token, 'new@example.com');

      const back = await changeEmail(user.token, ALISAIE.email);

      expect(back.body.user.pendingEmail).toBeNull();
      expect(
        (await confirm(lastConfirmationToken('new@example.com'))).status,
      ).toBe(422);
    });
  });
});
