import {createApp} from '../../src/app';
import {DocumentStore} from '../../src/db';
import {FakeXivApi} from './fake-xivapi';
import {MemoryStorage} from './memory-storage';

const db = new DocumentStore(new MemoryStorage());

const xivApi = new FakeXivApi();

// The app's clock. Tests that depend on the date set `clock.now`; undefined
// means the real time.
const clock: {now?: Date} = {};

const app = createApp(db, xivApi.httpGet, () => clock.now ?? new Date());

async function clearDb() {
  await db.clear();
}

export {app, clearDb, clock, xivApi};
