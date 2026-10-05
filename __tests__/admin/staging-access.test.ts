import 'jest-extended';
import {CloudflareStagingAccess, Fetch} from '../../src/admin';

const settings = {apiToken: 'token', accountId: 'acc', groupId: 'grp'};
const groupUrl =
  'https://api.cloudflare.com/client/v4/accounts/acc/access/groups/grp';

function fakeCloudflare(status = {get: 200, put: 200}) {
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
    const code = method === 'GET' ? status.get : status.put;
    return {
      ok: code < 300,
      status: code,
      json: async () => ({
        result: {name: 'Staging testers', exclude: [], require: []},
      }),
    };
  };
  return {calls, fetchFn};
}

describe('CloudflareStagingAccess', () => {
  test('writes every email into the Access group, keeping its name', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(settings, fetchFn).sync([
      'a@x.test',
      'b@x.test',
    ]);

    expect(result).toStrictEqual({
      synced: true,
      message: 'Staging access updated: 2 people can open staging.',
    });
    expect(calls).toStrictEqual([
      {url: groupUrl, method: 'GET', body: undefined, auth: 'Bearer token'},
      {
        url: groupUrl,
        method: 'PUT',
        auth: 'Bearer token',
        body: {
          name: 'Staging testers',
          include: [{email: {email: 'a@x.test'}}, {email: {email: 'b@x.test'}}],
          exclude: [],
          require: [],
        },
      },
    ]);
  });

  test('says when it is not set up, without calling Cloudflare', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess({}, fetchFn).sync([
      'a@x.test',
    ]);

    expect(result.synced).toBe(false);
    expect(result.message).toContain("isn't connected");
    expect(calls).toHaveLength(0);
  });

  test('reports a refusal from Cloudflare', async () => {
    const {fetchFn} = fakeCloudflare({get: 200, put: 403});

    const result = await new CloudflareStagingAccess(settings, fetchFn).sync([
      'a@x.test',
    ]);

    expect(result.synced).toBe(false);
    expect(result.message).toContain('updating the group answered 403');
  });

  test('never empties the group', async () => {
    const {calls, fetchFn} = fakeCloudflare();

    const result = await new CloudflareStagingAccess(settings, fetchFn).sync(
      []
    );

    expect(result.synced).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
