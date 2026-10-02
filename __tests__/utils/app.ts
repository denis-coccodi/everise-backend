import {createApp} from '../../src/app';
import {DocumentStore} from '../../src/db';
import {MemoryStorage} from './memory-storage';

const db = new DocumentStore(new MemoryStorage());

const app = createApp(db);

async function clearDb() {
  await db.clear();
}

export {app, clearDb};
