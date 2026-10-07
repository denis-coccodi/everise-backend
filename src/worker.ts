import {env} from 'cloudflare:workers';
import {httpServerHandler} from 'cloudflare:node';
import {createApp} from './app';
import {config} from './config';
import {DurableObjectDb, EveriseDb} from './db/everise-db';
import {R2Bucket, R2FileStore} from './files';
import {HubLiveFeed, LiveHub, connectToHub} from './live/live-hub';
import {isAllowedOrigin, isLiveRequest} from './live/live-requests';
import {AiBinding, WorkersAiModel} from './waking-sands';

// Express runs inside the Worker through Cloudflare's Node.js HTTP server
// support: the app listens on a virtual port that the handler forwards to.
const PORT = 8080;

const db = new DurableObjectDb(env.DB);
const hubs = env.LIVE;

// The files in public/, e.g. Tataru's first picture, stored as her upload.
const assets = env.ASSETS as {
  fetch(
    request: string,
  ): Promise<{ok: boolean; arrayBuffer(): Promise<ArrayBuffer>}>;
};
async function loadBundledPicture(path: string) {
  const response = await assets.fetch(`https://assets.invalid${path}`);
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

// Workers AI, for the Waking Sands characters (the "AI" binding).
const ai = env.AI as AiBinding | undefined;

// The uploaded images' bytes (the "IMAGES" R2 bucket).
const fileStore = new R2FileStore(env.IMAGES as R2Bucket);

createApp(db, undefined, undefined, new HubLiveFeed(hubs), {
  fileStore,
  loadBundledPicture,
  wakingSands: {model: ai ? new WorkersAiModel(ai) : undefined},
}).listen(PORT);

const http = httpServerHandler({port: PORT}) as {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

// An uploaded image's address: its content never changes.
const UPLOAD_PATH = /^\/api\/(media|profile-images)\/[\w-]+$/;

// Uploaded images are kept in the data centre's cache, so most views reach
// neither the app nor the bucket (R2 counts every read). Keyed by the URL
// alone: the answer is the same for everyone. For a day at most, so a
// deleted image (e.g. with an account) leaves the cache too.
const EDGE_CACHE_CONTROL = 'public, max-age=86400';
async function cachedUpload(
  url: URL,
  ctx: Context,
  load: () => Promise<Response>,
) {
  const cache = caches.default;
  const key = new Request(url.origin + url.pathname);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await load();
  if (response.ok) {
    const copy = new Response(response.clone().body, response);
    copy.headers.set('Cache-Control', EDGE_CACHE_CONTROL);
    ctx.waitUntil(cache.put(key, copy));
  }
  return response;
}

// WebSockets for the live updates go to the hub; everything else to Express.
export default {
  async fetch(request: Request, workerEnv: unknown, ctx: Context) {
    if (isLiveRequest(request)) {
      if (!isAllowedOrigin(request, config)) {
        return new Response('This origin may not connect.', {status: 403});
      }
      return connectToHub(hubs, request);
    }
    const url = new URL(request.url);
    if (request.method === 'GET' && UPLOAD_PATH.test(url.pathname)) {
      return cachedUpload(url, ctx, () => http.fetch(request, workerEnv, ctx));
    }
    return http.fetch(request, workerEnv, ctx);
  },
};

export {EveriseDb, LiveHub};
