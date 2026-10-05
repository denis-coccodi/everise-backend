import 'jest-extended';
import request from 'supertest';
import {URL} from 'url';
import {config} from '../../src/config';
import {app, clearDb, providers, usersClient} from '../utils';

const site = config.baseUrl;

// Starts a sign-in as a browser would, and returns the provider's page and
// the state cookie it was given.
async function start(provider: string) {
  const response = await request(app).get(`/api/auth/${provider}`);
  const cookie = (response.headers['set-cookie'] as unknown as string[]).find(
    c => c.startsWith('social_login=')
  )!;
  return {
    response,
    location: new URL(response.headers.location),
    cookie: cookie.split(';')[0],
  };
}

// A whole sign-in: off to the provider, and back with its code.
async function signIn(provider: 'google' | 'facebook') {
  const {location, cookie} = await start(provider);
  const state = location.searchParams.get('state')!;
  return request(app)
    .get(`/api/auth/${provider}/callback`)
    .query({code: 'the-code', state})
    .set('Cookie', cookie);
}

function sessionToken(response: request.Response) {
  const cookie = (
    (response.headers['set-cookie'] as unknown as string[]) ?? []
  ).find(c => c.startsWith('token=') && !c.startsWith('token=;'));
  return cookie?.split(';')[0].slice('token='.length);
}

async function currentUser(token: string) {
  const response = await request(app)
    .get('/api/user')
    .set('Authorization', `Token ${token}`);
  return response.body.user;
}

