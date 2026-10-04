import {createApp} from '../../src/app';
import {DocumentStore} from '../../src/db';
import {FakeXivApi} from './fake-xivapi';
import {MemoryStorage} from './memory-storage';

const db = new DocumentStore(new MemoryStorage());

const xivApi = new FakeXivApi();

const app = createApp(db, xivApi.httpGet);

async function clearDb() {
  await db.clear();
}

export {app, clearDb, xivApi};
