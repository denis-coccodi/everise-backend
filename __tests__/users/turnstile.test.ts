import 'jest-extended';
import request from 'supertest';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {TurnstileFetch} from '../../src/turnstile';
import {SqliteStorage} from '../utils/sqlite-storage';

// Cloudflare's siteverify: `answers` maps a token to what it says about it
// (unknown tokens fail); `status` is its HTTP status; `calls` what the app
// sent it.
const siteverify = {
  answers: new Map<string, Record<string, unknown>>(),
  status: 200,
  calls: [] as URLSearchParams[],
};
const turnstileFetch: TurnstileFetch = async (_url, init) => {
  const body = new URLSearchParams(init.body);
  siteverify.calls.push(body);
  const answer = siteverify.answers.get(body.get('response') ?? '');
  // Tokens are single-use: a second check of the same one fails.
  siteverify.answers.delete(body.get('response') ?? '');
  return {
    ok: siteverify.status < 300,
    status: siteverify.status,
    json: async () =>
      answer ?? {success: false, 'error-codes': ['invalid-input-response']},
  };
};

const app = createApp(
  new SqlDocumentStore(new SqliteStorage()),
  undefined,
  undefined,
  undefined,
  {
    turnstile: {
      secretKey: 'turnstile-secret',
      hostnames: ['everise.test'],
      fetch: turnstileFetch,
    },
  },
);

let tokens = 0;
// A token siteverify passes once, for this form, from this site.
function tokenFor(action: string, hostname = 'everise.test') {
  const token = `token-${++tokens}`;
  siteverify.answers.set(token, {success: true, action, hostname});
  return token;
}

let users = 0;
function newUser() {
  users++;
  return {
    email: `bot-check-${users}@example.com`,
    username: `botcheck${users}`,
    password: 'a-long-password-1',
  };
}

const signUp = (user: object, turnstileToken?: string) =>
  request(app).post('/api/users').send({user, turnstileToken});
const signIn = (user: object, turnstileToken?: string) =>
  request(app).post('/api/users/login').send({user, turnstileToken});

describe('the bot check (Turnstile)', () => {
  beforeEach(() => {
    siteverify.status = 200;
    siteverify.calls = [];
  });

  test('a sign-up with a passing token goes through, and the secret and visitor reach siteverify', async () => {
    const response = await signUp(newUser(), tokenFor('signup')).set(
      'cf-connecting-ip',
      '203.0.113.7',
    );

    expect(response.status).toBe(201);
    expect(siteverify.calls).toHaveLength(1);
    expect(siteverify.calls[0].get('secret')).toBe('turnstile-secret');
    expect(siteverify.calls[0].get('remoteip')).toBe('203.0.113.7');
  });

  test('sign-up, sign-in and resending a link without a token are refused before anything happens', async () => {
    const user = newUser();

    const responses = [
      await signUp(user),
      await signIn(user),
      await request(app)
        .post('/api/users/confirm-email/resend')
        .send({user: {email: user.email}}),
    ];

    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(response.body.errors.body).toStrictEqual([
        "Complete the check that you're not a bot, then try again.",
      ]);
    }
    expect(siteverify.calls).toBeEmpty();
    // The refused sign-up made no account.
    expect((await signUp(user, tokenFor('signup'))).status).toBe(201);
  });

  test('a used token, another form’s, or another site’s is refused', async () => {
    const user = newUser();
    const used = tokenFor('signup');
    expect((await signUp(user, used)).status).toBe(201);

    const refused = [
      await signIn(user, used),
      await signIn(user, tokenFor('signup')),
      await signIn(user, tokenFor('login', 'evil.example')),
      await signIn(user, 'made-up'),
    ];

    for (const response of refused) {
      expect(response.status).toBe(403);
      expect(response.body.errors.body).toStrictEqual([
        "The check that you're not a bot didn't pass. Try it again.",
      ]);
    }
    expect((await signIn(user, tokenFor('login'))).status).toBe(200);
  });

  test('resending a link with a passing token answers as before', async () => {
    const response = await request(app)
      .post('/api/users/confirm-email/resend')
      .send({
        user: {email: 'nobody@example.com'},
        turnstileToken: tokenFor('resend'),
      });

    expect(response.status).toBe(202);
  });

  test('when siteverify is down, forms are refused (closed), with a message to retry', async () => {
    siteverify.status = 500;

    const response = await signUp(newUser(), tokenFor('signup'));

    expect(response.status).toBe(502);
    expect(response.body.errors.body).toStrictEqual([
      "The check that you're not a bot isn't available right now. Try again in a minute.",
    ]);
  });

  test('a token longer than Turnstile makes is a validation error', async () => {
    const response = await signUp(newUser(), 'x'.repeat(2049));

    expect(response.status).toBe(422);
  });
});
