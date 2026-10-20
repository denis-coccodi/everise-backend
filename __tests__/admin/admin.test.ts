import 'jest-extended';
import request from 'supertest';
import {app, db, staging, usersClient} from '../utils';

// ADMIN_EMAILS is admin@example.com in the tests (utils/env.ts).
const ADMIN = {
  email: 'admin@example.com',
  username: 'Minfilia',
  password: 'echo-of-light',
};

async function adminToken() {
  const signedIn = await request(app)
    .post('/api/users/login')
    .send({user: {email: ADMIN.email, password: ADMIN.password}});
  if (signedIn.status === 200) return signedIn.body.user.token as string;
  const {user} = await usersClient.registerUser(
    ADMIN.email,
    ADMIN.username,
    ADMIN.password,
  );
  return user.token as string;
}

const as = (token: string) => ({
  get: (url: string) =>
    request(app).get(url).set('authorization', `Token ${token}`),
  put: (url: string) =>
    request(app).put(url).set('authorization', `Token ${token}`),
  post: (url: string) =>
    request(app).post(url).set('authorization', `Token ${token}`),
});

describe('roles', () => {
  test('a member is a user, and the ADMIN_EMAILS account an admin', async () => {
    const {user} = await usersClient.registerRandomUser();
    expect(user.role).toBe('user');

    const current = await as(await adminToken()).get('/api/user');
    expect(current.body.user.role).toBe('admin');
  });

  test('an admin makes a member a staging tester and back, updating staging access', async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();
    staging.syncs = [];

    const promoted = await admin
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .send({role: 'staging-tester'});

    expect(promoted.status).toBe(200);
    expect(promoted.body).toStrictEqual({
      user: {
        id: expect.any(String),
        username: user.username,
        email: user.email,
        image: expect.any(String),
        role: 'staging-tester',
        signInMethods: ['password'],
        emailConfirmed: true,
      },
      stagingAccess: {synced: true, message: 'Staging access updated.'},
    });
    // The whole list: admins and testers.
    expect(staging.syncs[staging.syncs.length - 1]).toIncludeAllMembers([
      ADMIN.email,
      user.email.toLowerCase(),
    ]);
    const own = await as(user.token).get('/api/user');
    expect(own.body.user.role).toBe('staging-tester');

    const demoted = await admin
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .send({role: 'user'});
    expect(demoted.body.user.role).toBe('user');
    expect(staging.syncs[staging.syncs.length - 1]).not.toContain(
      user.email.toLowerCase(),
    );
  });

  test('the member is told when an admin changes their role, not when it stays the same', async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();
    const role = (to: string) =>
      admin
        .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
        .send({role: to});
    const told = async () =>
      (await as(user.token).get('/api/notifications')).body.notifications;

    await role('user');
    expect(await told()).toEqual([]);

    await role('staging-tester');
    await role('user');
    const notifications = await told();
    expect(notifications.map((n: {role: string}) => n.role).sort()).toEqual([
      'staging-tester',
      'user',
    ]);
    expect(notifications[0]).toMatchObject({
      type: 'role',
      actors: [],
      actorCount: 0,
      article: null,
    });
  });

  test('the role is saved even when staging access fails, and the answer says so', async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();
    staging.result = {
      synced: false,
      message: "Staging access couldn't be updated.",
    };

    const response = await admin
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .send({role: 'staging-tester'});

    staging.result = {synced: true, message: 'Staging access updated.'};
    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('staging-tester');
    expect(response.body.stagingAccess.synced).toBe(false);
  });

  test('lists the members with their roles', async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();

    const response = await admin.get('/api/admin/users');

    expect(response.status).toBe(200);
    const users = response.body.users as {username: string; role: string}[];
    expect(users).toContainEqual(
      expect.objectContaining({username: user.username, role: 'user'}),
    );
    expect(users).toContainEqual(
      expect.objectContaining({username: ADMIN.username, role: 'admin'}),
    );
  });

  test('lists accounts made with a provider and unconfirmed sign-ups too, saying how they sign in', async () => {
    const admin = as(await adminToken());
    await db.create('users', {
      email: 'google-only@example.com',
      username: 'GoogleOnly',
      googleId: 'google-1',
    });
    await request(app)
      .post('/api/users')
      .send({
        user: {
          email: 'waiting@example.com',
          username: 'Waiting',
          password: 'a-long-password',
        },
      });

    const response = await admin.get('/api/admin/users?search=o');

    const users = response.body.users as Record<string, unknown>[];
    expect(users).toContainEqual(
      expect.objectContaining({
        username: 'GoogleOnly',
        signInMethods: ['google'],
        emailConfirmed: true,
      }),
    );
    expect(users).toContainEqual(
      expect.objectContaining({
        username: 'Waiting',
        signInMethods: ['password'],
        emailConfirmed: false,
      }),
    );
  });

  test('finds members by part of their username or email, any case, a page at a time', async () => {
    const admin = as(await adminToken());
    const tag = `zz${Date.now()}`;
    const names = ['Alisaie', 'Estinien', 'Krile'].map(name => `${name}${tag}`);
    for (const name of names) {
      await usersClient.registerUser(
        `${name.toLowerCase()}@example.com`,
        name,
        'password123',
      );
    }

    const all = await admin.get(`/api/admin/users?search=${tag.toUpperCase()}`);
    expect(all.status).toBe(200);
    expect(all.body.usersCount).toBe(3);
    expect(all.body.users.map((u: {username: string}) => u.username)).toEqual(
      names,
    );

    const byEmail = await admin.get(`/api/admin/users?search=estinien${tag}@`);
    expect(
      byEmail.body.users.map((u: {username: string}) => u.username),
    ).toEqual([names[1]]);

    const page = await admin.get(
      `/api/admin/users?search=${tag}&limit=2&offset=2`,
    );
    expect(page.body.usersCount).toBe(3);
    expect(page.body.users.map((u: {username: string}) => u.username)).toEqual([
      names[2],
    ]);

    expect((await admin.get('/api/admin/users?limit=0')).status).toBe(422);
    expect((await admin.get('/api/admin/users?limit=101')).status).toBe(422);
  });

  test('says whether role changes reach the staging Access list', async () => {
    const admin = as(await adminToken());

    expect(
      (await admin.get('/api/admin/users')).body.stagingAccessConnected,
    ).toBe(true);
    staging.connected = false;
    const response = await admin.get('/api/admin/users');
    staging.connected = true;
    expect(response.body.stagingAccessConnected).toBe(false);
  });

  test("can't change an admin, give Tataru (a character, not a member) a role, or give an unknown role", async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();

    const toAdmin = await admin
      .put(`/api/admin/users/${ADMIN.username}/role`)
      .send({role: 'user'});
    expect(toAdmin.status).toBe(422);
    expect(toAdmin.body.errors.body[0]).toContain('ADMIN_EMAILS');

    const tataru = await admin
      .put('/api/admin/users/Tataru/role')
      .send({role: 'staging-tester'});
    expect(tataru.status).toBe(404);

    const unknown = await admin
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .send({role: 'admin'});
    expect(unknown.status).toBe(422);
    expect(unknown.body.errors.body).toEqual([
      'Choose "user" or "staging-tester".',
    ]);
  });

  test('POST /api/admin/staging-access writes the testers to Access again', async () => {
    staging.syncs = [];
    const response = await as(await adminToken()).post(
      '/api/admin/staging-access',
    );

    expect(response.status).toBe(200);
    expect(response.body.stagingAccess.synced).toBe(true);
    expect(staging.syncs).toHaveLength(1);
  });
});

describe('only admins', () => {
  const endpoints: [string, string][] = [
    ['get', '/api/admin/users'],
    ['put', '/api/admin/users/someone/role'],
    ['post', '/api/admin/staging-access'],
  ];

  test.each(endpoints)(
    '%s %s is 403 for a member and 401 signed out',
    async (method, url) => {
      const {user} = await usersClient.registerRandomUser();
      const member = as(user.token) as unknown as Record<
        string,
        (url: string) => request.Test
      >;
      const signedOut = request(app) as unknown as Record<
        string,
        (url: string) => request.Test
      >;

      const forbidden = await member[method](url).send({role: 'user'});
      expect(forbidden.status).toBe(403);
      expect(forbidden.body.errors.body).toEqual([
        'Only an admin can do that.',
      ]);

      expect((await signedOut[method](url)).status).toBe(401);
    },
  );

  test("a staging tester isn't an admin", async () => {
    const admin = as(await adminToken());
    const {user} = await usersClient.registerRandomUser();
    await admin
      .put(`/api/admin/users/${encodeURIComponent(user.username)}/role`)
      .send({role: 'staging-tester'});

    expect((await as(user.token).get('/api/admin/users')).status).toBe(403);
  });
});
