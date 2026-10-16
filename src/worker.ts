import {env} from 'cloudflare:workers';
import {httpServerHandler} from 'cloudflare:node';
import {createApp} from './app';
import {AppJobs} from './app-options';
import {config} from './config';
import {DurableObjectDb, EveriseDb} from './db/everise-db';
import {R2Bucket, R2FileStore} from './files';
import {HubLiveFeed, LiveHub, connectToHub} from './live/live-hub';
import {isAllowedOrigin, isLiveRequest} from './live/live-requests';
import {HubMarket, MarketHistoryHub} from './market/market-hub';
import {HubPartyFinder, PartyFinderHub} from './party-finder/party-finder-hub';
import {AiBinding, WorkersAiModel} from './waking-sands';

// Express runs inside the Worker through Cloudflare's Node.js HTTP server
// support: the app listens on a virtual port that the handler forwards to.
const PORT = 8080;

const db = new DurableObjectDb(env.DB);
const hubs = env.LIVE;

// The files in public/, e.g. the Waking Sands characters' pictures.
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

// The app's scheduled jobs, which createApp fills in.
const jobs: AppJobs = {};

// FFXIV Venues' and Partake's answers, kept in the data centre's cache for
// five minutes (as long as the app keeps them). Each Worker instance keeps
// its own copy too, and both turn bursts away (429): instances starting
// cold read the cache instead of asking again. Load balancers' cookies are
// dropped, or the cache wouldn't keep the answer. A burst turned away
// clears within seconds: it's asked again after 1, then 3 seconds (waiting
// costs the Worker no CPU time).
const SOURCES_CACHE_CONTROL = 'public, max-age=300';
const SOURCES_RETRY_DELAYS_MS = [1000, 3000];
async function cachedSourceFetch(url: string) {
  const cache = caches.default;
  const key = new Request(url);
  const hit = await cache.match(key);
  if (hit) return hit;
  let response = await fetch(url);
  for (const delay of SOURCES_RETRY_DELAYS_MS) {
    if (response.status !== 429) break;
    await new Promise(resolve => setTimeout(resolve, delay));
    response = await fetch(url);
  }
  if (response.ok) {
    const copy = new Response(response.clone().body, response);
    copy.headers.delete('Set-Cookie');
    copy.headers.set('Cache-Control', SOURCES_CACHE_CONTROL);
    await cache.put(key, copy);
  }
  return response;
}

createApp(db, undefined, undefined, new HubLiveFeed(hubs), {
  jobs,
  fileStore,
  loadBundledPicture,
  wakingSands: {model: ai ? new WorkersAiModel(ai) : undefined},
  // The Party Finder board, in its Durable Object (the "PARTY_FINDER" binding).
  partyFinder: new HubPartyFinder(env.PARTY_FINDER),
  // The price histories, a Durable Object each (the "MARKET" binding).
  market: new HubMarket(env.MARKET),
  venues: cachedSourceFetch,
  events: cachedSourceFetch,
  // New passwords are checked against Have I Been Pwned's leaks.
  leakedPasswords: (url, init) => fetch(url, init),
}).listen(PORT);

const http = httpServerHandler({port: PORT}) as {
  fetch(request: Request, env: unknown, ctx: unknown): Promise<Response>;
};

interface Context {
  waitUntil(promise: Promise<unknown>): void;
}

// An uploaded image's, a game image's, an item icon's or a relayed
// picture's address: its content never changes.
const UPLOAD_PATH =
  /^\/api\/(media|profile-images|images|market\/icons|relays\/images)\/[\w.-]+$/;

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

  // The cron trigger (wrangler.jsonc): shared Party Finder listings that
  // ended are told to their sharers, and in the Discord; the relayed
  // Discord channels are read again.
  async scheduled(_controller: unknown, _env: unknown, ctx: Context) {
    ctx.waitUntil(
      (jobs.checkSharedListings?.() ?? Promise.resolve()).catch(error =>
        console.error('Party Finder: checking shared listings failed', error),
      ),
    );
    ctx.waitUntil(jobs.readRelays?.() ?? Promise.resolve());
  },
};

export {EveriseDb, LiveHub, MarketHistoryHub, PartyFinderHub};
