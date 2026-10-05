import {readFile} from 'fs/promises';
import {join} from 'path';
import {StagingAccess, SyncResult} from '../../src/admin';
import {createApp} from '../../src/app';
import {DocumentStore} from '../../src/db';
import {LiveEvent, LiveFeed} from '../../src/live/live-feed';
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
};
const stagingAccess: StagingAccess = {
  async sync(emails) {
    staging.syncs.push(emails);
    return staging.result;
  },
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
  {loadBundledPicture, stagingAccess}
);

async function clearDb() {
  await db.clear();
}

export {app, clearDb, clock, live, staging, xivApi};
