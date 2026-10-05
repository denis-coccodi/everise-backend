import {readFile} from 'fs/promises';
import {join} from 'path';
import {StagingAccess, SyncResult} from '../../src/admin';
import {createApp} from '../../src/app';
import {DocumentStore} from '../../src/db';
import {LiveEvent, LiveFeed} from '../../src/live/live-feed';
import {OAuthFetch} from '../../src/social-login';
import {FakeXivApi} from './fake-xivapi';
import {MemoryStorage} from './memory-storage';

const db = new DocumentStore(new MemoryStorage());

const xivApi = new FakeXivApi();

// The app's clock. Tests that depend on the date set `clock.now`; undefined
// means the real time.
const clock: {now?: Date} = {};

// What the app published to the live feeds; `failing` makes publishing throw.
const live = {
  events: [] as LiveEvent[],
  failing: false,
};
const liveFeed: LiveFeed = {
  async publish(event) {
    if (live.failing) throw new Error('hub unavailable');
    live.events.push(event);
  },
};

// What the app wrote to Cloudflare Access; `result` is what it answers.
const staging = {
  syncs: [] as string[][],
  result: {synced: true, message: 'Staging access updated.'} as SyncResult,
  connected: true,
};
const stagingAccess: StagingAccess = {
  get connected() {
    return staging.connected;
  },
  async sync(emails) {
    staging.syncs.push(emails);
    return staging.result;
  },
};

// The sign-in providers. `profiles` is who signs in next with each (undefined
// fails the profile read); `calls` what the app asked them.
const providers = {
  profiles: {
    google: undefined as Record<string, unknown> | undefined,
    facebook: undefined as Record<string, unknown> | undefined,
    microsoft: undefined as Record<string, unknown> | undefined,
    discord: undefined as Record<string, unknown> | undefined,
  },
  calls: [] as {url: string; method: string; body?: string}[],
};
const oauthFetch: OAuthFetch = async (url, init) => {
  providers.calls.push({url, method: init?.method ?? 'GET', body: init?.body});
  const provider = (['google', 'microsoft', 'discord'] as const).find(name =>
    url.includes(name)
  );
  const profile = providers.profiles[provider ?? 'facebook'];
  const isToken = /\/(token|oauth\/access_token)\?|\/token$/.test(url);
  const ok = isToken || !!profile;
  return {
    ok,
    status: ok ? 200 : 401,
    json: async () => (isToken ? {access_token: 'access'} : profile),
  };
};
const socialLogin = {
  settings: {
    google: {clientId: 'google-client', clientSecret: 'google-secret'},
    facebook: {clientId: 'facebook-app', clientSecret: 'facebook-secret'},
    microsoft: {clientId: 'microsoft-app', clientSecret: 'microsoft-secret'},
    discord: {clientId: 'discord-app', clientSecret: 'discord-secret'},
  },
  fetch: oauthFetch,
};

// The Worker reads public/ through its assets binding; tests read the files.
async function loadBundledPicture(path: string) {
  return new Uint8Array(await readFile(join(__dirname, '../../public', path)));
}

const app = createApp(
  db,
  xivApi.httpGet,
  () => clock.now ?? new Date(),
  liveFeed,
  {loadBundledPicture, stagingAccess, socialLogin}
);

async function clearDb() {
  await db.clear();
}

export {app, clearDb, clock, live, providers, staging, xivApi};
