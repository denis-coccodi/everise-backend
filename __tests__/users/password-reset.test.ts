import 'jest-extended';
import request from 'supertest';
import {PasswordReset, UserPasswords, UsersService} from '../../src/users';
import {app, clearDb, clock, db, mail, usersClient} from '../utils';

const YSHTOLA = {
  email: 'yshtola@example.com',
  username: 'Yshtola',
  password: 'white-mage-1',
};

function forgot(email = YSHTOLA.email) {
  return request(app).post('/api/users/password-reset').send({user: {email}});
}

function reset(code: string | undefined, password = 'brand-new-one') {
  return request(app)
    .post('/api/users/password-reset/confirm')
    .send({code, password});
}

function signIn(password: string, email = YSHTOLA.email) {
  return request(app).post('/api/users/login').send({user: {email, password}});
}

// The code in the last email to `email`.
function lastCode(email = YSHTOLA.email) {
  const message = [...mail.sent].reverse().find(m => m.to === email);
  return message?.text.match(/\n\n([A-Z0-9]{4}-[A-Z0-9]{4})\n\n/)?.[1];
}

function at(time: string) {
  clock.now = new Date(time);
}

describe('"Forgot password?"', () => {
  beforeEach(async () => {
    await clearDb();
    mail.sent = [];
    at('2026-10-16T12:00:00Z');
  });

  afterAll(() => {
    clock.now = undefined;
  });

  async function register() {
    const {user} = await usersClient.registerUser(
      YSHTOLA.email,
      YSHTOLA.username,
      YSHTOLA.password,
    );
    mail.sent = [];
    return user.token as string;
  }

  test('emails a code that sets a new password, signing out everywhere', async () => {
    const token = await register();

    const asked = await forgot();

    expect(asked.status).toBe(202);
    expect(asked.body).toStrictEqual({
      passwordReset: {email: YSHTOLA.email},
    });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({
      to: YSHTOLA.email,
      subject: 'Your Everise password code',
    });
    const code = lastCode()!;
    expect(mail.sent[0].text).toContain(`/reset-password?code=${code}`);

    const done = await reset(code);

    expect(done.status).toBe(204);
    expect((await signIn(YSHTOLA.password)).status).toBe(401);
    expect((await signIn('brand-new-one')).status).toBe(200);
    const stale = await request(app)
      .get('/api/user')
      .set('Authorization', `Token ${token}`);
    expect(stale.status).toBe(401);
    expect(mail.sent[mail.sent.length - 1].subject).toBe(
      'Your Everise password was changed',
    );
  });

  test('takes the code in any case, without the dash', async () => {
    await register();
    await forgot();

    const code = lastCode()!.replace('-', '').toLowerCase();

    expect((await reset(` ${code} `)).status).toBe(204);
  });

  test('a code works once', async () => {
    await register();
    await forgot();
    const code = lastCode();
    await reset(code);

    const again = await reset(code, 'yet-another-one');

    expect(again.status).toBe(422);
    expect(again.body.errors.body).toEqual([
      'That code is wrong or has expired. Check it, or ask for a new one.',
    ]);
  });

  test('a code lasts 15 minutes', async () => {
    await register();
    await forgot();

    at('2026-10-16T12:15:00Z');

    expect((await reset(lastCode())).status).toBe(422);
    expect((await signIn(YSHTOLA.password)).status).toBe(200);
  });

  test('a new code replaces the one before', async () => {
    await register();
    await forgot();
    const first = lastCode();
    at('2026-10-16T12:01:00Z');
    await forgot();

    expect((await reset(first)).status).toBe(422);
    expect((await reset(lastCode())).status).toBe(204);
  });

  test('a wrong code, or a new password too short, keeps the old password and the code', async () => {
    await register();
    await forgot();

    const wrong = await reset('AAAA-AAAA');
    const short = await reset(lastCode(), 'short');

    expect(wrong.status).toBe(422);
    expect(short.status).toBe(422);
    expect(short.body.errors.body).toEqual([
      'Your password needs at least 8 characters.',
    ]);
    expect((await signIn(YSHTOLA.password)).status).toBe(200);
    expect((await reset(lastCode())).status).toBe(204);
  });

  test.each([
    [{}, ['Enter the code from the email.', 'Choose a password.']],
    [
      {code: 'x'.repeat(33), password: 'long-enough'},
      ['That code is wrong or has expired. Check it, or ask for a new one.'],
    ],
  ])('checks the form %p', async (body, messages) => {
    const response = await request(app)
      .post('/api/users/password-reset/confirm')
      .send(body);

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual(messages);
  });

  test('answers the same for an address without an account, and sends nothing', async () => {
    const response = await forgot('nobody@example.com');

    expect(response.status).toBe(202);
    expect(response.body).toStrictEqual({
      passwordReset: {email: 'nobody@example.com'},
    });
    expect(mail.sent).toEqual([]);
  });

  test("sends nothing to a sign-up that hasn't confirmed its email", async () => {
    await request(app).post('/api/users').send({user: YSHTOLA});
    mail.sent = [];

    expect((await forgot()).status).toBe(202);
    expect(mail.sent).toEqual([]);
  });

  test('finds the account in any letter case', async () => {
    await register();

    await forgot('YShtola@Example.com');

    expect(lastCode()).toBeString();
  });

  test('sends a code once a minute and five times a day', async () => {
    await register();
    await forgot();

    const soon = await forgot();
    expect(soon.status).toBe(429);
    expect(soon.headers['retry-after']).toBe('60');
    expect(soon.body.errors.body).toEqual([
      "We've just sent a code. Try again in 60 seconds.",
    ]);

    for (const minute of [1, 2, 3, 4]) {
      at(`2026-10-16T12:0${minute}:00Z`);
      expect((await forgot()).status).toBe(202);
    }
    at('2026-10-16T12:05:00Z');
    const sixth = await forgot();
    expect(sixth.status).toBe(429);
    expect(sixth.body.errors.body).toEqual([
      "That's enough codes for today. Try again tomorrow.",
    ]);
  });

  test('lets an account made with a provider set its first password', async () => {
    await db.create('users', {
      email: 'nopass@example.com',
      username: 'NoPass',
      googleId: 'google-1',
    });

    await forgot('nopass@example.com');
    const done = await reset(lastCode('nopass@example.com'));

    expect(done.status).toBe(204);
    expect((await signIn('brand-new-one', 'nopass@example.com')).status).toBe(
      200,
    );
  });

  test("isn't available without an email sender", async () => {
    const usersService = new UsersService(db);
    const without = new PasswordReset(
      db,
      usersService,
      new UserPasswords(db),
      undefined,
      'https://everise.test',
    );

    await expect(without.send(YSHTOLA.email)).rejects.toThrow(
      "Passwords can't be reset by email on this site.",
    );
  });
});
