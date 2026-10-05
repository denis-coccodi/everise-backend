import 'jest-extended';
import {CloudflareStagingAccess, Fetch} from '../../src/admin';

const policiesUrl =
  'https://api.cloudflare.com/client/v4/accounts/acc/access/policies';

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
const OTHER = {id: 'pol-other', name: 'Admins', decision: 'allow'};

const settings = (policyId = POLICY.id) => ({
  apiToken: 'token',
  accountId: 'acc',
  policyId,
});

type Status = {list?: number; put?: number};

// Cloudflare's Access policies API: the list, and updates.
function fakeCloudflare(status: Status = {}, errors: {message: string}[] = []) {
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
    const code = method === 'PUT' ? status.put ?? 200 : status.list ?? 200;
    return {
      ok: code < 300,
      status: code,
      json: async () =>
        code < 300 ? {result: [OTHER, POLICY]} : {success: false, errors},
    };
  };
  return {calls, fetchFn};
}

const sync = (policyId: string, fake: ReturnType<typeof fakeCloudflare>) =>
  new CloudflareStagingAccess(settings(policyId), fake.fetchFn).sync([
    'a@x.test',
    'b@x.test',
  ]);

describe('CloudflareStagingAccess', () => {
  test('finds the policy by id and replaces only its Include', async () => {
    const fake = fakeCloudflare();

    const result = await sync(POLICY.id, fake);

    expect(result).toStrictEqual({
      synced: true,
      message: 'Staging access updated: 2 people can open staging.',
    });
    expect(fake.calls).toStrictEqual([
      {
        url: `${policiesUrl}?per_page=1000`,
        method: 'GET',
        body: undefined,
        auth: 'Bearer token',
      },
      {
        url: `${policiesUrl}/${POLICY.id}`,
        method: 'PUT',
        auth: 'Bearer token',
        // Read-only fields (id, app_count, reusable, dates) aren't sent back.
        body: {
          name: 'Staging Testers',
          decision: 'allow',
          include: [{email: {email: 'a@x.test'}}, {email: {email: 'b@x.test'}}],
          exclude: [],
          require: [],
          session_duration: '24h',
        },
      },
    ]);
  });

  test.each([
    ' staging testers ',
    '"Staging Testers"',
    'STAGING TESTERS',
    ` "${POLICY.id}" `,
  ])('finds the policy by name or id as pasted: %s', async policyId => {
    const fake = fakeCloudflare();

    expect((await sync(policyId, fake)).synced).toBe(true);
    expect(fake.calls[1].url).toBe(`${policiesUrl}/${POLICY.id}`);
  });

  test('lists the policies the token can see when none matches', async () => {
    const fake = fakeCloudflare();

    const result = await sync('nothing-like-it', fake);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      'no Access policy matches CF_ACCESS_POLICY_ID "nothing-like-it" on account acc; ' +
        `the policies there are "Admins" (pol-other), "Staging Testers" (${POLICY.id})`
    );
    expect(fake.calls).toHaveLength(1);
  });

  test("gives Cloudflare's reason and the permission when it can't list", async () => {
    const fake = fakeCloudflare({list: 403}, [
      {message: 'Authentication error'},
    ]);

    const result = await sync(POLICY.id, fake);

    expect(result.message).toContain(
      'listing the Access policies answered 403: Authentication error (the API token needs "Access: Apps and Policies → Edit")'
    );
  });

  test('says which permission an update needs when it is refused', async () => {
    const fake = fakeCloudflare({put: 403}, [{message: 'Forbidden'}]);

    const result = await sync(POLICY.id, fake);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      'updating the policy "Staging Testers" answered 403: Forbidden (the API token needs "Access: Apps and Policies → Edit")'
    );
  });

  test("reports Cloudflare's own reason for another refused update", async () => {
    const fake = fakeCloudflare({put: 400}, [{message: 'include is invalid'}]);

    const result = await sync(POLICY.id, fake);

    expect(result.message).toContain(
      'updating the policy "Staging Testers" answered 400: include is invalid). The role is saved'
    );
  });

  test("says when it is not set up, naming what's missing, without calling Cloudflare", async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess({}, fetchFn).sync([
      'a@x.test',
    ]);

    expect(result.synced).toBe(false);
    expect(result.message).toContain(
      "isn't connected on this backend (missing CF_ACCESS_API_TOKEN, CF_ACCOUNT_ID, CF_ACCESS_POLICY_ID)"
    );
    expect(calls).toHaveLength(0);

    const partly = new CloudflareStagingAccess(
      {apiToken: 't', accountId: 'a'},
      fetchFn
    );
    expect(partly.connected).toBe(false);
    expect((await partly.sync(['a@x.test'])).message).toContain(
      '(missing CF_ACCESS_POLICY_ID)'
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
