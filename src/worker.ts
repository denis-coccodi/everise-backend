import {env} from 'cloudflare:workers';
import type {DurableObjectNamespace} from 'cloudflare:workers';
import {httpServerHandler} from 'cloudflare:node';
import {createApp} from './app';
import {Db} from './db';
import {DurableObjectDb, EveriseDb} from './db/everise-db';

// Express runs inside the Worker through Cloudflare's Node.js HTTP server
// support: the app listens on a virtual port that the handler forwards to.
const PORT = 8080;

const db = new DurableObjectDb(env.DB as DurableObjectNamespace<Db>);

createApp(db).listen(PORT);

export default httpServerHandler({port: PORT});

export {EveriseDb};
