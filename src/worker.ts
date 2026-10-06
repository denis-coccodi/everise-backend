import {env} from 'cloudflare:workers';
import type {DurableObjectNamespace} from 'cloudflare:workers';
import {httpServerHandler} from 'cloudflare:node';
import {createApp} from './app';
import {config} from './config';
import {Db} from './db';
import {DurableObjectDb, EveriseDb} from './db/everise-db';
import {HubLiveFeed, LiveHub, connectToHub} from './live/live-hub';
import {isAllowedOrigin, isLiveRequest} from './live/live-requests';
import {AiBinding, WorkersAiModel} from './waking-sands';

// Express runs inside the Worker through Cloudflare's Node.js HTTP server
// support: the app listens on a virtual port that the handler forwards to.
const PORT = 8080;

const db = new DurableObjectDb(env.DB as DurableObjectNamespace<Db>);
const hubs = env.LIVE as DurableObjectNamespace<LiveHub>;

// The files in public/, e.g. Tataru's first picture, stored as her upload.
const assets = env.ASSETS as {
  fetch(
    request: string
  ): Promise<{ok: boolean; arrayBuffer(): Promise<ArrayBuffer>}>;
};
async function loadBundledPicture(path: string) {
  const response = await assets.fetch(`https://assets.invalid${path}`);
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

// Workers AI, for the Waking Sands characters (the "AI" binding).
const ai = env.AI as AiBinding | undefined;

createApp(db, undefined, undefined, new HubLiveFeed(hubs), {
  loadBundledPicture,
  characterModel: ai ? new WorkersAiModel(ai) : undefined,
}).listen(PORT);

const http = httpServerHandler({port: PORT}) as {
  fetch(request: WorkerRequest, env: unknown, ctx: unknown): Promise<Response>;
};

// WebSockets for the live updates go to the hub; everything else to Express.
export default {
  fetch(request: WorkerRequest, workerEnv: unknown, ctx: unknown) {
    if (isLiveRequest(request)) {
      if (!isAllowedOrigin(request, config)) {
        return new Response('This origin may not connect.', {status: 403});
      }
      return connectToHub(hubs, request);
    }
    return http.fetch(request, workerEnv, ctx);
  },
};

export {EveriseDb, LiveHub};