describe('sign-in with Google and Facebook', () => {
  beforeEach(async () => {
    await clearDb();
    providers.calls = [];
    providers.profiles.google = undefined;
    providers.profiles.facebook = undefined;
  });

  test('GET /api/auth/providers lists the providers set up', async () => {
    const response = await request(app).get('/api/auth/providers');

    expect(response.status).toBe(200);
    expect(response.body).toStrictEqual({providers: ['google', 'facebook']});
  });

  test.each([
    ['google', 'https://accounts.google.com/o/oauth2/v2/auth', 'google-client'],
    ['facebook', 'https://www.facebook.com/v23.0/dialog/oauth', 'facebook-app'],
  ])(
    'starting with %s sends the browser to its sign-in page',
    async (provider, page, clientId) => {
      const {response, location, cookie} = await start(provider);

      expect(response.status).toBe(302);
      expect(`${location.origin}${location.pathname}`).toBe(page);
      expect(location.searchParams.get('client_id')).toBe(clientId);
      expect(location.searchParams.get('redirect_uri')).toBe(
        `${site}/api/auth/${provider}/callback`
      );
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(cookie).toBe(
        `social_login=${provider}.${location.searchParams.get('state')}`
      );
    }
  );

  test('a new Google account signs up, and is signed in', async () => {
    providers.profiles.google = {
      sub: 'g-1',
      email: 'New.Person@Example.com',
      email_verified: true,
      name: 'New Person',
    };

    const response = await signIn('google');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${site}/`);
    const user = await currentUser(sessionToken(response)!);
    expect(user).toMatchObject({
      email: 'new.person@example.com',
      username: 'NewPerson',
      role: 'user',
      // No password: Google is the only way in.
      signInMethods: ['google'],
    });
    // The code was traded with the app's secret, server to server.
    expect(providers.calls[0]).toMatchObject({
      url: 'https://oauth2.googleapis.com/token',
      method: 'POST',
    });
    expect(providers.calls[0].body).toContain('client_secret=google-secret');
    expect(providers.calls[0].body).toContain('code=the-code');
  });

  test('the same Google account signs in to the same account next time', async () => {
    providers.profiles.google = {
      sub: 'g-1',
      email: 'someone@example.com',
      email_verified: true,
      name: 'Someone',
    };
    await signIn('google');
    // Even after the email changed at Google.
    providers.profiles.google.email = 'other@example.com';

    const response = await signIn('google');

    const user = await currentUser(sessionToken(response)!);
    expect(user.email).toBe('someone@example.com');
    expect(user.username).toBe('Someone');
  });

  test('an existing account with the same email is tied to Facebook', async () => {
    const existing = await usersClient.registerRandomUser();
    providers.profiles.facebook = {
      id: 'fb-1',
      email: existing.user.email.toUpperCase(),
      name: 'Whoever',
    };

    const first = await signIn('facebook');
    const user = await currentUser(sessionToken(first)!);
    expect(user.username).toBe(existing.user.username);
    expect(user.signInMethods).toEqual(['password', 'facebook']);

    // Tied: the Facebook account finds it even under another email now, and
    // the password still works.
    providers.profiles.facebook.email = 'changed@example.com';
    const again = await currentUser(sessionToken(await signIn('facebook'))!);
    expect(again.username).toBe(existing.user.username);
    const login = await request(app)
      .post('/api/users/login')
      .send({
        user: {email: existing.user.email, password: existing.password},
      });
    expect(login.status).toBe(200);
  });

  test('a new account takes a free username', async () => {
    await usersClient.registerUser('a@example.com', 'Alex', 'password1');
    providers.profiles.google = {
      sub: 'g-2',
      email: 'alex@example.com',
      email_verified: true,
      name: 'Alex',
    };

    const user = await currentUser(sessionToken(await signIn('google'))!);

    expect(user.username).toBe('Alex2');
  });

  test("an account made with Google has no password: a password sign-in can't use it", async () => {
    providers.profiles.google = {
      sub: 'g-3',
      email: 'nopass@example.com',
      email_verified: true,
      name: 'No Pass',
    };
    await signIn('google');

    const login = await request(app)
      .post('/api/users/login')
      .send({user: {email: 'nopass@example.com', password: 'anything1'}});

    expect(login.status).toBe(401);
  });

  test.each([
    ['no email', 'google', {sub: 'g-4', name: 'X'}, 'no-email'],
    [
      'an unconfirmed email',
      'google',
      {sub: 'g-5', email: 'x@example.com', email_verified: false},
      'no-email',
    ],
    ['no email', 'facebook', {id: 'fb-2', name: 'Phone Only'}, 'no-email'],
    ['no profile', 'facebook', undefined, 'failed'],
  ] as const)(
    'with %s from %s, nobody is signed in and the sign-in page says why',
    async (_case, provider, profile, problem) => {
      providers.profiles[provider] = profile as Record<string, unknown>;

      const response = await signIn(provider);

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe(`${site}/login?social=${problem}`);
      expect(sessionToken(response)).toBeUndefined();
    }
  );

  test('a callback whose state this browser never started signs nobody in', async () => {
    providers.profiles.google = {
      sub: 'g-6',
      email: 'victim@example.com',
      email_verified: true,
    };
    const {cookie} = await start('google');

    const forged = await request(app)
      .get('/api/auth/google/callback')
      .query({code: 'attackers-code', state: 'another-state'})
      .set('Cookie', cookie);
    const noCookie = await request(app)
      .get('/api/auth/google/callback')
      .query({code: 'attackers-code', state: 'any'});

    for (const response of [forged, noCookie]) {
      expect(response.headers.location).toBe(`${site}/login?social=expired`);
      expect(sessionToken(response)).toBeUndefined();
    }
    expect(providers.calls).toHaveLength(0);
  });

  test('saying no at the provider goes back to the sign-in page', async () => {
    const {cookie} = await start('facebook');

    const response = await request(app)
      .get('/api/auth/facebook/callback')
      .query({error: 'access_denied'})
      .set('Cookie', cookie);

    expect(response.headers.location).toBe(`${site}/login?social=cancelled`);
  });

  test('an unknown provider is unavailable', async () => {
    const response = await request(app).get('/api/auth/myspace');

    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(`${site}/login?social=unavailable`);
  });
});
