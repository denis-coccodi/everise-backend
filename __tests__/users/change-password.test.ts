import 'jest-extended';
import request from 'supertest';
import {app, clearDb, db, jwt, mail, usersClient} from '../utils';

const ESTINIEN = {
  email: 'estinien@example.com',
  username: 'Estinien',
  password: 'azure-dragoon',
};

function update(token: string, user: Record<string, unknown>) {
  return request(app)
    .put('/api/user')
    .set('Authorization', `Token ${token}`)
    .send({user});
}

function signIn(password: string, email = ESTINIEN.email) {
  return request(app).post('/api/users/login').send({user: {email, password}});
}

function currentUser(token: string) {
  return request(app).get('/api/user').set('Authorization', `Token ${token}`);
}

// The session cookie a response set, if any.
function sessionCookie(response: request.Response) {
  const cookies = ([] as string[]).concat(response.headers['set-cookie'] ?? []);
  return cookies.find(c => c.startsWith('token='));
}

async function register() {
  const {user} = await usersClient.registerUser(
    ESTINIEN.email,
    ESTINIEN.username,
    ESTINIEN.password,
  );
  return user.token as string;
}

// An account made with a provider: no password.
async function providerAccount() {
  const doc = await db.create('users', {
    email: 'nopass@example.com',
    username: 'NoPass',
    googleId: 'google-1',
  });
  return jwt.getRandomToken({subject: doc.id});
}

describe('changing the password from the settings', () => {
  beforeEach(async () => {
    await clearDb();
    mail.sent = [];
  });

  test('takes the current password, signs out other devices and tells the member by email', async () => {
    const token = await register();
    const otherDevice = (await signIn(ESTINIEN.password)).body.user.token;

    const response = await update(token, {
      password: 'new-dragoon-1',
      currentPassword: ESTINIEN.password,
    });

    expect(response.status).toBe(200);
    // This device stays signed in, with a new session.
    expect(sessionCookie(response)).toStartWith('token=ey');
    expect((await currentUser(response.body.user.token)).status).toBe(200);
    expect((await currentUser(token)).status).toBe(401);
    expect((await currentUser(otherDevice)).status).toBe(401);
    expect((await signIn(ESTINIEN.password)).status).toBe(401);
    expect((await signIn('new-dragoon-1')).status).toBe(200);
    const notice = mail.sent[mail.sent.length - 1];
    expect(notice).toMatchObject({
      to: ESTINIEN.email,
      subject: 'Your Everise password was changed',
    });
  });

  test.each([
    [undefined, 'Enter your current password.'],
    ['not-it', 'Your current password is wrong.'],
  ])(
    'with current password %p is refused, and nothing changes',
    async (currentPassword, message) => {
      const token = await register();

      const response = await update(token, {
        password: 'new-dragoon-1',
        username: 'Renamed',
        currentPassword,
      });

      expect(response.status).toBe(422);
      expect(response.body).toStrictEqual({errors: {body: [message]}});
      expect((await currentUser(token)).body.user.username).toBe('Estinien');
      expect((await signIn(ESTINIEN.password)).status).toBe(200);
    },
  );

  test('a new password that is too short changes nothing else either', async () => {
    const token = await register();

    const response = await update(token, {
      password: 'short',
      username: 'Renamed',
      currentPassword: ESTINIEN.password,
    });

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'Your password needs at least 8 characters.',
    ]);
    expect((await currentUser(token)).body.user.username).toBe('Estinien');
  });

  test('a new email address also takes the current password', async () => {
    const token = await register();

    const refused = await update(token, {email: 'new@example.com'});
    const accepted = await update(token, {
      email: 'new@example.com',
      currentPassword: ESTINIEN.password,
    });

    expect(refused.status).toBe(422);
    expect(refused.body.errors.body).toEqual(['Enter your current password.']);
    expect(accepted.status).toBe(200);
    expect(accepted.body.user.pendingEmail).toBe('new@example.com');
  });

  test('the same address in other letter case is no change, and needs no password', async () => {
    const token = await register();

    const response = await update(token, {email: 'Estinien@Example.com'});

    expect(response.status).toBe(200);
    expect(response.body.user).toMatchObject({
      email: ESTINIEN.email,
      pendingEmail: null,
    });
  });

  test('other settings need no password', async () => {
    const token = await register();

    const response = await update(token, {bio: 'Dragoon.', darkMode: false});

    expect(response.status).toBe(200);
    expect(sessionCookie(response)).toBeUndefined();
  });

  test('an account made with a provider changes its email without a password, but sets one with a reset code', async () => {
    const token = await providerAccount();

    const email = await update(token, {email: 'new@example.com'});
    const password = await update(token, {password: 'first-password'});

    expect(email.status).toBe(200);
    expect(password.status).toBe(422);
    expect(password.body.errors.body).toEqual([
      'Your account has no password yet. Use "Forgot password?" on the sign-in page to get a code by email and set one.',
    ]);
  });
});

describe('POST /api/users/logout-everywhere', () => {
  beforeEach(async () => {
    await clearDb();
  });

  test('ends every session and clears the cookie', async () => {
    const token = await register();
    const otherDevice = (await signIn(ESTINIEN.password)).body.user.token;

    const response = await request(app)
      .post('/api/users/logout-everywhere')
      .set('Authorization', `Token ${token}`);

    expect(response.status).toBe(204);
    expect(sessionCookie(response)).toStartWith('token=;');
    expect((await currentUser(token)).status).toBe(401);
    expect((await currentUser(otherDevice)).status).toBe(401);
    // The password still signs in, to a new session.
    const again = await signIn(ESTINIEN.password);
    expect((await currentUser(again.body.user.token)).status).toBe(200);
  });

  test('needs a signed-in member', async () => {
    const response = await request(app).post('/api/users/logout-everywhere');

    expect(response.status).toBe(401);
  });
});

describe('email addresses in any letter case', () => {
  beforeEach(async () => {
    await clearDb();
  });

  test('sign in to the same account', async () => {
    await register();

    const response = await signIn(ESTINIEN.password, 'ESTINIEN@example.COM');

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(ESTINIEN.email);
  });

  test("can't sign up twice", async () => {
    await register();

    const response = await request(app)
      .post('/api/users')
      .send({
        user: {
          email: 'Estinien@Example.com',
          username: 'Copy',
          password: 'another-one',
        },
      });

    expect(response.status).toBe(422);
    expect(response.body.errors.body).toEqual([
      'That email address is already registered. Sign in instead?',
    ]);
  });
});
