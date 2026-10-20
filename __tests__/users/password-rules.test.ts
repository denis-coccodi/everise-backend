import 'jest-extended';
import {createHash} from 'crypto';
import request from 'supertest';
import {app, clearDb, clock, mail, pwned, usersClient} from '../utils';

const THANCRED = {
  email: 'thancred@example.com',
  username: 'Thancred',
  password: 'gunbreaker-1',
};
const LEAKED = 'qwerty123456';
const LEAK_MESSAGE =
  "That password is too common: it's on a list of passwords used on many other websites, so it's easy to guess. Please choose a different one.";

function signUp(password: string, email = THANCRED.email) {
  return request(app)
    .post('/api/users')
    .send({user: {...THANCRED, email, password}});
}

function signIn(password: string, email = THANCRED.email) {
  return request(app).post('/api/users/login').send({user: {email, password}});
}

async function register() {
  const {user} = await usersClient.registerUser(
    THANCRED.email,
    THANCRED.username,
    THANCRED.password,
  );
  return user.token as string;
}

function at(time: string) {
  clock.now = new Date(time);
}

describe('new passwords', () => {
  beforeEach(async () => {
    await clearDb();
    mail.sent = [];
    pwned.status = 200;
    pwned.requests = [];
  });

  test('one from a data leak is refused at sign-up, sending only the start of its hash', async () => {
    const response = await signUp(LEAKED);

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([LEAK_MESSAGE]);
    const hash = createHash('sha1').update(LEAKED).digest('hex').toUpperCase();
    expect(pwned.requests).toEqual([
      {
        url: `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
        headers: {'Add-Padding': 'true'},
      },
    ]);
  });

  test('one from a data leak is refused in the settings and with a reset code', async () => {
    const token = await register();

    const settings = await request(app)
      .put('/api/user')
      .set('Authorization', `Token ${token}`)
      .send({user: {password: LEAKED, currentPassword: THANCRED.password}});
    await request(app)
      .post('/api/users/password-reset')
      .send({user: {email: THANCRED.email}});
    const code = mail.sent[mail.sent.length - 1].text.match(
      /[A-Z0-9]{4}-[A-Z0-9]{4}/,
    )![0];
    const reset = await request(app)
      .post('/api/users/password-reset/confirm')
      .send({code, password: LEAKED});

    expect(settings.status).toBe(422);
    expect(settings.body.errors.body).toEqual([LEAK_MESSAGE]);
    expect(reset.status).toBe(422);
    expect(reset.body.errors.body).toEqual([LEAK_MESSAGE]);
    expect((await signIn(THANCRED.password)).status).toBe(200);
  });

  test('when Have I Been Pwned is down, any password is allowed', async () => {
    pwned.status = 503;

    expect((await signUp(LEAKED)).status).toBe(201);
  });

  test('an existing password that later leaked still signs in', async () => {
    await register();
    pwned.passwords.add(THANCRED.password);

    try {
      expect((await signIn(THANCRED.password)).status).toBe(200);
    } finally {
      pwned.passwords.delete(THANCRED.password);
    }
  });

  test.each([
    ['x'.repeat(72), 201],
    ['x'.repeat(73), 422],
    // 74 bytes: what bcrypt counts.
    ['é'.repeat(37), 422],
  ])('may be at most 72 bytes: %s', async (password, status) => {
    const response = await signUp(password);

    expect(response.status).toBe(status);
    if (status === 422) {
      expect(response.body.errors.body).toEqual([
        'Keep your password to 72 characters or fewer.',
      ]);
    }
  });
});

describe('wrong passwords at sign-in', () => {
  beforeEach(async () => {
    await clearDb();
    at('2026-10-16T12:00:00Z');
  });

  afterAll(() => {
    clock.now = undefined;
  });

  async function fail(times: number, email = THANCRED.email) {
    for (let i = 0; i < times; i++) {
      expect((await signIn('wrong-guess', email)).status).toBe(401);
    }
  }

  test('after 10 within 15 minutes, the address waits out the 15 minutes, even with the right password', async () => {
    await register();
    await fail(10);

    at('2026-10-16T12:05:00Z');
    const response = await signIn(THANCRED.password);

    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('600');
    expect(response.body.errors.body).toEqual([
      'Too many wrong passwords. Try again in 10 minutes, or use "Forgot password?".',
    ]);
    at('2026-10-16T12:15:00Z');
    expect((await signIn(THANCRED.password)).status).toBe(200);
  });

  test('count per address, in any letter case', async () => {
    await register();
    await fail(5);
    await fail(5, 'THANCRED@example.com');

    expect((await signIn(THANCRED.password)).status).toBe(429);
    expect((await signIn('anything', 'other@example.com')).status).toBe(401);
  });

  test('start over after a right password', async () => {
    await register();
    await fail(9);
    expect((await signIn(THANCRED.password)).status).toBe(200);

    await fail(9);

    expect((await signIn(THANCRED.password)).status).toBe(200);
  });

  test("count for an address without an account too, so the wait doesn't tell", async () => {
    await fail(10, 'nobody@example.com');

    expect((await signIn('wrong-guess', 'nobody@example.com')).status).toBe(
      429,
    );
  });
});
