import 'jest-extended';
import {CloudflareStagingAccess, Fetch} from '../../src/admin';

const accessUrl = 'https://api.cloudflare.com/client/v4/accounts/acc/access';
const groupsUrl = `${accessUrl}/groups`;
const policiesUrl = `${accessUrl}/policies`;

const GROUPS = [
  {id: 'grp-other', name: 'Admins', exclude: [], require: []},
  {
    id: 'grp-1',
    name: 'Staging Testers',
    exclude: [{email: {email: 'no@x.test'}}],
    require: [],
  },
];

// A reusable policy as Cloudflare lists it: settings an update takes, and
// read-only fields it must not be sent.
const POLICY = {
  id: '584f913c-6d75-4aed-b94c-697f2dd01fdd',
  name: 'Staging Testers',
  decision: 'allow',
  include: [{email: {email: 'old@x.test'}}],
  exclude: [],
  require: [],
  session_duration: '24h',
  app_count: 2,
  reusable: true,
  created_at: '2026-10-03T17:04:00Z',
  updated_at: '2026-10-05T16:20:00Z',
};

const settings = (groupId = 'grp-1') => ({
  apiToken: 'token',
  accountId: 'acc',
  groupId,
});

type Status = {groups?: number; policies?: number; put?: number};

// Cloudflare's Access API: groups and policies listed, and updates. With no
// groups, only the policy is there (the dashboard's "Policies" page).
function fakeCloudflare(
  status: Status = {},
  errors: {message: string}[] = [],
  groups = GROUPS
) {
  const calls: {url: string; method: string; body?: unknown; auth?: string}[] =
    [];
  const fetchFn: Fetch = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push({
      url,
      method,
      body: init?.body ? JSON.parse(init.body) : undefined,
      auth: init?.headers?.Authorization,
    });
    const code =
      method === 'PUT'
        ? status.put ?? 200
        : url.startsWith(policiesUrl)
        ? status.policies ?? 200
        : status.groups ?? 200;
    const result = url.startsWith(policiesUrl) ? [POLICY] : groups;
    return {
      ok: code < 300,
      status: code,
      json: async () => (code < 300 ? {result} : {success: false, errors}),
    };
  };
  return {calls, fetchFn};
}

const sync = (groupId: string, fake: ReturnType<typeof fakeCloudflare>) =>
  new CloudflareStagingAccess(settings(groupId), fake.fetchFn).sync([
    'a@x.test',
    'b@x.test',
  ]);

const include = [{email: {email: 'a@x.test'}}, {email: {email: 'b@x.test'}}];

describe('CloudflareStagingAccess', () => {
  describe('an Access group', () => {
    test('is found by id and gets every email, keeping its name and rules', async () => {
      const fake = fakeCloudflare();

      const result = await sync('grp-1', fake);

      expect(result).toStrictEqual({
        synced: true,
        message: 'Staging access updated: 2 people can open staging.',
      });
      expect(fake.calls).toStrictEqual([
        {
          url: `${groupsUrl}?per_page=1000`,
          method: 'GET',
          body: undefined,
          auth: 'Bearer token',
        },
        {
          url: `${groupsUrl}/grp-1`,
          method: 'PUT',
          auth: 'Bearer token',
          body: {
            name: 'Staging Testers',
            include,
            exclude: [{email: {email: 'no@x.test'}}],
            require: [],
          },
        },
      ]);
    });

    test.each([
      ' staging testers ',
      '"Staging Testers"',
      'STAGING TESTERS',
      ' "grp-1" ',
    ])('is found by name or id as pasted: %s', async groupId => {
      const fake = fakeCloudflare();

      expect((await sync(groupId, fake)).synced).toBe(true);
      expect(fake.calls[1].url).toBe(`${groupsUrl}/grp-1`);
    });
  });

  describe('a reusable policy', () => {
    test('is found by id when no group matches, and only its Include changes', async () => {
      const fake = fakeCloudflare({}, [], []);

      const result = await sync(POLICY.id, fake);

      expect(result.synced).toBe(true);
      expect(fake.calls.map(c => `${c.method} ${c.url}`)).toEqual([
        `GET ${groupsUrl}?per_page=1000`,
        `GET ${policiesUrl}?per_page=1000`,
        `PUT ${policiesUrl}/${POLICY.id}`,
      ]);
      // Read-only fields (id, app_count, reusable, dates) aren't sent back.
      expect(fake.calls[2].body).toStrictEqual({
        name: 'Staging Testers',
        decision: 'allow',
        include,
        exclude: [],
        require: [],
        session_duration: '24h',
      });
    });

    test('is found by name too', async () => {
      const fake = fakeCloudflare({}, [], []);

      expect((await sync('staging testers', fake)).synced).toBe(true);
      expect(fake.calls[2].url).toBe(`${policiesUrl}/${POLICY.id}`);
    });

    test("is still found when the token can't list groups", async () => {
      const fake = fakeCloudflare({groups: 403});

      expect((await sync(POLICY.id, fake)).synced).toBe(true);
    });

    test('says which permission an update needs when it is refused', async () => {
      const fake = fakeCloudflare({put: 403}, [{message: 'Forbidden'}], []);

      const result = await sync(POLICY.id, fake);

      expect(result.synced).toBe(false);
      expect(result.message).toContain(
        'updating the policy "Staging Testers" answered 403: Forbidden (the API token needs "Access: Apps and Policies → Edit")'
      );
    });
  });

  test('lists the groups and policies the token can see when nothing matches', async () => {
    const fake = fakeCloudflare();

    const result = await sync('nothing-like-it', fake);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      'no Access group or policy matches CF_ACCESS_GROUP_ID "nothing-like-it" on account acc; ' +
        'the Access groups there are "Admins" (grp-other), "Staging Testers" (grp-1); ' +
        `the policies there are "Staging Testers" (${POLICY.id})`
    );
    expect(fake.calls.every(c => c.method === 'GET')).toBe(true);
  });

  test("gives Cloudflare's reasons when it can't list either", async () => {
    const fake = fakeCloudflare({groups: 403, policies: 403}, [
      {message: 'Authentication error'},
    ]);

    const result = await sync('grp-1', fake);

    expect(result.message).toContain(
      'listing the Access groups answered 403: Authentication error; ' +
        'listing the policies answered 403: Authentication error (the API token needs "Access: Apps and Policies → Edit")'
    );
  });

  test("reports Cloudflare's own reason for a refused group update", async () => {
    const fake = fakeCloudflare({put: 400}, [{message: 'include is invalid'}]);

    const result = await sync('grp-1', fake);

    expect(result.message).toContain(
      'updating the group "Staging Testers" answered 400: include is invalid'
    );
  });

  test("says when it is not set up, naming what's missing, without calling Cloudflare", async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess({}, fetchFn).sync([
      'a@x.test',
    ]);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      "isn't connected on this backend (missing CF_ACCESS_API_TOKEN, CF_ACCOUNT_ID, CF_ACCESS_GROUP_ID)"
    );
    expect(calls).toHaveLength(0);

    const partly = new CloudflareStagingAccess(
      {apiToken: 't', accountId: 'a'},
      fetchFn
    );
    expect(partly.connected).toBe(false);
    expect((await partly.sync(['a@x.test'])).message).toContain(
      '(missing CF_ACCESS_GROUP_ID)'
    );
    expect(new CloudflareStagingAccess(settings(), fetchFn).connected).toBe(
      true
    );
  });

  test('never empties the list', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(settings(), fetchFn).sync(
      []
    );

    expect(result.synced).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
