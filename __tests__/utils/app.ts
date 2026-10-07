import {readFile} from 'fs/promises';
import {join} from 'path';
import {StagingAccess, SyncResult} from '../../src/admin';
import {createApp} from '../../src/app';
import {SqlDocumentStore} from '../../src/db';
import {LiveEvent, LiveFeed} from '../../src/live/live-feed';
import {DiscordFetch} from '../../src/discord';
import {EmailMessage, EmailSender} from '../../src/email';
import {GifFetch} from '../../src/media';
import {OAuthFetch} from '../../src/social-login';
import {CharacterModel, ModelMessage} from '../../src/waking-sands';
import {FakeXivApi} from './fake-xivapi';
import {SqliteStorage} from './sqlite-storage';

const db = new SqlDocumentStore(new SqliteStorage());

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
    url.includes(name),
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

// Discord: what the app sent to the webhook, and the widget it answers.
// `webhookStatus` and `widgetStatus` are its next answers' statuses.
const discord = {
  webhookStatus: 204,
  widgetStatus: 200,
  widget: {} as unknown,
  sent: [] as {url: string; body: Record<string, unknown>}[],
  widgetReads: 0,
};
const discordFetch: DiscordFetch = async (url, init) => {
  if (url.includes('/widget.json')) {
    discord.widgetReads++;
    return {
      ok: discord.widgetStatus < 300,
      status: discord.widgetStatus,
      json: async () => discord.widget,
    };
  }
  discord.sent.push({url, body: JSON.parse(init?.body ?? '{}')});
  return {
    ok: discord.webhookStatus < 300,
    status: discord.webhookStatus,
    json: async () => ({}),
  };
};

// GIPHY: `status` and `body` are its next answer; `calls` what the app
// asked it.
const giphy = {
  status: 200,
  body: {data: [], pagination: {total_count: 0, offset: 0}} as unknown,
  calls: [] as string[],
};
const gifFetch: GifFetch = async url => {
  giphy.calls.push(url);
  return {
    ok: giphy.status < 300,
    status: giphy.status,
    json: async () => giphy.body,
  };
};

// The emails the app sent; `failing` makes sending fail.
const mail = {
  sent: [] as EmailMessage[],
  failing: false,
};
const emailSender: EmailSender = {
  async send(message) {
    if (mail.failing) throw new Error('mail unavailable');
    mail.sent.push(message);
  },
};

// The Waking Sands' model. A character's line: `asked` is what it was asked,
// `answers` its next lines in order (then "Hello!"). The director's call
// (who speaks next): `directed` and `directions` (then "NONE"). `neurons`
// is what each call costs; `error` makes the characters' lines fail. The app
// may spend 1,000 Neurons a day.
const characters = {
  asked: [] as ModelMessage[][],
  answers: [] as string[],
  directed: [] as ModelMessage[][],
  directions: [] as string[],
  neurons: 5,
  error: undefined as Error | undefined,
};
const characterModel: CharacterModel = {
  async reply(messages) {
    if (messages[0].content.startsWith('You direct')) {
      characters.directed.push(messages);
      return {
        text: characters.directions.shift() ?? 'NONE',
        neurons: characters.neurons,
      };
    }
    characters.asked.push(messages);
    if (characters.error) throw characters.error;
    return {
      text: characters.answers.shift() ?? 'Hello!',
      neurons: characters.neurons,
    };
  },
};

// The token in the last confirmation link sent to `email`.
function lastConfirmationToken(email: string) {
  const message = [...mail.sent].reverse().find(m => m.to === email);
  return message?.text.match(/confirm-email\?token=([\w-]+)/)?.[1];
}

// The Worker reads public/ through its assets binding; tests read the files.
async function loadBundledPicture(path: string) {
  return new Uint8Array(await readFile(join(__dirname, '../../public', path)));
}

const app = createApp(
  db,
  xivApi.httpGet,
  () => clock.now ?? new Date(),
  liveFeed,
  {
    loadBundledPicture,
    stagingAccess,
    socialLogin,
    discord: {
      webhookUrl: 'https://discord.test/api/webhooks/1/secret',
      guildId: 'guild-1',
      fetch: discordFetch,
    },
    gifSearch: {apiKey: 'giphy-key', fetch: gifFetch},
    emailSender,
    wakingSands: {model: characterModel, dailyNeurons: 1000},
  },
);

async function clearDb() {
  await db.clear();
}

export {
  app,
  characters,
  clearDb,
  clock,
  db,
  discord,
  giphy,
  lastConfirmationToken,
  live,
  mail,
  providers,
  staging,
  xivApi,
};
