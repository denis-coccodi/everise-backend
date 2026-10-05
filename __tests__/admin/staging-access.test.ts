import 'jest-extended';
import {CloudflareStagingAccess, Fetch} from '../../src/admin';

const groupsUrl =
  'https://api.cloudflare.com/client/v4/accounts/acc/access/groups';
const GROUPS = [
  {id: 'grp-other', name: 'Admins', exclude: [], require: []},
  {
    id: 'grp-1',
    name: 'Staging Testers',
    exclude: [{email: {email: 'no@x.test'}}],
    require: [],
  },
];
const settings = (groupId = 'grp-1') => ({
  apiToken: 'token',
  accountId: 'acc',
  groupId,
});

function fakeCloudflare(
  status = {list: 200, put: 200},
  errors: {message: string}[] = []
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
    const code = method === 'GET' ? status.list : status.put;
    return {
      ok: code < 300,
      status: code,
      json: async () =>
        code < 300 ? {result: GROUPS} : {success: false, errors},
    };
  };
  return {calls, fetchFn};
}

describe('CloudflareStagingAccess', () => {
  test('finds the group by id and writes every email into it, keeping its name and rules', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(settings(), fetchFn).sync([
      'a@x.test',
      'b@x.test',
    ]);

    expect(result).toStrictEqual({
      synced: true,
      message: 'Staging access updated: 2 people can open staging.',
    });
    expect(calls).toStrictEqual([
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
          include: [{email: {email: 'a@x.test'}}, {email: {email: 'b@x.test'}}],
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
  ])('finds the group by name or id as pasted: %s', async groupId => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(
      settings(groupId),
      fetchFn
    ).sync(['a@x.test']);

    expect(result.synced).toBe(true);
    expect(calls[1].url).toBe(`${groupsUrl}/grp-1`);
  });

  test("lists the account's groups when none matches", async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(
      settings('policy-123'),
      fetchFn
    ).sync(['a@x.test']);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      'no Access group matches CF_ACCESS_GROUP_ID "policy-123" on account acc; the groups there are "Admins" (grp-other), "Staging Testers" (grp-1)'
    );
    expect(calls).toHaveLength(1);
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

  test("reports Cloudflare's own reason for a refusal", async () => {
    const listing = fakeCloudflare({list: 403, put: 200}, [
      {message: 'Authentication error'},
    ]);
    const refused = await new CloudflareStagingAccess(
      settings(),
      listing.fetchFn
    ).sync(['a@x.test']);
    expect(refused.message).toContain(
      'listing the Access groups answered 403: Authentication error'
    );

    const updating = fakeCloudflare({list: 200, put: 400}, [
      {message: 'include is invalid'},
    ]);
    const failed = await new CloudflareStagingAccess(
      settings(),
      updating.fetchFn
    ).sync(['a@x.test']);
    expect(failed.message).toContain(
      'updating "Staging Testers" answered 400: include is invalid'
    );
  });

  test('never empties the group', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(settings(), fetchFn).sync(
      []
    );

    expect(result.synced).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
